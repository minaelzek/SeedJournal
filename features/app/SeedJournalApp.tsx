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
  SignOut,
  Trash,
} from "@phosphor-icons/react";
import Link from "next/link";
import { ArchiveView, EntryReader } from "@/features/archive";
import type { GardenMemoryRecord } from "@/features/garden";
import {
  clearPendingTreeSeed,
  readPendingTreeSeed,
} from "@/features/garden/pendingTreeSeed";
import {
  createCareRhythm,
  GrowthReveal,
  selectDueReturnBud,
  stageForGrowthUnits,
} from "@/features/growth";
import {
  JournalRitual,
  type DecryptedJournalEntry,
  type JournalRitualDraft,
} from "@/features/journal";
import { weatherForEntry, type GardenWeather } from "@/features/reflection";
import { AppFrame, SeedJournalHeader, TreeFirstHome } from "@/features/shell";
import type {
  EncryptedEntryEnvelope,
  JournalEntryPayloadV1,
  TreeGrowthDelta,
  TreeGrowthEvent,
  TreeSnapshot,
} from "@/lib/contracts";
import {
  decryptEntryPayload,
  encryptEntryPayload,
  importVaultKeyFromBase64,
  wrapRawKey,
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
    email?: string | null;
    displayName?: string | null;
  };
  vault: { configured: boolean; wrap?: "session" | "passphrase" };
  dataKey?: string;
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
  seedInsight?: string;
}

type SyncState = "idle" | "syncing" | "offline" | "error";
type SessionClearReason = "lock" | "logout" | "timeout" | "auth-failure" | "account-delete";

