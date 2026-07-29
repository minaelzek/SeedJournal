"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  DownloadSimple,
  Key,
  LockKey,
  SignOut,
  Trash,
} from "@phosphor-icons/react";
import { ArchiveView, EntryReader } from "@/features/archive";
import type { GardenMemoryRecord } from "@/features/garden";
import { JournalRitual, type DecryptedJournalEntry } from "@/features/journal";
import { AppFrame, SeedJournalHeader, TreeFirstHome } from "@/features/shell";
import type {
  EncryptedEntryEnvelope,
  JournalEntryPayloadV1,
  TreeGrowthEvent,
  TreeSnapshot,
} from "@/lib/contracts";
import {
  createVault,
  decryptEntryPayload,
  encryptEntryPayload,
  rewrapVault,
  unlockVault,
  type ClientVaultMetadata,
} from "@/lib/crypto";
import {
  buildEncryptedArchive,
  buildReadableMarkdown,
  clearEncryptedLocalData,
} from "@/lib/storage";
import "./app.css";

type Route =
  | { name: "home" }
  | { name: "new"; parentEntryId?: string }
  | { name: "archive" }
  | { name: "entry"; entryId: string }
  | { name: "settings" };

interface BootstrapResponse {
  account: { id: string; treeSeed: string };
  vault: { configured: boolean };
  journal: { entryCount: number };
  csrfToken: string;
}

type StoredVault = ClientVaultMetadata & {
  revision: number;
  updatedAt: number;
};

interface SeedJournalAppProps {
  initialPath: string;
  displayName: string;
}

