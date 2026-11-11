import { afterEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

import {
  getChatGPTUser,
  LOCAL_PREVIEW_SUBJECT_ID,
} from "../app/chatgpt-auth";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  headersMock.mockReset();
  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

describe("ChatGPT authenticated principal", () => {
  it("rejects a production request without a stable subject ID", async () => {
    mutableEnv.NODE_ENV = "production";
    headersMock.mockResolvedValue(
      new Headers({
        "oai-authenticated-user-email": "gardener@example.com",
      }),
    );

    await expect(getChatGPTUser()).resolves.toBeNull();
  });

  it("uses the same deterministic subject ID for local preview", async () => {
    mutableEnv.NODE_ENV = "development";
    headersMock.mockResolvedValue(new Headers({ host: "127.0.0.1:3000" }));

    await expect(getChatGPTUser()).resolves.toMatchObject({
      subjectId: LOCAL_PREVIEW_SUBJECT_ID,
      email: "local-preview@seedjournal.invalid",
    });
    await expect(getChatGPTUser()).resolves.toMatchObject({
      subjectId: LOCAL_PREVIEW_SUBJECT_ID,
    });
  });

  it("reads subject ID and optional profile headers only on loopback during development", async () => {
    mutableEnv.NODE_ENV = "development";
    headersMock.mockResolvedValue(
      new Headers({
        host: "localhost:3000",
        "oai-authenticated-user-id": " subject-123 ",
        "oai-authenticated-user-email": "gardener@example.com",
        "oai-authenticated-user-full-name": "Mina%20Gardener",
        "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
      }),
    );

    await expect(getChatGPTUser()).resolves.toEqual({
      subjectId: "subject-123",
      email: "gardener@example.com",
      displayName: "Mina Gardener",
    });
  });

  it("ignores identity headers in production, on a public host, and when NODE_ENV is unset", async () => {
    const headers = new Headers({
      host: "127.0.0.1:3000",
      "oai-authenticated-user-id": "subject-123",
      "oai-authenticated-user-email": "gardener@example.com",
    });
    mutableEnv.NODE_ENV = "production";
    headersMock.mockResolvedValue(headers);
    await expect(getChatGPTUser()).resolves.toBeNull();

    mutableEnv.NODE_ENV = "development";
    headersMock.mockResolvedValue(
      new Headers({
        host: "seed.example",
        "oai-authenticated-user-id": "subject-123",
      }),
    );
    await expect(getChatGPTUser()).resolves.toBeNull();

    delete mutableEnv.NODE_ENV;
    headersMock.mockResolvedValue(headers);
    await expect(getChatGPTUser()).resolves.toBeNull();
  });
});
