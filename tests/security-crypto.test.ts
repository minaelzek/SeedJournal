import { describe, expect, it } from "vitest";
import type { JournalEntryPayloadV1 } from "../lib/contracts";
import {
  createVault,
  decryptEntryPayload,
  encryptEntryPayload,
  rewrapVault,
  unlockVault,
} from "../lib/crypto";

const PASSPHRASE = "moonlit-garden-passphrase";
const ACCOUNT_ID = "607e2179-6007-4ec8-863d-0fae83c07b24";
const ENTRY_ID = "c303a753-78ab-4e39-bf68-b9651393c635";

const payload: JournalEntryPayloadV1 = {
  version: 1,
  kind: "entry",
  title: "A quiet evening",
  prompt: {
    id: "moment-1",
    libraryVersion: "1",
    category: "moment",
    renderedText: "What stayed with you today?",
  },
  body: "I noticed how calm the room became after the rain.",
  threads: ["calm"],
  tags: [],
  seedInsight: "Make room for quiet.",
  ritual: {
    conciseBodyOverride: false,
    conciseFollowUpOverride: false,
  },
};

describe("Seed Journal vault encryption", () => {
  it("round-trips an encrypted journal entry with a non-extractable key", async () => {
    const created = await createVault(PASSPHRASE);
    expect(created.vaultKey.extractable).toBe(false);
    const envelope = await encryptEntryPayload(
      created.vaultKey,
      ACCOUNT_ID,
      payload,
      {
        id: ENTRY_ID,
        state: "draft",
        revision: 1,
        clientCreatedAt: 1_725_000_000_000,
        clientUpdatedAt: 1_725_000_000_000,
      },
    );
    const unlocked = await unlockVault(created.metadata, PASSPHRASE);
    await expect(
      decryptEntryPayload(unlocked, ACCOUNT_ID, envelope),
    ).resolves.toEqual(payload);
  });

  it("uses a fresh IV for every encrypted revision", async () => {
    const { vaultKey } = await createVault(PASSPHRASE);
    const metadata = {
      id: ENTRY_ID,
      state: "draft" as const,
      revision: 1,
      clientCreatedAt: 1,
      clientUpdatedAt: 1,
    };
    const first = await encryptEntryPayload(
      vaultKey,
      ACCOUNT_ID,
      payload,
      metadata,
    );
    const second = await encryptEntryPayload(
      vaultKey,
      ACCOUNT_ID,
      payload,
      metadata,
    );
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects a wrong passphrase and authenticated-data tampering", async () => {
    const created = await createVault(PASSPHRASE);
    await expect(
      unlockVault(created.metadata, "this-is-not-the-passphrase"),
    ).rejects.toThrow("incorrect");
    const envelope = await encryptEntryPayload(
      created.vaultKey,
      ACCOUNT_ID,
      payload,
      {
        id: ENTRY_ID,
        state: "draft",
        revision: 1,
        clientCreatedAt: 1,
        clientUpdatedAt: 1,
      },
    );
    await expect(
      decryptEntryPayload(created.vaultKey, ACCOUNT_ID, {
        ...envelope,
        revision: 2,
      }),
    ).rejects.toThrow("could not be decrypted");
  });

  it("rewraps the same vault under a new passphrase", async () => {
    const created = await createVault(PASSPHRASE);
    const envelope = await encryptEntryPayload(
      created.vaultKey,
      ACCOUNT_ID,
      payload,
      {
        id: ENTRY_ID,
        state: "draft",
        revision: 1,
        clientCreatedAt: 1,
        clientUpdatedAt: 1,
      },
    );
    const rewrapped = await rewrapVault(
      created.metadata,
      PASSPHRASE,
      "a-new-moonlit-garden-passphrase",
    );
    expect(rewrapped.metadata.wrappedKey).not.toBe(created.metadata.wrappedKey);
    await expect(
      unlockVault(rewrapped.metadata, PASSPHRASE),
    ).rejects.toThrow("incorrect");
    const unlocked = await unlockVault(
      rewrapped.metadata,
      "a-new-moonlit-garden-passphrase",
    );
    await expect(
      decryptEntryPayload(unlocked, ACCOUNT_ID, envelope),
    ).resolves.toEqual(payload);
  });
});
