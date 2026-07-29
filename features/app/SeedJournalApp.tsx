"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { GrowthReveal, stageForGrowthUnits } from "@/features/growth";
import {
  JournalRitual,
  type DecryptedJournalEntry,
  type JournalRitualDraft,
} from "@/features/journal";
import { AppFrame, SeedJournalHeader, TreeFirstHome } from "@/features/shell";
import type {
  EncryptedEntryEnvelope,
  JournalEntryPayloadV1,
  TreeGrowthDelta,
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
  enqueueEncryptedOperation,
  listEncryptedDrafts,
  listEncryptedOperations,
  putEncryptedDraft,
  removeEncryptedDraft,
  removeEncryptedOperation,
  type EncryptedOutboxOperation,
} from "@/lib/storage";
import "./app.css";

type Route =
  | { name: "home" }
  | { name: "new"; parentEntryId?: string }
  | { name: "archive" }
  | { name: "entry"; entryId: string }
  | { name: "settings" };

interface BootstrapResponse {
  account: {
    id: string;
    treeSeed: string;
    treeAlgorithmVersion: 1 | 2;
  };
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

interface PendingGrowthReveal {
  delta: TreeGrowthDelta;
  entryId: string;
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
  const growthEventsRef = useRef<TreeGrowthEvent[]>([]);
  const entryMutationQueuesRef = useRef(new Map<string, Promise<unknown>>());
  const [loadingMessage, setLoadingMessage] = useState("Opening your garden…");
  const [error, setError] = useState<string>();
  const [activeEntryId, setActiveEntryId] = useState(() => crypto.randomUUID());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [growthRevealQueue, setGrowthRevealQueue] = useState<
    PendingGrowthReveal[]
  >([]);
  const [visualTestUnits] = useState<number | null>(readVisualTestUnits);
  const [visualPreviewEpoch] = useState(() => Date.now());
  const reducedMotion = useReducedMotionPreference();

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
    const target = document.getElementById("main-content");
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [growthRevealQueue.length, route]);

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
              treeAlgorithmVersion: 2,
            },
            vault: { configured: true },
            journal: { entryCount: 1 },
            csrfToken: "",
          };
          setBootstrap(previewAccount);
          setVault({ ...created.metadata, revision: 1, updatedAt: now });
          setVaultKey(created.vaultKey);
          setEntries([previewEntry(now)]);
          const previewEvents = previewGrowth(now);
          growthEventsRef.current = previewEvents;
          setGrowthEvents(previewEvents);
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

  const runEntryMutation = useCallback(
    <T,>(entryId: string, task: () => Promise<T>): Promise<T> => {
      const previous =
        entryMutationQueuesRef.current.get(entryId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(task);
      const tail = next.then(
        () => undefined,
        () => undefined,
      );
      const settled = tail.finally(() => {
        if (entryMutationQueuesRef.current.get(entryId) === settled) {
          entryMutationQueuesRef.current.delete(entryId);
        }
      });
      entryMutationQueuesRef.current.set(entryId, settled);
      return next;
    },
    [],
  );

  const appendUnseenGrowthEvents = useCallback(
    (incoming: readonly TreeGrowthEvent[]) => {
      const current = growthEventsRef.current;
      const knownIds = new Set(current.map((event) => event.id));
      const knownSequences = new Set(current.map((event) => event.sequence));
      const unseen = incoming
        .filter(
          (event) =>
            !knownIds.has(event.id) && !knownSequences.has(event.sequence),
        )
        .sort((left, right) => left.sequence - right.sequence);
      if (unseen.length === 0) return unseen;
      const merged = [...current, ...unseen].sort(
        (left, right) => left.sequence - right.sequence,
      );
      growthEventsRef.current = merged;
      setGrowthEvents(merged);
      return unseen;
    },
    [],
  );

  const enqueueGrowthReveal = useCallback(
    (events: readonly TreeGrowthEvent[], entryId: string) => {
      if (events.length === 0) return;
      const firstSequence = events[0].sequence;
      const lastSequence = events.at(-1)?.sequence ?? firstSequence;
      setGrowthRevealQueue((current) => [
        ...current,
        {
          entryId,
          delta: {
            previousSequence: firstSequence - 1,
            nextSequence: lastSequence,
            events: [...events],
          },
        },
      ]);
      setSelectedEntryId((current) => current ?? entryId);
    },
    [],
  );

  const loadJournal = useCallback(
    async (key: CryptoKey) => {
      if (!bootstrap) return;
      setLoadingMessage("Restoring your memories…");
      const allEnvelopes: EncryptedEntryEnvelope[] = [];
      const events: TreeGrowthEvent[] = [];
      try {
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
      } catch (caught) {
        if (!isNetworkFailure(caught)) throw caught;
      }

      const localDrafts = await listEncryptedDrafts(bootstrap.account.id);
      const mergedEnvelopes = new Map(
        allEnvelopes.map((envelope) => [envelope.id, envelope]),
      );
      localDrafts.forEach((envelope) => {
        const saved = mergedEnvelopes.get(envelope.id);
        if (!saved || envelope.revision >= saved.revision) {
          mergedEnvelopes.set(envelope.id, envelope);
        }
      });
      const restoredEnvelopes = Array.from(mergedEnvelopes.values());
      const decrypted: DecryptedJournalEntry[] = [];
      for (const envelope of restoredEnvelopes) {
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

      envelopeRef.current = new Map(
        restoredEnvelopes.map((envelope) => [envelope.id, envelope]),
      );
      setEnvelopes(restoredEnvelopes);
      const sortedEntries = decrypted.sort(
        (left, right) =>
          (right.completedAt ?? right.updatedAt) -
          (left.completedAt ?? left.updatedAt),
      );
      setEntries(sortedEntries);
      if (window.location.pathname === "/journal/new") {
        const resumableDraft = sortedEntries.find(
          (entry) => !entry.completedAt && entry.payload.body.trim().length > 0,
        );
        if (resumableDraft) setActiveEntryId(resumableDraft.id);
      }
      growthEventsRef.current = events;
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

  const saveDraftNow = useCallback(
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
      await putEncryptedDraft(bootstrap.account.id, envelope);
      let storedEnvelope: EncryptedEntryEnvelope;
      try {
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
        storedEnvelope = response.entry;
        await removeEncryptedDraft(bootstrap.account.id, entryId);
      } catch (caught) {
        if (!isNetworkFailure(caught)) throw caught;
        const operation: EncryptedOutboxOperation = existing
          ? {
              operationId: `draft:${bootstrap.account.id}:${entryId}:${envelope.revision}`,
              accountId: bootstrap.account.id,
              createdAt: now,
              kind: "update",
              expectedRevision: existing.revision,
              envelope,
            }
          : {
              operationId: `draft:${bootstrap.account.id}:${entryId}:${envelope.revision}`,
              accountId: bootstrap.account.id,
              createdAt: now,
              kind: "create",
              envelope,
            };
        await enqueueEncryptedOperation(operation);
        storedEnvelope = envelope;
      }
      envelopeRef.current.set(entryId, storedEnvelope);
      setEnvelopes(Array.from(envelopeRef.current.values()));
    },
    [bootstrap, mutate, vaultKey],
  );

  const saveDraft = useCallback(
    (entryId: string, payload: JournalEntryPayloadV1) =>
      runEntryMutation(entryId, () => saveDraftNow(entryId, payload)),
    [runEntryMutation, saveDraftNow],
  );

  const completeEntry = useCallback(
    (entryId: string, payload: JournalEntryPayloadV1, localDay: string) =>
      runEntryMutation(entryId, async () => {
        if (!bootstrap || !vaultKey || !payload.growth) return;
        let existing = envelopeRef.current.get(entryId);
        if (!existing) {
          await saveDraftNow(entryId, payload);
          existing = envelopeRef.current.get(entryId);
        }
        if (!existing) throw new Error("The draft could not be prepared.");

        const completedAt = Date.now();
        const completion = {
          id: payload.growth.completionId,
          memoryForm: payload.growth.memoryForm,
          growthUnits: payload.growth.growthUnits,
          seed: payload.growth.seed,
        };
        let completionBase = existing;
        let completionEnvelope = await createCompletionEnvelope(
          vaultKey,
          bootstrap.account.id,
          payload,
          completionBase,
          completedAt,
          localDay,
        );
        let response:
          | {
              entry: EncryptedEntryEnvelope;
              events: TreeGrowthEvent[];
            }
          | undefined;

        for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
          try {
            response = await mutate(
              `/api/entries/${entryId}/complete`,
              "POST",
              {
                expectedRevision: completionBase.revision,
                envelope: completionEnvelope,
                completion,
              },
            );
          } catch (caught) {
            if (attempt === 0 && isRevisionConflict(caught)) {
              const latest = await fetchJson<{
                entry: EncryptedEntryEnvelope;
              }>(`/api/entries/${entryId}`);
              if (latest.entry.state === "draft") {
                completionBase = latest.entry;
                completionEnvelope = await createCompletionEnvelope(
                  vaultKey,
                  bootstrap.account.id,
                  payload,
                  completionBase,
                  completedAt,
                  localDay,
                );
                envelopeRef.current.set(entryId, completionBase);
              }
              continue;
            }

            if (isNetworkFailure(caught)) {
              await putEncryptedDraft(
                bootstrap.account.id,
                completionEnvelope,
              );
              await enqueueEncryptedOperation({
                operationId: `complete:${bootstrap.account.id}:${entryId}:${completion.id}`,
                accountId: bootstrap.account.id,
                createdAt: completedAt,
                kind: "complete",
                expectedRevision: completionBase.revision,
                envelope: completionEnvelope,
                completion,
              });
              envelopeRef.current.set(entryId, completionEnvelope);
              setEnvelopes(Array.from(envelopeRef.current.values()));
            }
            throw caught;
          }
        }

        if (!response) {
          throw new Error("The completed reflection could not be confirmed.");
        }
        await removeEncryptedDraft(bootstrap.account.id, entryId);
        envelopeRef.current.set(entryId, response.entry);
        setEnvelopes(Array.from(envelopeRef.current.values()));
        setEntries((current) => [
          {
            id: entryId,
            payload,
            createdAt: completionBase.clientCreatedAt,
            updatedAt: completedAt,
            completedAt,
            localDay,
          },
          ...current.filter((entry) => entry.id !== entryId),
        ]);
        const unseenGrowth = appendUnseenGrowthEvents(response.events);
        enqueueGrowthReveal(unseenGrowth, entryId);
        setActiveEntryId(crypto.randomUUID());
        navigate({ name: "home" });
      }),
    [
      appendUnseenGrowthEvents,
      bootstrap,
      enqueueGrowthReveal,
      mutate,
      navigate,
      runEntryMutation,
      saveDraftNow,
      vaultKey,
    ],
  );

  const autosaveActiveEntry = useCallback(
    (draft: JournalRitualDraft) =>
      saveDraft(activeEntryId, draft.entry),
    [activeEntryId, saveDraft],
  );

  const completeActiveEntry = useCallback(
    (result: {
      entry: JournalEntryPayloadV1;
      localDay: string;
    }) => completeEntry(activeEntryId, result.entry, result.localDay),
    [activeEntryId, completeEntry],
  );

  const flushEncryptedOutbox = useCallback(async () => {
    if (!bootstrap || !vaultKey || !navigator.onLine) return;
    const operations = await listEncryptedOperations(bootstrap.account.id);

    for (const operation of operations) {
      try {
        if (operation.kind === "delete") {
          await mutate(`/api/entries/${operation.entryId}`, "DELETE", {
            expectedRevision: operation.expectedRevision,
          });
        } else if (operation.kind === "create") {
          const response = await mutate<{ entry: EncryptedEntryEnvelope }>(
            "/api/entries",
            "POST",
            operation.envelope,
          );
          envelopeRef.current.set(response.entry.id, response.entry);
        } else if (operation.kind === "update") {
          const response = await mutate<{ entry: EncryptedEntryEnvelope }>(
            `/api/entries/${operation.envelope.id}`,
            "PUT",
            {
              expectedRevision: operation.expectedRevision,
              envelope: operation.envelope,
            },
          );
          envelopeRef.current.set(response.entry.id, response.entry);
        } else {
          const response = await mutate<{
            entry: EncryptedEntryEnvelope;
            events: TreeGrowthEvent[];
          }>(`/api/entries/${operation.envelope.id}/complete`, "POST", {
            expectedRevision: operation.expectedRevision,
            envelope: operation.envelope,
            completion: operation.completion,
          });
          envelopeRef.current.set(response.entry.id, response.entry);
          const payload = await decryptEntryPayload(
            vaultKey,
            bootstrap.account.id,
            response.entry,
          );
          setEntries((current) => [
            {
              id: response.entry.id,
              payload,
              createdAt: response.entry.clientCreatedAt,
              updatedAt: response.entry.clientUpdatedAt,
              ...(response.entry.completedAt === undefined
                ? {}
                : { completedAt: response.entry.completedAt }),
              ...(response.entry.localDay === undefined
                ? {}
                : { localDay: response.entry.localDay }),
            },
            ...current.filter((entry) => entry.id !== response.entry.id),
          ]);
          const unseenGrowth = appendUnseenGrowthEvents(response.events);
          if (unseenGrowth.length > 0) {
            enqueueGrowthReveal(unseenGrowth, response.entry.id);
            navigate({ name: "home" });
          }
        }

        const entryId =
          operation.kind === "delete"
            ? operation.entryId
            : operation.envelope.id;
        await removeEncryptedOperation(operation.operationId);
        await removeEncryptedDraft(bootstrap.account.id, entryId);
        setEnvelopes(Array.from(envelopeRef.current.values()));
      } catch {
        // Preserve ordering and retry the remaining encrypted operations later.
        break;
      }
    }
  }, [
    appendUnseenGrowthEvents,
    bootstrap,
    enqueueGrowthReveal,
    mutate,
    navigate,
    vaultKey,
  ]);

  useEffect(() => {
    if (!bootstrap || !vaultKey || loadingMessage) return;
    const flush = () => void flushEncryptedOutbox();
    window.addEventListener("online", flush);
    if (navigator.onLine) flush();
    return () => window.removeEventListener("online", flush);
  }, [bootstrap, flushEncryptedOutbox, loadingMessage, vaultKey]);

  useEffect(() => {
    if (!vaultKey) return;
    const inactivityLimit = 15 * 60 * 1000;
    let lastActivity = Date.now();
    let timer = window.setTimeout(lockIfInactive, inactivityLimit);

    function lockJournal() {
      setVaultKey(null);
      setEntries([]);
      setSelectedEntryId(null);
      setGrowthRevealQueue([]);
      navigate({ name: "home" });
    }

    function lockIfInactive() {
      const remaining = inactivityLimit - (Date.now() - lastActivity);
      if (remaining <= 0) {
        lockJournal();
        return;
      }
      timer = window.setTimeout(lockIfInactive, remaining);
    }

    function noteActivity() {
      lastActivity = Date.now();
      window.clearTimeout(timer);
      timer = window.setTimeout(lockIfInactive, inactivityLimit);
    }

    function checkVisibility() {
      if (document.visibilityState === "visible") lockIfInactive();
    }

    const activityEvents = ["pointerdown", "keydown", "touchstart"] as const;
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, noteActivity, { passive: true }),
    );
    document.addEventListener("visibilitychange", checkVisibility);
    return () => {
      window.clearTimeout(timer);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, noteActivity),
      );
      document.removeEventListener("visibilitychange", checkVisibility);
    };
  }, [navigate, vaultKey]);

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
    const anonymizedGrowth = growthEventsRef.current.map((event) =>
        event.entryId === entryId ? { ...event, entryId: null } : event,
    );
    growthEventsRef.current = anonymizedGrowth;
    setGrowthEvents(anonymizedGrowth);
  };

  const displayedGrowthEvents = useMemo(
    () =>
      visualTestUnits === null
        ? growthEvents
        : previewGrowthForUnits(visualTestUnits, visualPreviewEpoch),
    [growthEvents, visualPreviewEpoch, visualTestUnits],
  );

  const snapshot = useMemo<TreeSnapshot>(
    () => ({
      treeId: bootstrap?.account.id ?? "seed-journal",
      rootSeed: bootstrap?.account.treeSeed ?? "moonlit-sapling",
      algorithmVersion: bootstrap?.account.treeAlgorithmVersion ?? 2,
      totalEntries: entries.filter((entry) => entry.completedAt).length,
      distinctJournalDays: new Set(
        entries.map((entry) => entry.localDay).filter(Boolean),
      ).size,
      events: displayedGrowthEvents,
      memoryLineage: Object.fromEntries(
        entries.flatMap((entry) =>
          entry.payload.parentEntryId
            ? [[entry.id, entry.payload.parentEntryId] as const]
            : [],
        ),
      ),
    }),
    [bootstrap, displayedGrowthEvents, entries],
  );

  const memories = useMemo<GardenMemoryRecord[]>(() => {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    return displayedGrowthEvents.flatMap((event) => {
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
  }, [displayedGrowthEvents, entries]);

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
  const pendingGrowthReveal = growthRevealQueue[0] ?? null;

  let routeContent: ReactNode;
  if (route.name === "new") {
    const restoredEntry = entries.find(
      (entry) => entry.id === activeEntryId && !entry.completedAt,
    );
    const restoredDraft: JournalRitualDraft | undefined = restoredEntry
      ? {
          stage: inferRitualStage(restoredEntry.payload),
          entry: restoredEntry.payload,
        }
      : undefined;
    routeContent = (
      <main className="sj-route-surface" id="main-content">
        <JournalRitual
          key={activeEntryId}
          entryId={activeEntryId}
          restoredDraft={restoredDraft}
          localDay={localDay()}
          identitySeed={bootstrap.account.treeSeed}
          kind={route.parentEntryId ? "revisit" : "entry"}
          parentEntryId={route.parentEntryId}
          previousEntries={entries}
          previousFollowUpIds={entries
            .map((entry) => entry.payload.followUp?.id)
            .filter((id): id is string => Boolean(id))}
          onAutosave={autosaveActiveEntry}
          onComplete={completeActiveEntry}
          onExit={() => navigate({ name: "home" })}
        />
      </main>
    );
  } else if (route.name === "archive") {
    routeContent = (
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
  } else if (route.name === "entry") {
    const entry = entries.find((item) => item.id === route.entryId);
    if (!entry) {
      routeContent = (
        <StatusScreen
          title="Memory unavailable"
          detail="This memory may have been removed."
          action={() => navigate({ name: "archive" })}
          actionLabel="Return to journal"
        />
      );
    } else {
      routeContent = (
        <EntryReader
          entry={entry}
          onBack={() => navigate({ name: "archive" })}
          onSave={updateCompletedEntry}
          onDelete={deleteEntry}
          onRevisit={revisit}
        />
      );
    }
  } else if (route.name === "settings") {
    routeContent = (
      <SettingsScreen
        displayName={displayName}
        vault={vault}
        envelopes={envelopes}
        entries={entries}
        growthEvents={growthEvents}
        rootSeed={snapshot.rootSeed}
        treeAlgorithmVersion={snapshot.algorithmVersion}
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
  } else if (pendingGrowthReveal) {
    const totalGrowthUnits = snapshot.events.reduce(
      (total, event) => total + event.growthUnits,
      0,
    );
    routeContent = (
      <main className="sj-growth-reveal-surface" id="main-content">
        <GrowthReveal
          delta={pendingGrowthReveal.delta}
          stage={stageForGrowthUnits(totalGrowthUnits)}
          reducedMotion={reducedMotion}
          treeId={snapshot.treeId}
          onReturn={() => {
            const remaining = growthRevealQueue.slice(1);
            setGrowthRevealQueue(remaining);
            setSelectedEntryId(remaining[0]?.entryId ?? null);
          }}
        />
      </main>
    );
  } else {
    routeContent = (
      <TreeFirstHome
        snapshot={snapshot}
        memories={memories}
        selectedEntryId={selectedEntryId}
        onSelectEntry={setSelectedEntryId}
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

  const gardenMode =
    route.name === "home"
      ? "active"
      : route.name === "new"
        ? "ambient"
        : "paused";

  return (
    <AppFrame
      snapshot={snapshot}
      gardenMode={gardenMode}
      selectedEntryId={selectedEntryId}
      onSelectEntry={setSelectedEntryId}
    >
      {routeContent}
    </AppFrame>
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
  rootSeed,
  treeAlgorithmVersion,
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
  rootSeed: string;
  treeAlgorithmVersion: 1 | 2;
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
    <>
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
                    tree: {
                      rootSeed,
                      algorithmVersion: treeAlgorithmVersion,
                    },
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
    </>
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

class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function createCompletionEnvelope(
  vaultKey: CryptoKey,
  accountId: string,
  payload: JournalEntryPayloadV1,
  base: EncryptedEntryEnvelope,
  completedAt: number,
  localDay: string,
): Promise<EncryptedEntryEnvelope> {
  return encryptEntryPayload(vaultKey, accountId, payload, {
    id: base.id,
    state: "complete",
    revision: base.revision + 1,
    clientCreatedAt: base.clientCreatedAt,
    clientUpdatedAt: completedAt,
    completedAt,
    localDay,
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const body = (await response.json()) as
    | T
    | { error?: { code?: string; message?: string } };
  if (!response.ok) {
    const apiError =
      "error" in (body as object)
        ? (body as { error?: { code?: string; message?: string } }).error
        : undefined;
    throw new ApiClientError(
      response.status,
      apiError?.code ?? "request_failed",
      apiError?.message ?? "The request could not be completed.",
    );
  }
  return body as T;
}

function isRevisionConflict(caught: unknown): boolean {
  return (
    caught instanceof ApiClientError &&
    caught.status === 409 &&
    (caught.code === "revision_conflict" ||
      caught.code === "completion_conflict")
  );
}

function isNetworkFailure(caught: unknown): boolean {
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    caught instanceof TypeError
  );
}

function inferRitualStage(
  payload: JournalEntryPayloadV1,
): JournalRitualDraft["stage"] {
  const persisted = payload.ritual.stage;
  if (persisted && persisted !== "nurtured") return persisted;
  if (payload.followUp?.skipped || payload.ritual.conciseBodyOverride) {
    return "follow-up-skipped";
  }
  if (payload.followUp?.response.trim()) return "follow-up-answered";
  if (payload.followUp) return "reflection-offered";
  return payload.body.trim() ? "writing" : "new";
}

function localDay() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
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

function readVisualTestUnits(): number | null {
  if (
    process.env.NODE_ENV !== "development" ||
    typeof window === "undefined"
  ) {
    return null;
  }

  const requested = Number(
    new URLSearchParams(window.location.search).get("treeUnits"),
  );
  return [0, 1, 12, 48, 96, 192].includes(requested) ? requested : null;
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

function previewGrowthForUnits(
  targetUnits: number,
  now: number,
): TreeGrowthEvent[] {
  const entryId = "00000000-0000-4000-8000-000000000011";
  const events: TreeGrowthEvent[] = [];
  let sequence = 0;
  let totalUnits = 0;
  let twigCount = 0;
  const add = (
    kind: TreeGrowthEvent["kind"],
    growthUnits: TreeGrowthEvent["growthUnits"],
    memory: boolean,
  ) => {
    sequence += 1;
    events.push({
      id: `visual-stage-${targetUnits}-${sequence}`,
      sequence,
      entryId: memory ? entryId : null,
      occurredAt: now + sequence,
      localDate: localDay(),
      kind,
      growthUnits,
      seed: 17_171 + sequence * 7_919,
    });
  };

  while (totalUnits < targetUnits) {
    const remaining = targetUnits - totalUnits;
    const units: 1 | 2 | 4 | 6 =
      remaining >= 6 ? 6 : remaining >= 4 ? 4 : remaining >= 2 ? 2 : 1;
    const previousTwigMilestone = Math.floor(totalUnits / 12);
    totalUnits += units;
    const nextTwigMilestone = Math.floor(totalUnits / 12);

    add("leaf", 0, false);
    add(
      units === 6
        ? "memory_luminous_blossom"
        : units === 4
          ? "memory_blossom"
          : units === 2
            ? "memory_bud"
            : "memory_leaf",
      units,
      true,
    );

    for (
      let milestone = previousTwigMilestone;
      milestone < nextTwigMilestone;
      milestone += 1
    ) {
      twigCount += 1;
      add("twig", 0, false);
      if (twigCount % 4 === 0) add("branch", 0, false);
    }
  }

  return events;
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
