import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StoredAccount = {
  id: string;
  authSubjectId: string;
  email: string | null;
  displayName: string | null;
  treeSeed: string;
  treeAlgorithmVersion: number;
  createdAt: number;
  updatedAt: number;
};

const state = vi.hoisted(() => ({
  currentUser: null as {
    subjectId: string;
    email?: string;
    displayName?: string;
  } | null,
  accounts: new Map<string, StoredAccount>(),
  lookups: [] as string[],
}));

function subjectFromWhere(where: { queryChunks: unknown[] }): string {
  const parameter = where.queryChunks[3] as { value?: unknown };
  if (typeof parameter?.value !== "string") {
    throw new Error("The account lookup did not bind a subject ID.");
  }
  return parameter.value;
}

const fakeDb = vi.hoisted(() => ({
  query: {
    accounts: {
      findFirst: vi.fn(async ({ where }: { where: { queryChunks: unknown[] } }) => {
        const subjectId = subjectFromWhere(where);
        state.lookups.push(subjectId);
        return state.accounts.get(subjectId);
      }),
    },
  },
  insert: vi.fn(() => ({
    values: vi.fn((values: Omit<StoredAccount, "treeAlgorithmVersion">) => ({
      onConflictDoNothing: vi.fn(async () => {
        if (!state.accounts.has(values.authSubjectId)) {
          state.accounts.set(values.authSubjectId, {
            ...values,
            treeAlgorithmVersion: 2,
          });
        }
      }),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn((patch: Partial<StoredAccount>) => ({
      where: vi.fn(async ({ queryChunks }: { queryChunks: unknown[] }) => {
        const idParameter = queryChunks[3] as { value?: unknown };
        const account = [...state.accounts.values()].find(
          (candidate) => candidate.id === idParameter?.value,
        );
        if (!account) throw new Error("Account update target was not found.");
        Object.assign(account, patch);
      }),
    })),
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
  headers: vi.fn(async () => new Headers()),
}));
vi.mock("@/app/chatgpt-auth", () => ({
  getChatGPTUser: vi.fn(async () => state.currentUser),
}));
vi.mock("@/db", () => ({
  getDb: () => fakeDb,
}));

import { resolveApiAccount } from "../lib/auth/account";

const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

beforeEach(() => {
  mutableEnv.NODE_ENV = "development";
  state.currentUser = null;
  state.accounts.clear();
  state.lookups.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = originalNodeEnv;
});

describe("account identity resolution", () => {
  it("keeps one account when the same subject changes email", async () => {
    state.currentUser = {
      subjectId: "subject-a",
      email: "first@example.com",
      displayName: "First Name",
    };
    const first = await resolveApiAccount();

    state.currentUser = {
      subjectId: "subject-a",
      email: "renamed@example.com",
      displayName: "Renamed Name",
    };
    const second = await resolveApiAccount();

    expect(second.id).toBe(first.id);
    expect(second.authSubjectId).toBe("subject-a");
    expect(second.email).toBe("renamed@example.com");
    expect(second.displayName).toBe("Renamed Name");
    expect(state.accounts.size).toBe(1);
  });

  it("gives distinct subjects distinct account ownership", async () => {
    state.currentUser = {
      subjectId: "subject-a",
      email: "shared@example.com",
    };
    const first = await resolveApiAccount();

    state.currentUser = {
      subjectId: "subject-b",
      email: "shared@example.com",
    };
    const second = await resolveApiAccount();

    expect(second.id).not.toBe(first.id);
    expect(second.authSubjectId).toBe("subject-b");
    expect([...state.accounts.keys()]).toEqual(["subject-a", "subject-b"]);
    expect(state.lookups).toEqual([
      "subject-a",
      "subject-a",
      "subject-b",
      "subject-b",
    ]);
  });
});
