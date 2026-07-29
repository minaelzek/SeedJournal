export interface EditingPresence {
  type: "editing" | "closed";
  entryId: string;
  tabId: string;
  sentAt: number;
}

export function createEditingChannel(
  accountId: string,
  onPresence: (presence: EditingPresence) => void,
): {
  announce: (entryId: string, editing: boolean) => void;
  close: () => void;
} {
  if (typeof BroadcastChannel === "undefined") {
    return { announce: () => undefined, close: () => undefined };
  }
  const channel = new BroadcastChannel(`seedjournal-editing-${accountId}`);
  const tabId = crypto.randomUUID();
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isEditingPresence(event.data) && event.data.tabId !== tabId) {
      onPresence(event.data);
    }
  };
  return {
    announce(entryId, editing) {
      channel.postMessage({
        type: editing ? "editing" : "closed",
        entryId,
        tabId,
        sentAt: Date.now(),
      } satisfies EditingPresence);
    },
    close() {
      channel.close();
    },
  };
}

function isEditingPresence(value: unknown): value is EditingPresence {
  if (!value || typeof value !== "object") return false;
  const presence = value as Partial<EditingPresence>;
  return (
    (presence.type === "editing" || presence.type === "closed") &&
    typeof presence.entryId === "string" &&
    typeof presence.tabId === "string" &&
    typeof presence.sentAt === "number"
  );
}
