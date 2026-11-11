import { describe, expect, it } from "vitest";
import {
  CARE_REMINDER_STORAGE_KEY,
  gentleCareNoteCopy,
  readGentleCareNoteEnabled,
  writeGentleCareNoteEnabled,
} from "../features/growth/careReminder";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

describe("gentle care note (no streak nag)", () => {
  it("reads disabled by default and persists opt-in only", () => {
    const storage = memoryStorage();
    expect(readGentleCareNoteEnabled(storage)).toBe(false);

    writeGentleCareNoteEnabled(true, storage);
    expect(storage.getItem(CARE_REMINDER_STORAGE_KEY)).toBe("1");
    expect(readGentleCareNoteEnabled(storage)).toBe(true);

    writeGentleCareNoteEnabled(false, storage);
    expect(storage.getItem(CARE_REMINDER_STORAGE_KEY)).toBeNull();
    expect(readGentleCareNoteEnabled(storage)).toBe(false);
  });

  it("shows calm copy only when opted in and today is still open", () => {
    expect(
      gentleCareNoteCopy({
        enabled: true,
        hasBegun: true,
        tendedToday: false,
      }),
    ).toMatch(/open to care/i);

    expect(
      gentleCareNoteCopy({
        enabled: false,
        hasBegun: true,
        tendedToday: false,
      }),
    ).toBeNull();

    expect(
      gentleCareNoteCopy({
        enabled: true,
        hasBegun: false,
        tendedToday: false,
      }),
    ).toBeNull();

    expect(
      gentleCareNoteCopy({
        enabled: true,
        hasBegun: true,
        tendedToday: true,
      }),
    ).toBeNull();

    expect(
      gentleCareNoteCopy({
        enabled: true,
        hasBegun: true,
        tendedToday: false,
        hasUnfinishedReflection: true,
      }),
    ).toBeNull();
  });

  it("never uses streak or failure language", () => {
    const copy = gentleCareNoteCopy({
      enabled: true,
      hasBegun: true,
      tendedToday: false,
    });
    expect(copy).toBeTruthy();
    expect(copy!.toLowerCase()).not.toMatch(/streak|missed|fail|guilt|xp|score/);
  });
});
