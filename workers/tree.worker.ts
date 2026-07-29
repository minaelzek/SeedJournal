/// <reference lib="webworker" />

import { buildTreeTopology } from "@/features/garden/topology";
import type {
  TreeWorkerRequest,
  TreeWorkerResponse,
} from "@/features/garden/types";

const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = (message: MessageEvent<TreeWorkerRequest>) => {
  if (message.data.type !== "build") return;

  const response: TreeWorkerResponse = {
    type: "built",
    requestId: message.data.requestId,
    topology: buildTreeTopology(message.data.snapshot),
  };
  scope.postMessage(response);
};

export {};
