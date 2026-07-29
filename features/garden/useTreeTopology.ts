"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeSnapshot } from "@/lib/contracts";
import { buildTreeTopology } from "./topology";
import type {
  TreeTopology,
  TreeWorkerRequest,
  TreeWorkerResponse,
} from "./types";

export function useTreeTopology(snapshot: TreeSnapshot): TreeTopology {
  const [topology, setTopology] = useState(() => buildTreeTopology(snapshot));
  const requestId = useRef(0);

  useEffect(() => {
    let active = true;
    const setBuiltTopology = (next: TreeTopology) => {
      if (active) setTopology(next);
    };

    if (typeof Worker === "undefined") {
      queueMicrotask(() => setBuiltTopology(buildTreeTopology(snapshot)));
      return () => {
        active = false;
      };
    }

    let worker: Worker | undefined;
    try {
      worker = new Worker(new URL("../../workers/tree.worker.ts", import.meta.url), {
        type: "module",
      });
      const nextRequestId = requestId.current + 1;
      requestId.current = nextRequestId;
      worker.onmessage = (message: MessageEvent<TreeWorkerResponse>) => {
        if (
          message.data.type === "built" &&
          message.data.requestId === requestId.current
        ) {
          setBuiltTopology(message.data.topology);
        }
      };
      const request: TreeWorkerRequest = {
        type: "build",
        requestId: nextRequestId,
        snapshot,
      };
      worker.postMessage(request);
    } catch {
      queueMicrotask(() => setBuiltTopology(buildTreeTopology(snapshot)));
    }

    return () => {
      active = false;
      worker?.terminate();
    };
  }, [snapshot]);

  return topology;
}
