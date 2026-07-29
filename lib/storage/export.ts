import type {
  EncryptedEntryEnvelope,
  JournalEntryPayloadV1,
  TreeGrowthEvent,
} from "@/lib/contracts";
import type { ClientVaultMetadata } from "@/lib/crypto";

export interface EncryptedSeedJournalArchive {
  archiveVersion: 1;
  exportedAt: number;
  vault: ClientVaultMetadata & { revision: number };
  entries: EncryptedEntryEnvelope[];
  growthEvents: TreeGrowthEvent[];
}

export function buildEncryptedArchive(
  archive: Omit<EncryptedSeedJournalArchive, "archiveVersion" | "exportedAt">,
): Blob {
  const payload: EncryptedSeedJournalArchive = {
    archiveVersion: 1,
    exportedAt: Date.now(),
    vault: archive.vault,
    entries: archive.entries,
    growthEvents: archive.growthEvents,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/vnd.seedjournal.encrypted+json",
  });
}

export function buildReadableMarkdown(
  entries: Array<{
    payload: JournalEntryPayloadV1;
    completedAt?: number;
  }>,
): Blob {
  const sections = entries.map(({ payload, completedAt }) => {
    const title = payload.title.replaceAll(/\r?\n/gu, " ").trim() || "Untitled";
    const date = completedAt
      ? new Date(completedAt).toISOString().slice(0, 10)
      : "Draft";
    const lines = [`# ${title}`, "", `*${date}*`, "", payload.body];
    if (payload.followUp && !payload.followUp.skipped) {
      lines.push(
        "",
        `## ${payload.followUp.renderedText}`,
        "",
        payload.followUp.response,
      );
    }
    if (payload.seedInsight.trim()) {
      lines.push("", "## What I want to carry", "", payload.seedInsight);
    }
    return lines.join("\n");
  });
  return new Blob([sections.join("\n\n---\n\n")], {
    type: "text/markdown;charset=utf-8",
  });
}
