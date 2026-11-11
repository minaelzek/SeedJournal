import { describe, expect, it } from "vitest";
import { bytesToBase64 } from "../lib/crypto/encoding";
import {
  developmentWrapKeyBytes,
  loadMasterWrapKey,
  WrapKeyConfigurationError,
} from "../lib/auth/wrap-key";

describe("account wrap key", () => {
  it("requires a configured key outside local development", async () => {
    await expect(loadMasterWrapKey(undefined, false)).rejects.toBeInstanceOf(
      WrapKeyConfigurationError,
    );
    await expect(loadMasterWrapKey("not base64", false)).rejects.toThrow(
      "32 bytes",
    );
  });

  it("refuses the public development key when development auth is off", async () => {
    const devKey = bytesToBase64(await developmentWrapKeyBytes());
    await expect(loadMasterWrapKey(devKey, false)).rejects.toThrow(
      "development wrap key",
    );
    await expect(loadMasterWrapKey(devKey, true)).resolves.toMatchObject({
      type: "secret",
    });
  });

  it("imports a random 32-byte key for production", async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await loadMasterWrapKey(bytesToBase64(raw), false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect(key.extractable).toBe(false);
  });
});
