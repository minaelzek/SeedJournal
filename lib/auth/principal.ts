import { cookies, headers } from "next/headers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { allowDevAuth } from "./dev-auth";
import {
  readSessionTokenFromRequest,
  SESSION_COOKIE_DEV,
  SESSION_COOKIE_PROD,
} from "./session-cookie";

export type AuthProvider = "session" | "chatgpt" | "local";

export type RequestPrincipal =
  | {
      kind: "session";
      sessionToken: string;
    }
  | {
      kind: "legacy";
      provider: "chatgpt" | "local";
      subjectId: string;
      email?: string;
      displayName?: string;
    };

export async function getRequestPrincipal(): Promise<RequestPrincipal | null> {
  const sessionToken = await readSessionTokenFromCookies();
  if (sessionToken) {
    return { kind: "session", sessionToken };
  }

  const chatgpt = await getChatGPTUser();
  if (chatgpt && allowDevAuth()) {
    return {
      kind: "legacy",
      provider: chatgpt.subjectId.startsWith("local-") ? "local" : "chatgpt",
      subjectId: chatgpt.subjectId,
      ...(chatgpt.email ? { email: chatgpt.email } : {}),
      ...(chatgpt.displayName ? { displayName: chatgpt.displayName } : {}),
    };
  }

  return null;
}

async function readSessionTokenFromCookies(): Promise<string | null> {
  try {
    const store = await cookies();
    const parts: string[] = [];
    for (const name of [SESSION_COOKIE_PROD, SESSION_COOKIE_DEV]) {
      const value = store.get(name)?.value;
      if (value) parts.push(`${name}=${value}`);
    }
    if (parts.length > 0) {
      const token = readSessionTokenFromRequest(
        requestWithCookie(parts.join("; ")),
      );
      if (token) return token;
    }
  } catch {
    // cookies() can throw outside a request — fall through to headers.
  }

  try {
    const requestHeaders = await headers();
    const cookieHeader = requestHeaders.get("cookie");
    if (!cookieHeader) return null;
    return readSessionTokenFromRequest(requestWithCookie(cookieHeader));
  } catch {
    return null;
  }
}

function requestWithCookie(cookie: string): Request {
  return new Request("https://seed.local/", { headers: { cookie } });
}
