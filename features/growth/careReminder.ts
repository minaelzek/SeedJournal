/**
 * Soft in-app care note preference — never a push-notification streak nag.
 * Stored only on this device (localStorage).
 */

export const CARE_REMINDER_STORAGE_KEY = "seed-journal:care-note-gentle";

export function readGentleCareNoteEnabled(
  storage?: Pick<Storage, "getItem"> | null,
): boolean {
  if (!storage) {
    if (typeof window === "undefined") return false;
    try {
      storage = window.localStorage;
    } catch {
      return false;
    }
  }
  try {
    return storage.getItem(CARE_REMINDER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeGentleCareNoteEnabled(
  enabled: boolean,
  storage?: Pick<Storage, "setItem" | "removeItem"> | null,
): void {
  if (!storage) {
    if (typeof window === "undefined") return;
    try {
      storage = window.localStorage;
    } catch {
      return;
    }
  }
  try {
    if (enabled) storage.setItem(CARE_REMINDER_STORAGE_KEY, "1");
    else storage.removeItem(CARE_REMINDER_STORAGE_KEY);
  } catch {
    // Quota / private mode — fail quiet.
  }
}

/**
 * Calm home footnote when the user opted in and today is still open.
 * Never frames absence as failure.
 */
export function gentleCareNoteCopy(input: {
  enabled: boolean;
  hasBegun: boolean;
  tendedToday: boolean;
  hasUnfinishedReflection?: boolean;
}): string | null {
  if (!input.enabled) return null;
  if (!input.hasBegun) return null;
  if (input.hasUnfinishedReflection) return null;
  if (input.tendedToday) return null;
  return "The sakura is open to care today — only if you feel like writing.";
}