export function SeedJournalApp({
  initialPath,
  displayName,
}: SeedJournalAppProps) {
  const [route, setRoute] = useState<Route>(() => routeFromPath(initialPath));
  const [bootstrap, setBootstrap] = useState<BootstrapResponse>();
  const [vault, setVault] = useState<StoredVault | null>();
  const [vaultKey, setVaultKey] = useState<CryptoKey | null>(null);
  const [envelopes, setEnvelopes] = useState<EncryptedEntryEnvelope[]>([]);
  const envelopeRef = useRef(new Map<string, EncryptedEntryEnvelope>());
  const [entries, setEntries] = useState<DecryptedJournalEntry[]>([]);
  const [growthEvents, setGrowthEvents] = useState<TreeGrowthEvent[]>([]);
  const [loadingMessage, setLoadingMessage] = useState("Opening your garden…");
  const [error, setError] = useState<string>();
  const [activeEntryId, setActiveEntryId] = useState(() => crypto.randomUUID());

  const navigate = useCallback((next: Route) => {
    const path = pathForRoute(next);
    window.history.pushState({}, "", path);
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetchJson<BootstrapResponse>("/api/bootstrap");
        setBootstrap(response);
        if (!response.vault.configured) {
          setVault(null);
          return;
        }
        const vaultResponse = await fetchJson<{ vault: StoredVault | null }>(
          "/api/vault",
        );
        setVault(vaultResponse.vault);
      } catch {
        if (process.env.NODE_ENV === "development") {
          const created = await createVault("seed-journal-local-preview");
          const now = Date.now();
          const previewAccount: BootstrapResponse = {
            account: {
              id: "00000000-0000-4000-8000-000000000001",
              treeSeed: "seed-journal-preview-tree",
            },
            vault: { configured: true },
            journal: { entryCount: 1 },
            csrfToken: "",
          };
          setBootstrap(previewAccount);
          setVault({ ...created.metadata, revision: 1, updatedAt: now });
          setVaultKey(created.vaultKey);
          setEntries([previewEntry(now)]);
          setGrowthEvents(previewGrowth(now));
          setLoadingMessage("");
        } else {
          setError("Your private garden could not be opened. Please try again.");
        }
      }
    })();
  }, []);

  const mutate = useCallback(
    async <T,>(url: string, method: string, body: unknown): Promise<T> => {
      if (!bootstrap) throw new Error("The private session is not ready.");
      return fetchJson<T>(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-seedjournal-csrf": bootstrap.csrfToken,
        },
        body: JSON.stringify(body),
      });
    },
    [bootstrap],
  );

  const loadJournal = useCallback(
    async (key: CryptoKey) => {
      if (!bootstrap) return;
      setLoadingMessage("Restoring your memories…");
      const allEnvelopes: EncryptedEntryEnvelope[] = [];
      let cursor: string | null = null;
      do {
        const query = cursor
          ? `/api/entries?limit=100&cursor=${encodeURIComponent(cursor)}`
          : "/api/entries?limit=100";
        const page: {
          entries: EncryptedEntryEnvelope[];
          nextCursor: string | null;
        } = await fetchJson(query);
        allEnvelopes.push(...page.entries);
        cursor = page.nextCursor;
      } while (cursor);

      const decrypted: DecryptedJournalEntry[] = [];
      for (const envelope of allEnvelopes) {
        try {
          const payload = await decryptEntryPayload(
            key,
            bootstrap.account.id,
            envelope,
          );
          decrypted.push({
            id: envelope.id,
            payload,
            createdAt: envelope.clientCreatedAt,
            updatedAt: envelope.clientUpdatedAt,
            ...(envelope.completedAt === undefined
              ? {}
              : { completedAt: envelope.completedAt }),
            ...(envelope.localDay === undefined
              ? {}
              : { localDay: envelope.localDay }),
          });
        } catch {
          // A damaged record is isolated without blocking the rest of the journal.
        }
      }

      const events: TreeGrowthEvent[] = [];
      let after = 0;
      let hasMore = true;
      while (hasMore) {
        const page: {
          nextSequence: number;
          events: TreeGrowthEvent[];
          hasMore: boolean;
        } = await fetchJson(`/api/growth?limit=100&after=${after}`);
        events.push(...page.events);
        after = page.nextSequence;
        hasMore = page.hasMore;
      }

      envelopeRef.current = new Map(
        allEnvelopes.map((envelope) => [envelope.id, envelope]),
      );
      setEnvelopes(allEnvelopes);
      setEntries(
        decrypted.sort(
          (left, right) =>
            (right.completedAt ?? right.updatedAt) -
            (left.completedAt ?? left.updatedAt),
        ),
      );
      setGrowthEvents(events);
      setLoadingMessage("");
    },
    [bootstrap],
  );

  const createPrivateVault = async (passphrase: string) => {
    if (!bootstrap) return;
    const created = await createVault(passphrase);
    const response = await mutate<{ vault: StoredVault }>(
      "/api/vault",
      "POST",
      created.metadata,
    );
    setVault(response.vault);
    setVaultKey(created.vaultKey);
    await loadJournal(created.vaultKey);
  };

  const unlockPrivateVault = async (passphrase: string) => {
    if (!vault) return;
    const key = await unlockVault(vault, passphrase);
    setVaultKey(key);
    await loadJournal(key);
  };

  const saveDraft = useCallback(
    async (entryId: string, payload: JournalEntryPayloadV1) => {
      if (!bootstrap || !vaultKey) return;
      const existing = envelopeRef.current.get(entryId);
      const now = Date.now();
      const envelope = await encryptEntryPayload(
        vaultKey,
        bootstrap.account.id,
        payload,
        {
          id: entryId,
          state: "draft",
          revision: existing ? existing.revision + 1 : 1,
          clientCreatedAt: existing?.clientCreatedAt ?? now,
          clientUpdatedAt: now,
        },
      );
      const response = existing
        ? await mutate<{ entry: EncryptedEntryEnvelope }>(
            `/api/entries/${entryId}`,
            "PUT",
            { expectedRevision: existing.revision, envelope },
          )
        : await mutate<{ entry: EncryptedEntryEnvelope }>(
            "/api/entries",
            "POST",
            envelope,
          );
      envelopeRef.current.set(entryId, response.entry);
      setEnvelopes(Array.from(envelopeRef.current.values()));
    },
    [bootstrap, mutate, vaultKey],
  );

  const completeEntry = useCallback(
    async (entryId: string, payload: JournalEntryPayloadV1, localDay: string) => {
      if (!bootstrap || !vaultKey || !payload.growth) return;
      let existing = envelopeRef.current.get(entryId);
      if (!existing) {
        await saveDraft(entryId, payload);
        existing = envelopeRef.current.get(entryId);
      }
      if (!existing) throw new Error("The draft could not be prepared.");
      const completedAt = Date.now();
      const envelope = await encryptEntryPayload(
        vaultKey,
        bootstrap.account.id,
        payload,
        {
          id: entryId,
          state: "complete",
          revision: existing.revision + 1,
          clientCreatedAt: existing.clientCreatedAt,
          clientUpdatedAt: completedAt,
          completedAt,
          localDay,
        },
      );
      const response = await mutate<{
        entry: EncryptedEntryEnvelope;
        events: TreeGrowthEvent[];
      }>(`/api/entries/${entryId}/complete`, "POST", {
        expectedRevision: existing.revision,
        envelope,
        completion: {
          id: payload.growth.completionId,
          memoryForm: payload.growth.memoryForm,
          growthUnits: payload.growth.growthUnits,
          seed: payload.growth.seed,
        },
      });
      envelopeRef.current.set(entryId, response.entry);
      setEnvelopes(Array.from(envelopeRef.current.values()));
      setEntries((current) => [
        {
          id: entryId,
          payload,
          createdAt: existing.clientCreatedAt,
          updatedAt: completedAt,
          completedAt,
          localDay,
        },
        ...current.filter((entry) => entry.id !== entryId),
      ]);
      setGrowthEvents((current) => [...current, ...response.events]);
      setActiveEntryId(crypto.randomUUID());
      navigate({ name: "home" });
    },
    [bootstrap, mutate, navigate, saveDraft, vaultKey],
  );

  const updateCompletedEntry = async (
    entryId: string,
    payload: JournalEntryPayloadV1,
  ) => {
    if (!bootstrap || !vaultKey) return;
    const existing = envelopeRef.current.get(entryId);
    if (!existing?.completedAt || !existing.localDay) return;
    const now = Date.now();
    const envelope = await encryptEntryPayload(
      vaultKey,
      bootstrap.account.id,
      payload,
      {
        id: entryId,
        state: "complete",
        revision: existing.revision + 1,
        clientCreatedAt: existing.clientCreatedAt,
        clientUpdatedAt: now,
        completedAt: existing.completedAt,
        localDay: existing.localDay,
      },
    );
    const response = await mutate<{ entry: EncryptedEntryEnvelope }>(
      `/api/entries/${entryId}`,
      "PUT",
      { expectedRevision: existing.revision, envelope },
    );
    envelopeRef.current.set(entryId, response.entry);
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId ? { ...entry, payload, updatedAt: now } : entry,
      ),
    );
  };

  const deleteEntry = async (entryId: string) => {
    const existing = envelopeRef.current.get(entryId);
    if (!existing) return;
    await mutate(`/api/entries/${entryId}`, "DELETE", {
      expectedRevision: existing.revision,
    });
    envelopeRef.current.delete(entryId);
    setEnvelopes(Array.from(envelopeRef.current.values()));
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    setGrowthEvents((current) =>
      current.map((event) =>
        event.entryId === entryId ? { ...event, entryId: null } : event,
      ),
    );
  };

  const snapshot = useMemo<TreeSnapshot>(
    () => ({
      treeId: bootstrap?.account.id ?? "seed-journal",
      rootSeed: bootstrap?.account.treeSeed ?? "moonlit-sapling",
      algorithmVersion: 1,
      totalEntries: entries.filter((entry) => entry.completedAt).length,
      distinctJournalDays: new Set(
        entries.map((entry) => entry.localDay).filter(Boolean),
      ).size,
      events: growthEvents,
    }),
    [bootstrap, entries, growthEvents],
  );

  const memories = useMemo<GardenMemoryRecord[]>(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return growthEvents.flatMap((event) => {
      if (!event.entryId || !event.kind.startsWith("memory_")) return [];
      const entry = byId.get(event.entryId);
      if (!entry) return [];
      const form = event.kind.replace("memory_", "").replaceAll("_", "-") as
        | "leaf"
        | "bud"
        | "blossom"
        | "luminous-blossom";
      return [
        {
          entryId: entry.id,
          eventId: event.id,
          dateLabel: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
          }).format(event.occurredAt),
          title: entry.payload.title || entry.payload.prompt.renderedText,
          seedInsight: entry.payload.seedInsight,
          form,
        },
      ];
    });
  }, [entries, growthEvents]);

  if (error) return <StatusScreen title="The garden is resting" detail={error} />;
  if (!bootstrap || vault === undefined) {
    return <StatusScreen title="Seed Journal" detail={loadingMessage} busy />;
  }
  if (vault === null) {
    return (
      <VaultScreen
        mode="setup"
        onSubmit={createPrivateVault}
        detail="Create a private passphrase. It encrypts every reflection before it leaves this device."
      />
    );
  }
  if (!vaultKey) {
    return (
      <VaultScreen
        mode="unlock"
        onSubmit={unlockPrivateVault}
        detail="Your journal is encrypted. Unlock it to return to your tree."
      />
    );
  }

  const openEntry = (entryId: string) => navigate({ name: "entry", entryId });
  const revisit = (entryId: string) => {
    setActiveEntryId(crypto.randomUUID());
    navigate({ name: "new", parentEntryId: entryId });
  };

  if (route.name === "new") {
    return (
      <AppFrame snapshot={snapshot} gardenMode="ambient">
        <main className="sj-route-surface" id="main-content">
          <JournalRitual
            key={activeEntryId}
            entryId={activeEntryId}
            localDay={localDay()}
            identitySeed={bootstrap.account.treeSeed}
            kind={route.parentEntryId ? "revisit" : "entry"}
            parentEntryId={route.parentEntryId}
            previousEntries={entries}
            previousFollowUpIds={entries
              .map((entry) => entry.payload.followUp?.id)
              .filter((id): id is string => Boolean(id))}
            onAutosave={({ entry }) => saveDraft(activeEntryId, entry)}
            onComplete={({ entry, localDay: day }) =>
              completeEntry(activeEntryId, entry, day)
            }
            onExit={() => navigate({ name: "home" })}
          />
        </main>
      </AppFrame>
    );
  }

  if (route.name === "archive") {
    return (
      <ArchiveView
        entries={entries}
        onOpenEntry={openEntry}
        onNewEntry={() => {
          setActiveEntryId(crypto.randomUUID());
          navigate({ name: "new" });
        }}
        onBack={() => navigate({ name: "home" })}
      />
    );
  }

  if (route.name === "entry") {
    const entry = entries.find((item) => item.id === route.entryId);
    if (!entry) {
      return (
        <StatusScreen
          title="Memory unavailable"
          detail="This memory may have been removed."
          action={() => navigate({ name: "archive" })}
          actionLabel="Return to journal"
        />
      );
    }
    return (
      <EntryReader
        entry={entry}
        onBack={() => navigate({ name: "archive" })}
        onSave={updateCompletedEntry}
        onDelete={deleteEntry}
        onRevisit={revisit}
      />
    );
  }

  if (route.name === "settings") {
    return (
      <SettingsScreen
        displayName={displayName}
        vault={vault}
        envelopes={envelopes}
        entries={entries}
        growthEvents={growthEvents}
        onBack={() => navigate({ name: "home" })}
        onLock={() => {
          setVaultKey(null);
          setEntries([]);
          navigate({ name: "home" });
        }}
        onChangePassphrase={async (current, next) => {
          const changed = await rewrapVault(vault, current, next);
          const response = await mutate<{ vault: StoredVault }>(
            "/api/vault",
            "PUT",
            { expectedRevision: vault.revision, vault: changed.metadata },
          );
          setVault(response.vault);
          setVaultKey(changed.vaultKey);
        }}
        onDeleteAccount={async () => {
          await mutate("/api/account", "DELETE", { confirmation: "DELETE" });
          await clearEncryptedLocalData(bootstrap.account.id);
          window.location.assign("/signout-with-chatgpt?return_to=%2Fwelcome");
        }}
      />
    );
  }

  return (
    <TreeFirstHome
      snapshot={snapshot}
      memories={memories}
      greeting={`Welcome back, ${firstName(displayName)}.`}
      onBeginJournal={() => {
        setActiveEntryId(crypto.randomUUID());
        navigate({ name: "new" });
      }}
      onOpenArchive={() => navigate({ name: "archive" })}
      onOpenSettings={() => navigate({ name: "settings" })}
      onLock={() => setVaultKey(null)}
      onReadEntry={openEntry}
      onRevisitEntry={revisit}
    />
  );
}

