import { describe, expect, it } from "vitest";
import {
  monthDayFromLocalDay,
  selectOnThisDayMemories,
} from "../features/growth/onThisDay";

describe("On This Day rediscovery", () => {
  it("extracts month-day from local days", () => {
    expect(monthDayFromLocalDay("2024-03-15")).toBe("03-15");
    expect(monthDayFromLocalDay("bad")).toBeNull();
  });

  it("returns past petals that share today's calendar date without including today", () => {
    const memories = [
      {
        entryId: "a",
        localDay: "2023-03-15",
        dateLabel: "Mar 15, 2023",
      },
      {
        entryId: "b",
        localDay: "2024-03-15",
        dateLabel: "Mar 15, 2024",
      },
      {
        entryId: "today",
        localDay: "2025-03-15",
        dateLabel: "Mar 15, 2025",
      },
      {
        entryId: "other",
        localDay: "2024-07-01",
        dateLabel: "Jul 1, 2024",
      },
    ];

    const hits = selectOnThisDayMemories(memories, "2025-03-15", {
      excludeToday: true,
      limit: 5,
    });

    expect(hits.map((memory) => memory.entryId)).toEqual(["a", "b"]);
  });

  it("respects limit and excludes unrelated days", () => {
    const memories = Array.from({ length: 6 }, (_, index) => ({
      entryId: `y${index}`,
      localDay: `${2018 + index}-08-01`,
    }));

    const hits = selectOnThisDayMemories(memories, "2026-08-01", {
      limit: 2,
    });

    expect(hits).toHaveLength(2);
    expect(hits[0]?.entryId).toBe("y0");
  });
});
