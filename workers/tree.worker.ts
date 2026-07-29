/// <reference lib="webworker" />

import { topologyTransferables } from "@/features/garden/engine/buffers";
import { TreeWorkerSession } from "@/features/garden/engine/session";
import type {
  TreeWorkerRequest,
  TreeWorkerResponse,
} from "@/features/garden/types";

const scope = self as DedicatedWorkerGlobalScope;
const session = new TreeWorkerSession();

scope.onmessage = (message: MessageEvent<TreeWorkerRequest>) => {
  let response: TreeWorkerResponse;
  try {
    response = session.handle(message.data);
  } catch {
    response = {
      type: "resync-required",
      requestId: message.data.requestId,
      expectedSequence: session.lastSequence + 1,
      receivedSequence:
        message.data.type === "append"
          ? (message.data.events[0]?.sequence ?? message.data.fromSequence + 1)
          : 0,
    };
  }
  if (response.type === "resync-required") {
    scope.postMessage(response);
    return;
  }
  scope.postMessage(response, topologyTransferables(response.topology));
};

export {};