function VaultScreen({
  mode,
  detail,
  onSubmit,
}: {
  mode: "setup" | "unlock";
  detail: string;
  onSubmit: (passphrase: string) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const setup = mode === "setup";

  return (
    <main className="sj-vault-screen" id="main-content">
      <div className="sj-vault-card">
        <span className="sj-vault-card__mark" aria-hidden>
          <LockKey weight="light" />
        </span>
        <p className="sj-eyebrow">A private place to grow</p>
        <h1>{setup ? "Protect your journal" : "Welcome back"}</h1>
        <p>{detail}</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (setup && passphrase !== confirmation) {
              setError("The two passphrases do not match.");
              return;
            }
            setPending(true);
            setError(undefined);
            void onSubmit(passphrase)
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "The journal could not be unlocked.",
                ),
              )
              .finally(() => setPending(false));
          }}
        >
          <label>
            Journal passphrase
            <input
              type="password"
              minLength={12}
              required
              autoComplete={setup ? "new-password" : "current-password"}
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {setup ? (
            <label>
              Confirm passphrase
              <input
                type="password"
                minLength={12}
                required
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          ) : null}
          {error ? <p className="sj-form-error">{error}</p> : null}
          <button type="submit" disabled={pending}>
            {pending
              ? "Preparing your private garden…"
              : setup
                ? "Create private journal"
                : "Unlock journal"}
          </button>
        </form>
        <small>
          Seed Journal cannot recover this passphrase. Store it somewhere safe.
        </small>
      </div>
    </main>
  );
}

