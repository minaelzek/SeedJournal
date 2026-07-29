"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeSnapshot } from "@/lib/contracts";
import { buildTreeTopology } from "./topology";
import type {
  QualityTier,
  TreeTopology,
  TreeWorkerRequest,
  TreeWorkerResponse,
} from "./types";

function eventHistoryIsPrefix(
  previous: TreeSnapshot,
  next: TreeSnapshot,
): boolean {
  if (
    previous.treeId !== next.treeId ||
    previous.rootSeed !== next.rootSeed ||
    previous.algorithmVersion !== next.algorithmVersion ||
    previous.events.length > next.events.length
  ) {
    return false;
  }
  return previous.events.every((event, index) => {
    const candidate = next.events[index];
    return (
      candidate?.id === event.id &&
      candidate.sequence === event.sequence &&
      candidate.kind === event.kind &&
      candidate.entryId === event.entryId &&
      candidate.seed === event.seed &&
      candidate.growthUnits === event.growthUnits
    );
  });
}

function snapshotLineage(
  snapshot: TreeSnapshot,
): Record<string, string> | undefined {
  return (
    snapshot as TreeSnapshot & {
      memoryLineage?: Record<string, string>;
    }
  ).memoryLineage;
}

/**
 * Keeps one topology worker alive for the mounted garden. Snapshot suffixes use
 * `append`; replacements, deletions, lineage changes, and protocol gaps resync.
 */
export function useTreeTopology(
  snapshot: TreeSnapshot,
  quality: QualityTier = "balanced",
): TreeTopology {
  const [topology, setTopology] = useState(() =>
    // Keep historical replay off the main thread. The seed placeholder is
    // deterministic and cheap enough to paint while the persistent worker
    // prepares the requested revision.
    buildTreeTopology({ ...snapshot, events: [] }, quality),
  );
  const workerRef = useRef<Worker | null>(null);
  const previousSnapshotRef = useRef<TreeSnapshot | null>(null);
  const previousQualityRef = useRef<QualityTier>(quality);
  const requestIdRef = useRef(0);
  const latestSnapshotRef = useRef(snapshot);
  const latestQualityRef = useRef(quality);

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
    latestQualityRef.current = quality;
  }, [quality, snapshot]);

  useEffect(() => {
    if (typeof Worker === "undefined") return;
    try {
      const worker = new Worker(
        new URL("../../workers/tree.worker.ts", import.meta.url),
        { type: "module" },
      );
      workerRef.current = worker;
      worker.onmessage = (message: MessageEvent<TreeWorkerResponse>) => {
        const response = message.data;
        if (response.requestId !== requestIdRef.current) return;
        if (response.type === "resync-required") {
          const requestId = requestIdRef.current + 1;
          requestIdRef.current = requestId;
          const request: TreeWorkerRequest = {
            type: "init",
            requestId,
            snapshot: latestSnapshotRef.current,
            quality: latestQualityRef.current,
          };
          worker.postMessage(request);
          return;
        }
        setTopology(response.topology);
      };
    } catch {
      workerRef.current = null;
    }
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    const worker = workerRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!worker) {
      queueMicrotask(() => {
        if (requestId === requestIdRef.current) {
          setTopology(buildTreeTopology(snapshot, quality));
        }
      });
      previousSnapshotRef.current = snapshot;
      previousQualityRef.current = quality;
      return;
    }

    let request: TreeWorkerRequest;
    if (
      previous &&
      eventHistoryIsPrefix(previous, snapshot) &&
      snapshot.events.length > previous.events.length
    ) {
      request = {
        type: "append",
        requestId,
        treeId: snapshot.treeId,
        fromSequence: previous.events.at(-1)?.sequence ?? 0,
        events: snapshot.events.slice(previous.events.length),
        memoryLineage: snapshotLineage(snapshot),
      };
    } else if (
      previous &&
      eventHistoryIsPrefix(previous, snapshot) &&
      snapshot.events.length === previous.events.length &&
      quality !== previousQualityRef.current
    ) {
      request = { type: "set-quality", requestId, quality };
    } else {
      request = { type: "init", requestId, snapshot, quality };
    }
    worker.postMessage(request);
    previousSnapshotRef.current = snapshot;
    previousQualityRef.current = quality;
  }, [quality, snapshot]);

  return topology;
}