interface LocalCleanupFailure {
  accountId: string;
  message: string;
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
  const bootstrapRef = useRef<BootstrapResponse | undefined>(undefined);
  const [entries, setEntries] = useState<DecryptedJournalEntry[]>([]);
  const [growthEvents, setGrowthEvents] = useState<TreeGrowthEvent[]>([]);
  const growthEventsRef = useRef<TreeGrowthEvent[]>([]);
  const entryMutationQueuesRef = useRef(new Map<string, Promise<unknown>>());
  const sessionEpochRef = useRef(0);
  const flushInFlightRef = useRef<Promise<void> | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Opening your garden…");
  const [error, setError] = useState<string>();
  const [authFailure, setAuthFailure] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMessage, setSyncMessage] = useState<string>();
  const [localCleanupFailure, setLocalCleanupFailure] =
    useState<LocalCleanupFailure>();
  const [activeEntryId, setActiveEntryId] = useState(() => crypto.randomUUID());
  const [resumedEntryId, setResumedEntryId] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [ceremonyComplete, setCeremonyComplete] = useState(false);
  const [growthRevealQueue, setGrowthRevealQueue] = useState<
    PendingGrowthReveal[]
  >([]);
  const [visualTestUnits] = useState<number | null>(readVisualTestUnits);
  const [visualPreviewEpoch] = useState(() => Date.now());
  const reducedMotion = useReducedMotionPreference();
  const [draftWeather, setDraftWeather] = useState<GardenWeather | null>(null);
  const weatherTimerRef = useRef(0);
  const suppressDraftResumeRef = useRef(false);
  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  });
  const handleAtmosphere = useCallback((entry: JournalEntryPayloadV1) => {
    window.clearTimeout(weatherTimerRef.current);
    weatherTimerRef.current = window.setTimeout(() => {
      if (routeRef.current.name !== "new") return;
      setDraftWeather(weatherForEntry(entry));
    }, 280);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(weatherTimerRef.current);
  }, []);

  const navigate = useCallback((next: Route) => {
    const path = pathForRoute(next);
    window.history.pushState({}, "", path);
    setRoute(next);
  }, []);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  const clearPlaintextSession = useCallback(
    (reason: SessionClearReason) => {
      sessionEpochRef.current += 1;
      entryMutationQueuesRef.current.clear();
      envelopeRef.current.clear();
      growthEventsRef.current = [];
      setVaultKey(null);
      setEnvelopes([]);
      setEntries([]);
      setGrowthEvents([]);
      setSelectedEntryId(null);
      setGrowthRevealQueue([]);
      setActiveEntryId(crypto.randomUUID());
      setSyncState("idle");
      setSyncMessage(undefined);
      setError(undefined);
      setAuthFailure(reason === "auth-failure");

      bootstrapRef.current = undefined;
      setBootstrap(undefined);
      setVault(undefined);

      if (reason === "lock") {
        setError("The garden is locked. Sign in to open it again.");
        window.location.replace("/welcome");
        return;
      }
      if (reason === "timeout") {
        setError("The garden locked after a quiet stretch. Sign in to open it again.");
        window.location.replace("/welcome");
        return;
      }
      if (reason === "auth-failure" || reason === "logout") {
        setError(
          reason === "logout"
            ? undefined
            : "Your sign-in session has expired. Please sign in again.",
        );
        window.location.replace("/welcome");
        return;
      }
      navigate({ name: "home" });
    },
    [navigate],
  );

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.name === "new") return;
    const target = document.getElementById("main-content");
    if (!target) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [growthRevealQueue.length, route]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await adoptPendingTreeSeed(
          await fetchJson<BootstrapResponse>("/api/bootstrap"),
        );
        setBootstrap(response);
        if (response.dataKey) {
          const key = await importVaultKeyFromBase64(response.dataKey);
          setVault(sessionVaultStub(response));
          setVaultKey(key);
          return;
        }
        if (!response.vault.configured) {
          setVault(null);
          return;
        }
        const vaultResponse = await fetchJson<{ vault: StoredVault | null }>(
          "/api/vault",
        );
        setVault(vaultResponse.vault);
      } catch (caught) {
        if (isAuthenticationFailure(caught)) {
          clearPlaintextSession("auth-failure");
          window.location.replace("/welcome");
        } else {
          const status = getSyncStatusForFailure(caught);
          setSyncState(status.state);
          setSyncMessage(status.message);
          setError("Your private garden could not be opened. Please try again.");
        }
      }
    })();
  }, [clearPlaintextSession]);

  const mutate = useCallback(
    async <T,>(url: string, method: string, body: unknown): Promise<T> => {
      const currentBootstrap = bootstrapRef.current;
      if (!currentBootstrap) {
        throw new Error("The private session is not ready.");
      }
      const send = (session: BootstrapResponse) =>
        fetchJson<T>(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "x-seedjournal-csrf": session.csrfToken,
          },
          body: JSON.stringify(body),
        });

      try {
        return await send(currentBootstrap);
      } catch (caught) {
        if (isAuthenticationFailure(caught)) {
          clearPlaintextSession("auth-failure");
          throw caught;
        }
        if (!isExpiredCsrf(caught)) throw caught;

        try {
          const refreshed = await fetchJson<BootstrapResponse>(
            "/api/bootstrap",
          );
          bootstrapRef.current = refreshed;
          setBootstrap(refreshed);
          return await send(refreshed);
        } catch (refreshError) {
          if (isAuthenticationFailure(refreshError)) {
            clearPlaintextSession("auth-failure");
          }
          throw refreshError;
        }
      }
    },
    [clearPlaintextSession],
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
      const current = growthEventsRef.current.filter((event) => {
        if (!event.entryId || !event.kind.startsWith("memory_")) return true;
        const incomingSame = incoming.some(
          (next) =>
            next.entryId === event.entryId &&
            next.kind.startsWith("memory_") &&
            next.id !== event.id,
        );
        return !incomingSame;
      });
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
    (
      events: readonly TreeGrowthEvent[],
      entryId: string,
      seedInsight?: string,
    ) => {
      if (events.length === 0) return;
      const firstSequence = events[0].sequence;
      const lastSequence = events.at(-1)?.sequence ?? firstSequence;
      setGrowthRevealQueue((current) => [
        ...current,
        {
          entryId,
          ...(seedInsight?.trim()
            ? { seedInsight: seedInsight.trim() }
            : {}),
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
      const sessionEpoch = sessionEpochRef.current;
      const accountId = bootstrap.account.id;
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
        if (isAuthenticationFailure(caught)) {
          clearPlaintextSession("auth-failure");
          throw caught;
        }
        if (!isNetworkFailure(caught)) throw caught;
        const status = getSyncStatusForFailure(caught);
        setSyncState(status.state);
        setSyncMessage(status.message);
      }

      const localDrafts = await listEncryptedDrafts(accountId);
      if (sessionEpoch !== sessionEpochRef.current) return;
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
            accountId,
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

      if (sessionEpoch !== sessionEpochRef.current) return;

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
      if (
        window.location.pathname === "/journal/new" &&
        !suppressDraftResumeRef.current
      ) {
        const resumableDraft = sortedEntries.find(
          (entry) => !entry.completedAt && entry.payload.body.trim().length > 0,
        );
        if (resumableDraft) {
          setResumedEntryId(resumableDraft.id);
          setActiveEntryId(resumableDraft.id);
        }
      }
      growthEventsRef.current = events;
      setGrowthEvents(events);
      setLoadingMessage("");
    },
    [bootstrap, clearPlaintextSession],
  );

  useEffect(() => {
    if (!bootstrap || !vaultKey) return;
    void loadJournal(vaultKey).catch((caught: unknown) => {
      if (isAuthenticationFailure(caught)) return;
      setError("Your memories could not be restored. Please try again.");
    });
  }, [bootstrap, loadJournal, vaultKey]);

  const saveDraftNow = useCallback(
    async (entryId: string, payload: JournalEntryPayloadV1) => {
      if (!bootstrap || !vaultKey) return;
      const sessionEpoch = sessionEpochRef.current;
      const accountId = bootstrap.account.id;
      const isCurrentSession = () =>
        sessionEpoch === sessionEpochRef.current;
      const existing = envelopeRef.current.get(entryId);
      const now = Date.now();
      const envelope = await encryptEntryPayload(
        vaultKey,
        accountId,
        payload,
        {
          id: entryId,
          state: "draft",
          revision: existing ? existing.revision + 1 : 1,
          clientCreatedAt: existing?.clientCreatedAt ?? now,
          clientUpdatedAt: now,
        },
      );
      if (!isCurrentSession()) return;
      await putEncryptedDraft(accountId, envelope);
      if (!isCurrentSession()) return;
      let storedEnvelope: EncryptedEntryEnvelope;
      if (!bootstrapRef.current?.csrfToken) {
        // The development preview has no server session; the encrypted local
        // draft is still a successful save in that mode.
        storedEnvelope = envelope;
      } else {
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
          await removeEncryptedDraft(accountId, entryId);
        } catch (caught) {
          if (!isNetworkFailure(caught)) throw caught;
          if (!isCurrentSession()) return;
          const operation: EncryptedOutboxOperation = existing
            ? {
                operationId: `draft:${accountId}:${entryId}:${envelope.revision}`,
                accountId,
                createdAt: now,
                kind: "update",
                expectedRevision: existing.revision,
                envelope,
              }
            : {
                operationId: `draft:${accountId}:${entryId}:${envelope.revision}`,
                accountId,
                createdAt: now,
                kind: "create",
                envelope,
              };
          await enqueueEncryptedOperation(operation);
          const status = getSyncStatusForFailure(caught);
          setSyncState(status.state);
          setSyncMessage(status.message);
          storedEnvelope = envelope;
        }
      }

      if (!isCurrentSession()) return;
      envelopeRef.current.set(entryId, storedEnvelope);
      setEnvelopes(Array.from(envelopeRef.current.values()));
      setEntries((current) => {
        const draftEntry: DecryptedJournalEntry = {
          id: entryId,
          payload,
          createdAt: existing?.clientCreatedAt ?? now,
          updatedAt: now,
        };
        return [
          draftEntry,
          ...current.filter((entry) => entry.id !== entryId),
        ];
      });
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
        const sessionEpoch = sessionEpochRef.current;
        const accountId = bootstrap.account.id;
        const isCurrentSession = () =>
          sessionEpoch === sessionEpochRef.current;
        let existing = envelopeRef.current.get(entryId);
        if (!existing) {
          await saveDraftNow(entryId, payload);
          if (!isCurrentSession()) return;
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
          accountId,
          payload,
          completionBase,
          completedAt,
          localDay,
        );
        if (!isCurrentSession()) return;
        let response:
          | {
              entry: EncryptedEntryEnvelope;
              events: TreeGrowthEvent[];
            }
          | undefined;
        let serverConfirmed = false;

        if (!bootstrapRef.current?.csrfToken) {
          const memoryKind = `memory_${completion.memoryForm.replace("-", "_")}` as TreeGrowthEvent["kind"];
          const localEvent: TreeGrowthEvent = {
            id: completion.id,
            sequence:
              Math.max(0, ...growthEventsRef.current.map((event) => event.sequence)) + 1,
            entryId,
            occurredAt: completedAt,
            localDate: localDay,
            kind: memoryKind,
            growthUnits: completion.growthUnits,
            seed: completion.seed,
          };
          await putEncryptedDraft(accountId, completionEnvelope);
          if (!isCurrentSession()) return;
          response = {
            entry: completionEnvelope,
            events: [...growthEventsRef.current, localEvent],
          };
          // Local-only (no CSRF session) still yields growth + reveal.
          serverConfirmed = true;
        } else {
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
              serverConfirmed = true;
            } catch (caught) {
              if (isAuthenticationFailure(caught)) {
                clearPlaintextSession("auth-failure");
                throw caught;
              }
              if (attempt === 0 && isRevisionConflict(caught)) {
                const latest = await fetchJson<{
                  entry: EncryptedEntryEnvelope;
                }>(`/api/entries/${entryId}`);
                if (latest.entry.state === "draft") {
                  completionBase = latest.entry;
                  completionEnvelope = await createCompletionEnvelope(
                    vaultKey,
                    accountId,
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
                if (!isCurrentSession()) return;
                await putEncryptedDraft(accountId, completionEnvelope);
                await enqueueEncryptedOperation({
                  operationId: `complete:${accountId}:${entryId}:${completion.id}`,
                  accountId,
                  createdAt: completedAt,
                  kind: "complete",
                  expectedRevision: completionBase.revision,
                  envelope: completionEnvelope,
                  completion,
                });
                envelopeRef.current.set(entryId, completionEnvelope);
                setEnvelopes(Array.from(envelopeRef.current.values()));
                const status = getSyncStatusForFailure(caught);
                setSyncState(status.state);
                setSyncMessage(status.message);
                // Optimistic local growth — never "Nurture" without a botanical receipt.
                const memoryKind =
                  `memory_${completion.memoryForm.replace("-", "_")}` as TreeGrowthEvent["kind"];
                const optimisticEvent: TreeGrowthEvent = {
                  id: completion.id,
                  sequence:
                    Math.max(
                      0,
                      ...growthEventsRef.current.map((event) => event.sequence),
                    ) + 1,
                  entryId,
                  occurredAt: completedAt,
                  localDate: localDay,
                  kind: memoryKind,
                  growthUnits: completion.growthUnits,
                  seed: completion.seed,
                };
                response = {
                  entry: completionEnvelope,
                  events: [...growthEventsRef.current, optimisticEvent],
                };
                serverConfirmed = false;
                break;
              }
              throw caught;
            }
          }
        }

        if (!response) {
          throw new Error("The completed reflection could not be confirmed.");
        }
        if (!isCurrentSession()) return;
        // Offline outbox still holds the complete envelope; keep local draft until sync.
        if (serverConfirmed) {
          await removeEncryptedDraft(accountId, entryId);
        }
        if (!isCurrentSession()) return;
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
        enqueueGrowthReveal(unseenGrowth, entryId, payload.seedInsight);
        void import("@/features/growth/careReminder").then((module) => {
          if (!module.readGentleCareNoteEnabled()) {
            module.writeGentleCareNoteEnabled(true);
          }
        });
      }),
    [
      appendUnseenGrowthEvents,
      bootstrap,
      clearPlaintextSession,
      enqueueGrowthReveal,
      mutate,
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
    if (flushInFlightRef.current) return flushInFlightRef.current;

    const task = (async () => {
      const session = bootstrapRef.current;
      if (!session || !vaultKey || !navigator.onLine) return;
      const sessionEpoch = sessionEpochRef.current;
      const accountId = session.account.id;
      setSyncState("syncing");
      setSyncMessage("Syncing your changes…");

      let operations: EncryptedOutboxOperation[];
      try {
        operations = await listEncryptedOperations(accountId);
      } catch (caught) {
        const status = getSyncStatusForFailure(caught);
        setSyncState(status.state);
        setSyncMessage(status.message);
        return;
      }

      let failed = false;
      for (const operation of operations) {
        if (sessionEpoch !== sessionEpochRef.current) return;
        try {
          await retryWithBackoff(async () => {
            if (operation.kind === "delete") {
              await mutate(`/api/entries/${operation.entryId}`, "DELETE", {
                expectedRevision: operation.expectedRevision,
              });
              envelopeRef.current.delete(operation.entryId);
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
              if (sessionEpoch !== sessionEpochRef.current) return;
              envelopeRef.current.set(response.entry.id, response.entry);
              const payload = await decryptEntryPayload(
                vaultKey,
                accountId,
                response.entry,
              );
              if (sessionEpoch !== sessionEpochRef.current) return;
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
              const alreadyGrew = growthEventsRef.current.some(
                (event) =>
                  event.entryId === response.entry.id &&
                  event.kind.startsWith("memory_"),
              );
              const unseenGrowth = appendUnseenGrowthEvents(response.events);
              if (unseenGrowth.length > 0 && !alreadyGrew) {
                enqueueGrowthReveal(
                  unseenGrowth,
                  response.entry.id,
                  payload.seedInsight,
                );
                navigate({ name: "home" });
              }
            }
          });

          if (sessionEpoch !== sessionEpochRef.current) return;
          const entryId =
            operation.kind === "delete"
              ? operation.entryId
              : operation.envelope.id;
          await removeEncryptedOperation(operation.operationId);
          await removeEncryptedDraft(accountId, entryId);
          setEnvelopes(Array.from(envelopeRef.current.values()));
        } catch (caught) {
          failed = true;
          const status = getSyncStatusForFailure(caught);
          setSyncState(status.state);
          setSyncMessage(status.message);
          break;
        }
      }

      if (!failed && sessionEpoch === sessionEpochRef.current) {
        setSyncState("idle");
        setSyncMessage(undefined);
      }
    })();

    const settled = task.finally(() => {
      if (flushInFlightRef.current === settled) {
        flushInFlightRef.current = null;
      }
    });
    flushInFlightRef.current = settled;
    return settled;
  }, [
    appendUnseenGrowthEvents,
    enqueueGrowthReveal,
    mutate,
    navigate,
    vaultKey,
  ]);

  useEffect(() => {
    if (!bootstrap || !vaultKey || loadingMessage) return;
    const markOffline = () => {
      setSyncState("offline");
      setSyncMessage("Offline. Changes will sync when you reconnect.");
    };
    const flush = () => void flushEncryptedOutbox();
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", flush);
    if (navigator.onLine) flush();
    else markOffline();
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", flush);
    };
  }, [bootstrap, flushEncryptedOutbox, loadingMessage, vaultKey]);

  useEffect(() => {
    if (!vaultKey) return;
    const inactivityLimit = 15 * 60 * 1000;
    let lastActivity = Date.now();
    let timer = window.setTimeout(lockIfInactive, inactivityLimit);

    function lockJournal() {
      const token = bootstrapRef.current?.csrfToken;
      void (async () => {
        if (token) {
          try {
            await fetch("/api/auth/logout", {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type": "application/json",
                "x-seedjournal-csrf": token,
              },
              body: JSON.stringify({}),
            });
          } catch {
            // The garden still locks if the network is gone.
          }
        }
        clearPlaintextSession("timeout");
      })();
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
  }, [clearPlaintextSession, vaultKey]);

  const updateCompletedEntryNow = useCallback(
    async (entryId: string, payload: JournalEntryPayloadV1) => {
      if (!bootstrap || !vaultKey) return;
      const sessionEpoch = sessionEpochRef.current;
      const accountId = bootstrap.account.id;
      const isCurrentSession = () =>
        sessionEpoch === sessionEpochRef.current;
      const existing = envelopeRef.current.get(entryId);
      if (!existing?.completedAt || !existing.localDay) return;
      const now = Date.now();
      const envelope = await encryptEntryPayload(
        vaultKey,
        accountId,
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
      if (!isCurrentSession()) return;
      await putEncryptedDraft(accountId, envelope);
      if (!isCurrentSession()) return;

      let storedEnvelope: EncryptedEntryEnvelope;
      if (!bootstrapRef.current?.csrfToken) {
        storedEnvelope = envelope;
      } else {
        try {
          const response = await mutate<{ entry: EncryptedEntryEnvelope }>(
            `/api/entries/${entryId}`,
            "PUT",
            { expectedRevision: existing.revision, envelope },
          );
          storedEnvelope = response.entry;
          await removeEncryptedDraft(accountId, entryId);
        } catch (caught) {
          if (!isNetworkFailure(caught)) throw caught;
          if (!isCurrentSession()) return;
          await enqueueEncryptedOperation({
            operationId: `update:${accountId}:${entryId}:${envelope.revision}`,
            accountId,
            createdAt: now,
            kind: "update",
            expectedRevision: existing.revision,
            envelope,
          });
          const status = getSyncStatusForFailure(caught);
          setSyncState(status.state);
          setSyncMessage(status.message);
          storedEnvelope = envelope;
        }
      }

      if (!isCurrentSession()) return;
      envelopeRef.current.set(entryId, storedEnvelope);
      setEnvelopes(Array.from(envelopeRef.current.values()));
      setEntries((current) =>
        current.map((entry) =>
          entry.id === entryId
            ? {
                ...entry,
                payload,
                updatedAt: storedEnvelope.clientUpdatedAt,
              }
            : entry,
        ),
      );
    },
    [bootstrap, mutate, vaultKey],
  );

  const updateCompletedEntry = useCallback(
    (entryId: string, payload: JournalEntryPayloadV1) =>
      runEntryMutation(entryId, () =>
        updateCompletedEntryNow(entryId, payload),
      ),
    [runEntryMutation, updateCompletedEntryNow],
  );

  const applyLocalDeletion = useCallback((entryId: string) => {
    envelopeRef.current.delete(entryId);
    setEnvelopes(Array.from(envelopeRef.current.values()));
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    const anonymizedGrowth = growthEventsRef.current.map((event) =>
      event.entryId === entryId ? { ...event, entryId: null } : event,
    );
    growthEventsRef.current = anonymizedGrowth;
    setGrowthEvents(anonymizedGrowth);
  }, []);

  const deleteEntry = useCallback(
    (entryId: string) =>
      runEntryMutation(entryId, async () => {
        if (!bootstrap) return;
        const sessionEpoch = sessionEpochRef.current;
        const accountId = bootstrap.account.id;
        const isCurrentSession = () =>
          sessionEpoch === sessionEpochRef.current;
        const existing = envelopeRef.current.get(entryId);
        if (!existing) return;
        const expectedRevision = existing.revision;

        try {
          await mutate(`/api/entries/${entryId}`, "DELETE", {
            expectedRevision,
          });
        } catch (caught) {
          if (!isNetworkFailure(caught)) throw caught;
          if (!isCurrentSession()) return;
          await enqueueEncryptedOperation({
            operationId: `delete:${accountId}:${entryId}:${expectedRevision}`,
            accountId,
            createdAt: Date.now(),
            kind: "delete",
            entryId,
            expectedRevision,
          });
          await removeEncryptedDraft(accountId, entryId);
          if (!isCurrentSession()) return;
          applyLocalDeletion(entryId);
          const status = getSyncStatusForFailure(caught);
          setSyncState(status.state);
          setSyncMessage(status.message);
          return;
        }

        if (!isCurrentSession()) return;
        await removeEncryptedDraft(accountId, entryId);
        if (!isCurrentSession()) return;
        applyLocalDeletion(entryId);
      }),
    [applyLocalDeletion, bootstrap, mutate, runEntryMutation],
  );

  const deleteAccount = useCallback(async () => {
    const session = bootstrapRef.current;
    if (!session) return;
    const accountId = session.account.id;
    await mutate("/api/account", "DELETE", { confirmation: "DELETE" });
    clearPlaintextSession("account-delete");
    try {
      await clearEncryptedLocalData(accountId);
    } catch (caught) {
      setLocalCleanupFailure({
        accountId,
        message:
          caught instanceof Error
            ? caught.message
            : "Encrypted local cleanup could not be completed.",
      });
      return;
    }
    window.location.replace("/welcome");
  }, [clearPlaintextSession, mutate]);

  const retryLocalCleanup = useCallback(async () => {
    if (!localCleanupFailure) return;
    const failure = localCleanupFailure;
    setLocalCleanupFailure({
      ...failure,
      message: "Retrying encrypted local cleanup…",
    });
    try {
      await clearEncryptedLocalData(failure.accountId);
    } catch (caught) {
      setLocalCleanupFailure({
        ...failure,
        message:
          caught instanceof Error
            ? caught.message
            : "Encrypted local cleanup could not be completed.",
      });
      return;
    }
    window.location.replace("/welcome");
  }, [localCleanupFailure]);

  const signOut = useCallback(async () => {
    try {
      if (bootstrapRef.current?.csrfToken) {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-seedjournal-csrf": bootstrapRef.current.csrfToken,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // Cookie clear on the server is best-effort; always leave the garden.
    }
    clearPlaintextSession("logout");
  }, [clearPlaintextSession]);

  const lockGarden = useCallback(async () => {
    try {
      if (bootstrapRef.current?.csrfToken) {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "x-seedjournal-csrf": bootstrapRef.current.csrfToken,
          },
          body: JSON.stringify({}),
        });
      }
    } catch {
      // The garden still locks if the network is gone.
    }
    clearPlaintextSession("lock");
  }, [clearPlaintextSession]);

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
    const visible = displayedGrowthEvents.filter((event) => {
      if (!event.entryId || !event.kind.startsWith("memory_")) return false;
      return byId.has(event.entryId);
    });
    return visible.flatMap((event, index) => {
      const entry = event.entryId ? byId.get(event.entryId) : undefined;
      if (!entry) return [];
      const journalOrdinal = index + 1;
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
          localDay: entry.localDay,
          title: entry.payload.title || entry.payload.prompt.renderedText,
          seedInsight: entry.payload.seedInsight,
          body: entry.payload.body,
          form,
          journalOrdinal,
        },
      ];
    });
  }, [displayedGrowthEvents, entries]);

  const pendingGrowthReveal = growthRevealQueue[0] ?? null;
  useEffect(() => {
    setCeremonyComplete(false);
  }, [pendingGrowthReveal?.entryId, pendingGrowthReveal?.delta.nextSequence]);

  if (localCleanupFailure) {
    return (
      <StatusScreen
        title="Your journal was deleted"
        detail={`The account is gone, but this device still needs to finish encrypted cleanup. ${localCleanupFailure.message}`}
        action={() => void retryLocalCleanup()}
        actionLabel="Retry cleanup"
      />
    );
  }
  if (error) {
    return (
      <StatusScreen
        title="The garden is resting"
        detail={error}
        action={
          authFailure
            ? () => window.location.replace("/welcome")
            : undefined
        }
        actionLabel={authFailure ? "Sign in again" : undefined}
      />
    );
  }
  if (!bootstrap || vault === undefined || !vaultKey || loadingMessage) {
    return (
      <StatusScreen
        title="Seed Journal"
        detail={loadingMessage || "Opening your garden…"}
        busy
      />
    );
  }

  const openEntry = (entryId: string) => navigate({ name: "entry", entryId });
  const revisit = (entryId: string) => {
    setActiveEntryId(crypto.randomUUID());
    navigate({ name: "new", parentEntryId: entryId });
  };
  // Ceremony only after leaving the ritual route (single climax on home body).
  const showGrowthReveal =
    Boolean(pendingGrowthReveal) && route.name !== "new";
  const unfinishedReflection =
    entries.find(
      (entry) =>
        !entry.completedAt &&
        entry.payload.body.trim().length > 0,
    ) ?? null;
  const todayLocalDay = localDay();
  const careRhythm = createCareRhythm(
    entries.flatMap((entry) =>
      entry.completedAt && entry.localDay ? [entry.localDay] : [],
    ),
    todayLocalDay,
  );
  const latestCompleted = [...entries]
    .filter((entry) => Boolean(entry.completedAt))
    .sort(
      (left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0),
    )[0];
  const fromWriting = weatherForEntry(latestCompleted?.payload);
  const gardenWeather =
    (route.name === "new" || showGrowthReveal) && draftWeather
      ? draftWeather
      :
    latestCompleted &&
    !careRhythm.tendedToday &&
    fromWriting.kind === "still"
      ? {
          kind: "dew" as const,
          label: "Morning dew",
          description: "The garden is resting until you return.",
        }
      : fromWriting;
  const dueReturnBud = selectDueReturnBud(entries, todayLocalDay);
  const resolveReturnBud = async (
    entryId: string,
    state: "opened" | "released",
  ) => {
    const source = entries.find((entry) => entry.id === entryId);
    const returnBud = source?.payload.returnBud;
    if (!source || !returnBud || returnBud.state !== "waiting") return;
    await updateCompletedEntry(entryId, {
      ...source.payload,
      returnBud: {
        ...returnBud,
        state,
        resolvedAt: Date.now(),
      },
    });
    if (state === "opened") revisit(entryId);
  };

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
      <>
        <TreeFirstHome
          companionOpen
          snapshot={snapshot}
          memories={memories}
          weather={gardenWeather}
          careRhythm={careRhythm}
          returnBud={dueReturnBud}
          hasUnfinishedReflection={Boolean(unfinishedReflection)}
          selectedEntryId={null}
          onBeginJournal={() => undefined}
          onOpenArchive={() => navigate({ name: "archive" })}
          onOpenSettings={() => navigate({ name: "settings" })}
          onLock={() => void lockGarden()}
        />
        <JournalRitual
          key={activeEntryId}
          layout="card"
          entryId={activeEntryId}
          restoredDraft={restoredDraft}
          localDay={todayLocalDay}
          identitySeed={bootstrap.account.treeSeed}
          kind={route.parentEntryId ? "revisit" : "entry"}
          parentEntryId={route.parentEntryId}
          previousEntries={entries}
          previousFollowUpIds={entries.flatMap((entry) =>
            [
              entry.payload.followUp?.id,
              entry.payload.secondFollowUp?.id,
            ].filter((id): id is string => Boolean(id)),
          )}
          onAutosave={autosaveActiveEntry}
          onComplete={completeActiveEntry}
          onAtmosphere={handleAtmosphere}
          resumed={resumedEntryId === activeEntryId && Boolean(restoredEntry)}
          onFresh={() => {
            const leaving = activeEntryId;
            suppressDraftResumeRef.current = true;
            setResumedEntryId(null);
            void removeEncryptedDraft(bootstrap.account.id, leaving);
            envelopeRef.current.delete(leaving);
            setEnvelopes(Array.from(envelopeRef.current.values()));
            setEntries((current) =>
              current.filter(
                (entry) => entry.completedAt !== undefined || entry.id !== leaving,
              ),
            );
            setActiveEntryId(crypto.randomUUID());
          }}
          onExit={() => {
            window.clearTimeout(weatherTimerRef.current);
            setDraftWeather(null);
            navigate({ name: "home" });
          }}
          onNurtured={() => {
            window.clearTimeout(weatherTimerRef.current);
            setResumedEntryId(null);
            setActiveEntryId(crypto.randomUUID());
            navigate({ name: "home" });
          }}
        />
      </>
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
          action={() => navigate({ name: "home" })}
          actionLabel="Return to your sakura"
        />
      );
    } else {
      routeContent = (
        <EntryReader
          entry={entry}
          onBack={() => {
            // Petal → journal → garden continuum (archive remains available).
            setSelectedEntryId(entry.id);
            navigate({ name: "home" });
          }}
          onSave={updateCompletedEntry}
          onDelete={async (entryId) => {
            await deleteEntry(entryId);
            setSelectedEntryId(null);
            navigate({ name: "home" });
          }}
          onRevisit={revisit}
        />
      );
    }
  } else if (route.name === "settings") {
    routeContent = (
      <SettingsScreen
        displayName={
          bootstrap.account.displayName ||
          bootstrap.account.email ||
          displayName
        }
        vault={vault ?? sessionVaultStub(bootstrap)}
        dataKey={bootstrap.dataKey}
        envelopes={envelopes}
        entries={entries}
        growthEvents={growthEvents}
        rootSeed={snapshot.rootSeed}
        treeAlgorithmVersion={snapshot.algorithmVersion}
        onBack={() => navigate({ name: "home" })}
        onDeleteAccount={deleteAccount}
        onSignOut={() => void signOut()}
       />
    );
  } else if (showGrowthReveal && pendingGrowthReveal) {
    // Single climax: copy overlay on the home garden body (one Canvas).
    const totalGrowthUnits = snapshot.events.reduce(
      (total, event) => total + event.growthUnits,
      0,
    );
    routeContent = (
      <main className="sj-growth-reveal-surface" id="main-content">
        <GrowthReveal
          delta={pendingGrowthReveal.delta}
          seedInsight={pendingGrowthReveal.seedInsight}
          stage={stageForGrowthUnits(totalGrowthUnits)}
          reducedMotion={reducedMotion}
          treeId={snapshot.treeId}
          snapshot={snapshot}
          hostGarden
          ceremonyComplete={ceremonyComplete}
          onReturn={() => {
            const remaining = growthRevealQueue.slice(1);
            setGrowthRevealQueue(remaining);
            setSelectedEntryId(null);
          }}
        />
      </main>
    );
  } else {
    routeContent = (
      <TreeFirstHome
        snapshot={snapshot}
        memories={memories}
        weather={gardenWeather}
        careRhythm={careRhythm}
        returnBud={dueReturnBud}
        hasUnfinishedReflection={Boolean(unfinishedReflection)}
        selectedEntryId={selectedEntryId}
        onSelectEntry={setSelectedEntryId}
        onBeginJournal={() => {
          const resumeId = unfinishedReflection?.id ?? null;
          setResumedEntryId(resumeId);
          setActiveEntryId(resumeId ?? crypto.randomUUID());
          navigate({ name: "new" });
        }}
        onStartFreshJournal={() => {
          const leaving = unfinishedReflection?.id;
          suppressDraftResumeRef.current = true;
          setResumedEntryId(null);
          if (leaving) {
            void removeEncryptedDraft(bootstrap.account.id, leaving);
            envelopeRef.current.delete(leaving);
            setEnvelopes(Array.from(envelopeRef.current.values()));
            setEntries((current) =>
              current.filter(
                (entry) => entry.completedAt !== undefined || entry.id !== leaving,
              ),
            );
          }
          setActiveEntryId(crypto.randomUUID());
          navigate({ name: "new" });
        }}
        onOpenReturnBud={(entryId) =>
          resolveReturnBud(entryId, "opened")
        }
        onReleaseReturnBud={(entryId) =>
          resolveReturnBud(entryId, "released")
        }
        onOpenArchive={() => navigate({ name: "archive" })}
        onOpenSettings={() => navigate({ name: "settings" })}
        onLock={() => void lockGarden()}
        onReadEntry={(entryId) => {
          // Leave the petal viewer so home does not re-open it after reading.
          setSelectedEntryId(null);
          openEntry(entryId);
        }}
        onRevisitEntry={(entryId) => {
          setSelectedEntryId(null);
          revisit(entryId);
        }}
      />
    );
  }

  // Growth reveal keeps garden active on the same Canvas (revealMode).
  const gardenMode =
    showGrowthReveal || route.name === "home" || route.name === "new"
      ? "active"
      : "paused";
  const revealNewestUnits =
    showGrowthReveal && pendingGrowthReveal
      ? (() => {
          const earned =
            pendingGrowthReveal.delta.events.find((event) =>
              event.kind.startsWith("memory_"),
            ) ?? pendingGrowthReveal.delta.events.at(-1);
          const units = earned?.growthUnits ?? 1;
          if (units >= 6) return 6 as const;
          if (units >= 4) return 4 as const;
          if (units >= 2) return 2 as const;
          return 1 as const;
        })()
      : undefined;

  return (
    <AppFrame
      snapshot={snapshot}
      gardenMode={gardenMode}
      weather={gardenWeather}
      tendedToday={careRhythm.tendedToday}
      returnBudEntryId={
        route.name === "home" && !showGrowthReveal
          ? dueReturnBud?.entryId
          : undefined
      }
      growthDelta={showGrowthReveal ? pendingGrowthReveal?.delta : undefined}
      selectedEntryId={
        showGrowthReveal
          ? pendingGrowthReveal?.entryId ?? selectedEntryId
          : route.name === "new"
            ? null
            : selectedEntryId
      }
      onSelectEntry={route.name === "new" ? undefined : setSelectedEntryId}
      revealMode={showGrowthReveal}
      newestGrowthUnits={revealNewestUnits}
      reducedMotion={reducedMotion}
      onCeremonyComplete={() => setCeremonyComplete(true)}
      aboveCard={route.name === "new" && !showGrowthReveal}
    >
      <SyncStatus
        state={syncState}
        message={syncMessage}
        onRetry={() => void flushEncryptedOutbox()}
      />
      {routeContent}
    </AppFrame>
  );
}