function SettingsScreen({
  displayName,
  vault,
  envelopes,
  entries,
  growthEvents,
  onBack,
  onLock,
  onChangePassphrase,
  onDeleteAccount,
}: {
  displayName: string;
  vault: StoredVault;
  envelopes: EncryptedEntryEnvelope[];
  entries: DecryptedJournalEntry[];
  growthEvents: TreeGrowthEvent[];
  onBack: () => void;
  onLock: () => void;
  onChangePassphrase: (current: string, next: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string>();
  const [deleteText, setDeleteText] = useState("");

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppFrame gardenMode="paused">
      <SeedJournalHeader onBack={onBack} />
      <main className="sj-settings" id="main-content">
        <p className="sj-eyebrow">{displayName}</p>
        <h1>Journal settings</h1>
        <section>
          <h2>Privacy</h2>
          <p>
            Your entry text is encrypted in this browser before it is stored.
          </p>
          <button className="sj-settings__button" type="button" onClick={onLock}>
            <LockKey aria-hidden /> Lock journal
          </button>
        </section>
        <section>
          <h2>Keep a copy</h2>
          <div className="sj-settings__actions">
            <button
              className="sj-settings__button"
              type="button"
              onClick={() =>
                download(
                  buildEncryptedArchive({
                    vault,
                    entries: envelopes,
                    growthEvents,
                  }),
                  "seed-journal-backup.seedjournal",
                )
              }
            >
              <DownloadSimple aria-hidden /> Encrypted archive
            </button>
            <button
              className="sj-settings__button"
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    "This download will be readable and unencrypted. Continue?",
                  )
                ) {
                  download(
                    buildReadableMarkdown(
                      entries.map((entry) => ({
                        payload: entry.payload,
                        completedAt: entry.completedAt,
                      })),
                    ),
                    "seed-journal.md",
                  );
                }
              }}
            >
              <DownloadSimple aria-hidden /> Readable Markdown
            </button>
          </div>
        </section>
        <section>
          <h2>Change passphrase</h2>
          <div className="sj-settings__fields">
            <input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              placeholder="Current passphrase"
              aria-label="Current passphrase"
            />
            <input
              type="password"
              minLength={12}
              value={next}
              onChange={(event) => setNext(event.target.value)}
              placeholder="New passphrase"
              aria-label="New passphrase"
            />
            <button
              className="sj-settings__button"
              type="button"
              onClick={() =>
                void onChangePassphrase(current, next)
                  .then(() => {
                    setCurrent("");
                    setNext("");
                    setMessage("Passphrase changed.");
                  })
                  .catch(() => setMessage("The passphrase could not be changed."))
              }
            >
              <Key aria-hidden /> Update passphrase
            </button>
          </div>
          {message ? <p aria-live="polite">{message}</p> : null}
        </section>
        <section className="sj-settings__danger">
          <h2>Delete journal</h2>
          <p>
            This removes active entries and tree data. Export first if you want
            to keep a copy.
          </p>
          <input
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
          />
          <button
            className="sj-settings__button sj-settings__button--danger"
            type="button"
            disabled={deleteText !== "DELETE"}
            onClick={() => void onDeleteAccount()}
          >
            <Trash aria-hidden /> Delete my journal
          </button>
        </section>
        <a className="sj-settings__signout" href="/signout-with-chatgpt?return_to=%2Fwelcome">
          <SignOut aria-hidden /> Sign out
        </a>
      </main>
    </AppFrame>
  );
}

