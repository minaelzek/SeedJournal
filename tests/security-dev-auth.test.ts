import { afterEach, describe, expect, it } from "vitest";
import {
  allowDevAuth,
  devAuthAllowedForHostHeader,
  devAuthAllowedForRequest,
  hostnameFromHostHeader,
} from "../lib/auth/dev-auth";

const originalNodeEnv = process.env.NODE_ENV;
const originalFlag = process.env.SEED_JOURNAL_DEV_AUTH;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalFlag === undefined) delete mutableEnv.SEED_JOURNAL_DEV_AUTH;
  else mutableEnv.SEED_JOURNAL_DEV_AUTH = originalFlag;
});

describe("development auth gate", () => {
  it("parses host headers", () => {
    expect(hostnameFromHostHeader("127.0.0.1:3000")).toBe("127.0.0.1");
    expect(hostnameFromHostHeader("[::1]:3000")).toBe("::1");
    expect(hostnameFromHostHeader("Seed.Example")).toBe("seed.example");
  });

  it("allows development only, and never production", () => {
    mutableEnv.NODE_ENV = "development";
    expect(allowDevAuth()).toBe(true);
    mutableEnv.NODE_ENV = "production";
    expect(allowDevAuth()).toBe(false);
    delete mutableEnv.NODE_ENV;
    expect(allowDevAuth()).toBe(false);
    mutableEnv.NODE_ENV = "test";
    expect(allowDevAuth()).toBe(false);
  });

  it("lets an explicit flag opt in without opening production", () => {
    delete mutableEnv.NODE_ENV;
    mutableEnv.SEED_JOURNAL_DEV_AUTH = "1";
    expect(allowDevAuth()).toBe(true);
    mutableEnv.NODE_ENV = "production";
    expect(allowDevAuth()).toBe(false);
  });

  it("keeps the explicit opt-in off a production build's NODE_ENV and can be forced off", () => {
    mutableEnv.NODE_ENV = "development";
    mutableEnv.SEED_JOURNAL_DEV_AUTH = "0";
    expect(allowDevAuth()).toBe(false);
    expect(
      devAuthAllowedForRequest(
        new Request("http://127.0.0.1:3000/api/auth/dev-session"),
      ),
    ).toBe(false);
  });

  it("requires a loopback host unless the explicit flag is set", () => {
    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.SEED_JOURNAL_DEV_AUTH;
    expect(devAuthAllowedForHostHeader("127.0.0.1:3000")).toBe(true);
    expect(devAuthAllowedForHostHeader("seed.example")).toBe(false);
    mutableEnv.SEED_JOURNAL_DEV_AUTH = "1";
    expect(devAuthAllowedForHostHeader("seed.example")).toBe(true);
  });
});
