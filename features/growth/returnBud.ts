import type { JournalEntryPayloadV1 } from "@/lib/contracts";

export interface ReturnBudCandidate {
  id: string;
  completedAt?: number;
  payload: Pick<JournalEntryPayloadV1, "returnBud" | "seedInsight">;
}

export interface DueReturnBud {
  entryId: string;
  seedInsight: string;
  dueLocalDay: string;
}

export function selectDueReturnBud(
  entries: readonly ReturnBudCandidate[],
  todayLocalDay: string,
): DueReturnBud | null {
  const due = entries
    .filter((entry) => {
      const bud = entry.payload.returnBud;
      return (
        Boolean(entry.completedAt) &&
        Boolean(entry.payload.seedInsight.trim()) &&
        bud?.state === "waiting" &&
        bud.dueLocalDay <= todayLocalDay
      );
    })
    .sort(
      (left, right) => (right.completedAt ?? 0) - (left.completedAt ?? 0),
    )[0];

  if (!due?.payload.returnBud) return null;
  return {
    entryId: due.id,
    seedInsight: due.payload.seedInsight.trim(),
    dueLocalDay: due.payload.returnBud.dueLocalDay,
  };
}