function sessionVaultStub(_bootstrap: BootstrapResponse): StoredVault {
  return {
    formatVersion: 1,
    kdf: "PBKDF2-SHA-256",
    iterations: 600_000,
    salt: "AAAAAAAAAAAAAAAAAAAAAA==",
    wrapAlgorithm: "AES-256-GCM",
    wrapIv: "AAAAAAAAAAAAAAAA",
    wrappedKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    revision: 1,
    updatedAt: Date.now(),
  };
}

function SettingsScreen({
  displayName,
  vault,
  dataKey,
  envelopes,
  entries,
  growthEvents,
  rootSeed,
  treeAlgorithmVersion,
  onBack,
  onDeleteAccount,
  onSignOut,
}: {
  displayName: string;
  vault: StoredVault;
  dataKey?: string;
  envelopes: EncryptedEntryEnvelope[];
  entries: DecryptedJournalEntry[];
  growthEvents: TreeGrowthEvent[];
  rootSeed: string;
  treeAlgorithmVersion: 1 | 2;
  onBack: () => void;
  onDeleteAccount: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReadable, setConfirmReadable] = useState(false);
  const [confirmEncrypted, setConfirmEncrypted] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportConfirm, setExportConfirm] = useState("");
  const [exportError, setExportError] = useState<string>();
  const [preparingExport, setPreparingExport] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const [gentleCareNote, setGentleCareNote] = useState(false);

  useEffect(() => {
    void import("@/features/growth/careReminder").then((module) => {
      setGentleCareNote(module.readGentleCareNoteEnabled());
    });
  }, []);

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
            Your words are encrypted on this device before they are stored.
            A signed-in session can open them, because the wrapped key is kept
            with the account. The server stores that ciphertext and knows that
            an entry exists, and when. This is not a lock that even we cannot
            open.
          </p>
          <Link className="sj-settings__button" href="/privacy">
            Read how the garden keeps a journal
          </Link>
        </section>
        <section>
          <h2>Care note</h2>
          <p>
            A soft line on home when today is still open. Never a push
            notification, never a streak to protect.
          </p>
          <label className="sj-settings__toggle">
            <input
              type="checkbox"
              checked={gentleCareNote}
              onChange={(event) => {
                const enabled = event.target.checked;
                setGentleCareNote(enabled);
                void import("@/features/growth/careReminder").then((module) => {
                  module.writeGentleCareNoteEnabled(enabled);
                });
              }}
            />
            <span>Show a gentle care note on home</span>
          </label>
        </section>
        <section>
          <h2>Keep a copy</h2>
          <div className="sj-settings__actions">
            <button
              className="sj-settings__choice"
              type="button"
              aria-expanded={confirmEncrypted}
              onClick={() => {
                setExportError(undefined);
                setConfirmEncrypted(true);
              }}
            >
              <DownloadSimple aria-hidden />
              <span>
                <strong>Encrypted backup</strong>
                <small>
                  Locked with a passphrase you choose. This garden does not
                  keep it.
                </small>
              </span>
            </button>
            <button
              className="sj-settings__choice"
              type="button"
              aria-expanded={confirmReadable}
              onClick={() => setConfirmReadable(true)}
            >
              <DownloadSimple aria-hidden />
              <span>
                <strong>Readable pages</strong>
                <small>Anyone who receives this file can read every word.</small>
              </span>
            </button>
          </div>
          {confirmEncrypted ? (
            <form
              className="sj-settings__confirm"
              onSubmit={(event) => {
                event.preventDefault();
                if (preparingExport) return;
                if (dataKey && exportPassphrase !== exportConfirm) {
                  setExportError("Those passphrases do not match.");
                  return;
                }
                setPreparingExport(true);
                setExportError(undefined);
                void (async () => {
                  try {
                    const exportVault = dataKey
                      ? {
                          ...(await wrapRawKey(dataKey, exportPassphrase)),
                          revision: vault.revision,
                          updatedAt: Date.now(),
                        }
                      : vault;
                    download(
                      buildEncryptedArchive({
                        tree: {
                          rootSeed,
                          algorithmVersion: treeAlgorithmVersion,
                        },
                        vault: exportVault,
                        entries: envelopes,
                        growthEvents,
                      }),
                      "seed-journal-backup.seedjournal",
                    );
                    setExportPassphrase("");
                    setExportConfirm("");
                    setConfirmEncrypted(false);
                  } catch (caught) {
                    setExportError(
                      caught instanceof Error
                        ? caught.message
                        : "The encrypted copy could not be prepared.",
                    );
                  } finally {
                    setPreparingExport(false);
                  }
                })();
              }}
            >
              <p>
                {dataKey
                  ? "Choose a passphrase for this file. The writing stays encrypted with the same key as the garden. The passphrase wraps that key so the file can be opened later. Seed Journal does not store the passphrase and cannot import the file back."
                  : "This copy uses the vault already stored for the account. Seed Journal cannot import the file back."}
              </p>
              {dataKey ? (
                <div className="sj-settings__fields">
                  <label>
                    Passphrase
                    <input
                      type="password"
                      name="export-passphrase"
                      autoComplete="new-password"
                      value={exportPassphrase}
                      onChange={(event) =>
                        setExportPassphrase(event.target.value)
                      }
                      required
                      minLength={12}
                    />
                  </label>
                  <label>
                    Repeat passphrase
                    <input
                      type="password"
                      name="export-passphrase-confirm"
                      autoComplete="new-password"
                      value={exportConfirm}
                      onChange={(event) => setExportConfirm(event.target.value)}
                      required
                      minLength={12}
                    />
                  </label>
                </div>
              ) : null}
              {exportError ? <p role="alert">{exportError}</p> : null}
              <div className="sj-settings__confirm-actions">
                <button
                  className="sj-settings__button"
                  type="submit"
                  disabled={preparingExport}
                >
                  {preparingExport ? "Preparing the copy…" : "Download the encrypted copy"}
                </button>
                <button
                  className="sj-settings__quiet"
                  type="button"
                  disabled={preparingExport}
                  onClick={() => {
                    setConfirmEncrypted(false);
                    setExportPassphrase("");
                    setExportConfirm("");
                    setExportError(undefined);
                  }}
                >
                  Keep it here
                </button>
              </div>
            </form>
          ) : null}
          {confirmReadable ? (
            <div className="sj-settings__confirm" role="group" aria-label="Download readable pages">
              <p>
                This file is plain text. It is not encrypted. Keep it only
                where you would keep a paper journal.
              </p>
              <div className="sj-settings__confirm-actions">
                <button
                  className="sj-settings__button"
                  type="button"
                  onClick={() => {
                    download(
                      buildReadableMarkdown(
                        entries.map((entry) => ({
                          payload: entry.payload,
                          completedAt: entry.completedAt,
                        })),
                      ),
                      "seed-journal.md",
                    );
                    setConfirmReadable(false);
                  }}
                >
                  Download the readable copy
                </button>
                <button
                  className="sj-settings__quiet"
                  type="button"
                  onClick={() => setConfirmReadable(false)}
                >
                  Keep it here
                </button>
              </div>
            </div>
          ) : null}
        </section>
        <section className="sj-settings__danger">
          <h2>Delete journal</h2>
          <p>
            This removes the entries, the tree, and the account from this
            garden, including the copy kept on this device. Take a backup
            first if you want the words to survive.
          </p>
          {confirmDelete ? (
            <div className="sj-settings__confirm" role="group" aria-label="Confirm deletion">
              <p>The garden cannot bring this journal back.</p>
              <div className="sj-settings__confirm-actions">
                <button
                  className="sj-settings__button sj-settings__button--danger"
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setDeleting(true);
                    setDeleteError(undefined);
                    void onDeleteAccount().catch(() => {
                      setDeleting(false);
                      setDeleteError(
                        "The journal is still here. Nothing was removed.",
                      );
                    });
                  }}
                >
                  <Trash aria-hidden /> Remove the journal
                </button>
                <button
                  className="sj-settings__quiet"
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteError(undefined);
                    setConfirmDelete(false);
                  }}
                >
                  Keep it
                </button>
              </div>
              {deleteError ? (
                <p role="alert">{deleteError}</p>
              ) : null}
            </div>
          ) : (
            <button
              className="sj-settings__button sj-settings__button--danger"
              type="button"
              onClick={() => {
                setDeleteError(undefined);
                setConfirmDelete(true);
              }}
            >
              <Trash aria-hidden /> Delete my journal
            </button>
          )}
        </section>
        <button
          className="sj-settings__signout"
          type="button"
          onClick={onSignOut}
        >
          <SignOut aria-hidden /> Sign out
        </button>
      </main>
    </>
  );
}