function StatusScreen({
  title,
  detail,
  busy = false,
  action,
  actionLabel,
}: {
  title: string;
  detail: string;
  busy?: boolean;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <main className="sj-status-screen" id="main-content">
      <div>
        <span className={busy ? "sj-status-orb sj-status-orb--busy" : "sj-status-orb"} />
        <h1>{title}</h1>
        <p>{detail}</p>
        {action ? (
          <button type="button" onClick={action}>
            <ArrowLeft aria-hidden /> {actionLabel}
          </button>
        ) : null}
      </div>
    </main>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const body = (await response.json()) as
    | T
    | { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(
      "error" in (body as object)
        ? (body as { error?: { message?: string } }).error?.message
        : "The request could not be completed.",
    );
  }
  return body as T;
}

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/u)[0] || "gardener";
}

function routeFromPath(path: string): Route {
  if (path === "/journal/new") return { name: "new" };
  if (path === "/journal") return { name: "archive" };
  if (path === "/settings") return { name: "settings" };
  const match = path.match(/^\/journal\/([0-9a-f-]+)$/iu);
  if (match) return { name: "entry", entryId: match[1] };
  return { name: "home" };
}

function pathForRoute(route: Route) {
  if (route.name === "new") return "/journal/new";
  if (route.name === "archive") return "/journal";
  if (route.name === "entry") return `/journal/${route.entryId}`;
  if (route.name === "settings") return "/settings";
  return "/";
}

