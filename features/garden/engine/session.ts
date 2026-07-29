import type { TreeSnapshot } from "@/lib/contracts";
import type {
  QualityTier,
  TreeWorkerRequest,
  TreeWorkerResponse,
} from "../types";
import { buildTreeTopologyV1 } from "./v1";
import { TreeEngineV2 } from "./v2";

/**
 * Stateful protocol core shared by the Web Worker and deterministic unit tests.
 * The retained V2 engine owns only botanical geometry—never entry plaintext.
 */
export class TreeWorkerSession {
  private snapshot: TreeSnapshot | null = null;
  private quality: QualityTier = "balanced";
  private v2: TreeEngineV2 | null = null;

  handle(request: TreeWorkerRequest): TreeWorkerResponse {
    switch (request.type) {
      case "init": {
        this.snapshot = {
          ...request.snapshot,
          events: [...request.snapshot.events].sort(
            (left, right) => left.sequence - right.sequence,
          ),
        };
        this.quality = request.quality;
        this.v2 =
          request.snapshot.algorithmVersion === 2
            ? new TreeEngineV2(this.snapshot, request.quality)
            : null;
        return {
          type: "rebuilt",
          requestId: request.requestId,
          topology:
            this.v2?.render() ??
            buildTreeTopologyV1(this.snapshot, request.quality),
        };
      }
      case "append": {
        const previousSequence = this.lastSequence;
        const receivedSequence =
          request.events[0]?.sequence ?? request.fromSequence + 1;
        if (
          !this.snapshot ||
          request.treeId !== this.snapshot.treeId ||
          request.fromSequence !== previousSequence ||
          receivedSequence !== previousSequence + 1
        ) {
          return {
            type: "resync-required",
            requestId: request.requestId,
            expectedSequence: previousSequence + 1,
            receivedSequence,
          };
        }
        const sorted = [...request.events].sort(
          (left, right) => left.sequence - right.sequence,
        );
        for (let index = 0; index < sorted.length; index += 1) {
          if (sorted[index].sequence !== previousSequence + index + 1) {
            return {
              type: "resync-required",
              requestId: request.requestId,
              expectedSequence: previousSequence + index + 1,
              receivedSequence: sorted[index].sequence,
            };
          }
        }
        this.snapshot = {
          ...this.snapshot,
          events: [...this.snapshot.events, ...sorted],
          ...("memoryLineage" in this.snapshot || request.memoryLineage
            ? { memoryLineage: request.memoryLineage }
            : {}),
        };
        const topology = this.v2
          ? this.v2.append(sorted, request.memoryLineage)
          : buildTreeTopologyV1(this.snapshot, this.quality);
        return {
          type: "patched",
          requestId: request.requestId,
          previousSequence,
          nextSequence: topology.revision.lastSequence,
          topology,
        };
      }
      case "set-quality": {
        this.quality = request.quality;
        const topology = this.v2
          ? this.v2.setQuality(request.quality)
          : this.snapshot
            ? buildTreeTopologyV1(this.snapshot, request.quality)
            : null;
        if (!topology) {
          return {
            type: "resync-required",
            requestId: request.requestId,
            expectedSequence: 1,
            receivedSequence: 0,
          };
        }
        return {
          type: "rebuilt",
          requestId: request.requestId,
          topology,
        };
      }
    }
  }

  get lastSequence(): number {
    return (
      this.v2?.lastSequence ??
      this.snapshot?.events.at(-1)?.sequence ??
      0
    );
  }
}