function SyncStatus({
  state,
  message,
  onRetry,
}: {
  state: SyncState;
  message?: string;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  return (
    <div
      className="sj-sync-status"
      data-state={state}
      role={state === "error" ? "alert" : "status"}
      aria-live={state === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <span>{message ?? "Sync status updated."}</span>
      {state === "error" ? (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
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
    <main
      className="sj-status-screen"
      id="main-content"
      aria-busy={busy || undefined}
    >
      <div>
        <span className={busy ? "sj-status-orb sj-status-orb--busy" : "sj-status-orb"} />
        <h1>{title}</h1>
        <p
          role={busy ? "status" : "alert"}
          aria-live={busy ? "polite" : "assertive"}
          aria-atomic="true"
        >
          {detail}
        </p>
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
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  get retryable(): boolean {
    return RETRYABLE_HTTP_STATUSES.has(this.status);
  }
}

class RequestTimeoutError extends Error {
  constructor() {
    super("The request timed out.");
    this.name = "RequestTimeoutError";
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

async function adoptPendingTreeSeed(
  session: BootstrapResponse,
): Promise<BootstrapResponse> {
  const pending = readPendingTreeSeed();
  if (!pending) return session;
  if (pending === session.account.treeSeed) {
    clearPendingTreeSeed();
    return session;
  }
  if (session.journal.entryCount > 0) {
    clearPendingTreeSeed();
    return session;
  }

  const patchAccountSeed = (csrfToken: string) =>
    fetchJson<{ treeSeed: string }>("/api/account", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-seedjournal-csrf": csrfToken,
      },
      body: JSON.stringify({ treeSeed: pending }),
    });

  try {
    let current = session;
    let result: { treeSeed: string };
    try {
      result = await patchAccountSeed(current.csrfToken);
    } catch (caught) {
      if (!isExpiredCsrf(caught)) throw caught;
      current = await fetchJson<BootstrapResponse>("/api/bootstrap");
      if (
        pending === current.account.treeSeed ||
        current.journal.entryCount > 0
      ) {
        clearPendingTreeSeed();
        return current;
      }
      result = await patchAccountSeed(current.csrfToken);
    }
    clearPendingTreeSeed();
    return {
      ...current,
      account: { ...current.account, treeSeed: result.treeSeed },
    };
  } catch (caught) {
    if (isAuthenticationFailure(caught)) throw caught;
    if (
      caught instanceof ApiClientError &&
      (caught.status === 409 || caught.code === "invalid_tree_seed")
    ) {
      clearPendingTreeSeed();
    }
    return session;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const maxAttempts = method === "GET" || method === "HEAD" ? 3 : 1;
  const externalSignal = init?.signal;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    const abortFromCaller = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        ...init,
        signal: controller.signal,
      });
      const rawBody = await response.text();
      const body = parseJsonResponse(rawBody);
      if (!response.ok) {
        const apiError = getApiErrorBody(body);
        throw new ApiClientError(
          response.status,
          apiError?.code ?? "request_failed",
          apiError?.message ?? "The request could not be completed.",
          getRequestId(body) ?? response.headers.get("X-Request-ID") ?? undefined,
        );
      }
      if (rawBody.trim() === "") return undefined as T;
      if (body === undefined) {
        throw new ApiClientError(
          response.status,
          "invalid_response",
          "The server returned an invalid response.",
        );
      }
      return body as T;
    } catch (caught) {
      lastError = timedOut ? new RequestTimeoutError() : caught;
      if (
        attempt + 1 >= maxAttempts ||
        externalSignal?.aborted ||
        !isNetworkFailure(lastError)
      ) {
        throw lastError;
      }
      await delay(150 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw lastError ?? new Error("The request could not be completed.");
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
    caught instanceof TypeError ||
    caught instanceof RequestTimeoutError ||
    (caught instanceof ApiClientError && caught.retryable) ||
    (caught instanceof Error && caught.name === "AbortError")
  );
}

function isAuthenticationFailure(caught: unknown): boolean {
  return caught instanceof ApiClientError && caught.status === 401;
}

function isExpiredCsrf(caught: unknown): boolean {
  return (
    caught instanceof ApiClientError &&
    caught.status === 403 &&
    caught.code === "invalid_csrf"
  );
}

function getSyncStatusForFailure(caught: unknown): {
  state: Exclude<SyncState, "idle" | "syncing">;
  message: string;
} {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      state: "offline",
      message: "Offline. Changes will sync when you reconnect.",
    };
  }
  if (
    caught instanceof RequestTimeoutError ||
    (caught instanceof Error && caught.name === "AbortError")
  ) {
    return {
      state: "error",
      message: "Sync is taking longer than expected. We’ll try again.",
    };
  }
  return {
    state: "error",
    message: "Some changes are waiting to sync. Try again.",
  };
}

async function retryWithBackoff<T>(
  task: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (caught) {
      lastError = caught;
      if (
        attempt + 1 >= maxAttempts ||
        !isNetworkFailure(caught) ||
        (typeof navigator !== "undefined" && !navigator.onLine)
      ) {
        throw caught;
      }
      await delay(250 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("The operation could not be completed.");
}

function parseJsonResponse(rawBody: string): unknown {
  if (rawBody.trim() === "") return undefined;
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return undefined;
  }
}

function getApiErrorBody(
  body: unknown,
): { code?: string; message?: string } | undefined {
  if (!isRecord(body) || !isRecord(body.error)) return undefined;
  return {
    code: typeof body.error.code === "string" ? body.error.code : undefined,
    message:
      typeof body.error.message === "string" ? body.error.message : undefined,
  };
}

function getRequestId(body: unknown): string | undefined {
  return isRecord(body) && typeof body.requestId === "string"
    ? body.requestId
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const REQUEST_TIMEOUT_MS = 10_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function inferRitualStage(
  payload: JournalEntryPayloadV1,
): JournalRitualDraft["stage"] {
  const persisted = payload.ritual.stage;
  if (persisted && persisted !== "nurtured") return persisted;
  if (payload.secondFollowUp?.skipped) {
    return "second-reflection-skipped";
  }
  if (payload.secondFollowUp?.response.trim()) {
    return "second-reflection-answered";
  }
  if (payload.secondFollowUp) return "second-reflection-offered";
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

  const rawRequested = new URLSearchParams(window.location.search).get(
    "treeUnits",
  );
  if (rawRequested === null) return null;
  const requested = Number(rawRequested);
  return [0, 1, 12, 48, 96, 192].includes(requested) ? requested : null;
}

function previewEntry(now: number): DecryptedJournalEntry {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return {
    id: "00000000-0000-4000-8000-000000000011",
    createdAt: now - 86_400_000,
    updatedAt: now - 86_400_000,
    completedAt: now - 86_400_000,
    localDay: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`,
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
      returnBud: {
        dueLocalDay: localDay(),
        state: "waiting",
      },
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