function previewEntry(now: number): DecryptedJournalEntry {
  return {
    id: "00000000-0000-4000-8000-000000000011",
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000,
    completedAt: now - 86_400_000,
    localDay: localDay(),
    payload: {
      version: 1,
      kind: "entry",
      title: "A quieter kind of courage",
      prompt: {
        id: "preview",
        libraryVersion: "1",
        category: "change",
        renderedText: "What is changing quietly inside you?",
      },
      body:
        "I noticed that I am becoming more patient with uncertainty. I do not need every answer tonight.",
      threads: ["A change"],
      tags: ["growth"],
      seedInsight: "I can let the next step arrive gently.",
      ritual: {
        conciseBodyOverride: false,
        conciseFollowUpOverride: false,
      },
    },
  };
}

function previewGrowth(now: number): TreeGrowthEvent[] {
  const entryId = "00000000-0000-4000-8000-000000000011";
  const kinds: TreeGrowthEvent["kind"][] = [
    "leaf",
    "memory_blossom",
    "leaf",
    "leaf",
    "twig",
    "leaf",
    "memory_luminous_blossom",
    "leaf",
    "twig",
    "leaf",
    "branch",
    "memory_blossom",
  ];
  return kinds.map((kind, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
    sequence: index + 1,
    entryId: kind.startsWith("memory_") ? entryId : null,
    occurredAt: now - (kinds.length - index) * 86_400_000,
    localDate: localDay(),
    kind,
    growthUnits:
      kind === "memory_luminous_blossom"
        ? 6
        : kind === "memory_blossom"
          ? 4
          : 0,
    seed: 13_579 + index * 7_919,
  }));
}
