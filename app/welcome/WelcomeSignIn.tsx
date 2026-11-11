"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface AuthProviders {
  google: { enabled: boolean; clientId?: string };
  apple: { enabled: boolean; clientId?: string };
  localGarden: boolean;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            ux_mode?: "popup";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme: "outline";
              size: "large";
              shape: "pill";
              text: "continue_with";
              width: number;
            },
          ) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization?: { id_token?: string };
        }>;
      };
    };
  }
}

export function WelcomeSignIn() {
  const [providers, setProviders] = useState<AuthProviders>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const googleButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetch("/api/auth/providers", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("providers");
        setProviders((await response.json()) as AuthProviders);
      })
      .catch(() => {
        setProviders({
          google: { enabled: false },
          apple: { enabled: false },
          localGarden: process.env.NODE_ENV !== "production",
        });
      });
  }, []);

  const completeSocial = useCallback(
    async (provider: "google" | "apple", idToken: string) => {
      setPending(true);
      setError(undefined);
      try {
        const token = await ensureCsrf();
        const response = await fetch("/api/auth/social", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-seedjournal-csrf": token,
          },
          body: JSON.stringify({ provider, idToken }),
        });
        if (!response.ok) {
          throw new Error("sign-in");
        }
        window.location.assign("/?arrive=1");
      } catch {
        setError("The garden could not open that sign-in. Please try again.");
        setPending(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!providers?.google.enabled || !providers.google.clientId) return;
    const clientId = providers.google.clientId;
    const mount = googleButton.current;
    if (!mount) return;

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google || !mount) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "popup",
        callback: (response) => {
          void completeSocial("google", response.credential);
        },
      });
      window.google.accounts.id.renderButton(mount, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320,
      });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [completeSocial, providers]);

  const continueLocal = async () => {
    setPending(true);
    setError(undefined);
    try {
      const token = await ensureCsrf();
      const response = await fetch("/api/auth/dev-session", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-seedjournal-csrf": token,
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("local");
      window.location.assign("/?arrive=1");
    } catch {
      setError("The local garden could not open.");
      setPending(false);
    }
  };

  const signInWithApple = async () => {
    if (!providers?.apple.enabled || !providers.apple.clientId) return;
    setPending(true);
    setError(undefined);
    try {
      await loadAppleScript();
      window.AppleID?.auth.init({
        clientId: providers.apple.clientId,
        scope: "name email",
        redirectURI: window.location.origin,
        usePopup: true,
      });
      const result = await window.AppleID?.auth.signIn();
      const idToken = result?.authorization?.id_token;
      if (!idToken) throw new Error("apple");
      await completeSocial("apple", idToken);
    } catch {
      setError("Apple sign-in did not finish.");
      setPending(false);
    }
  };

  return (
    <div className="sj-welcome__auth" aria-busy={pending || undefined}>
      {providers?.google.enabled ? (
        <div
          ref={googleButton}
          className="sj-welcome__google"
          inert={pending ? true : undefined}
        />
      ) : null}
      {providers?.apple.enabled ? (
        <button
          type="button"
          className="sj-welcome__cta sj-welcome__cta--apple"
          onClick={() => void signInWithApple()}
          disabled={pending}
        >
          Continue with Apple
        </button>
      ) : null}
      {providers?.localGarden ? (
        <button
          type="button"
          className="sj-welcome__cta"
          onClick={() => void continueLocal()}
          disabled={pending}
        >
          Continue in this garden
        </button>
      ) : null}
      {!providers ? (
        <p className="sj-welcome__footnote">Opening the gate…</p>
      ) : null}
      {providers &&
      !providers.google.enabled &&
      !providers.apple.enabled &&
      !providers.localGarden ? (
        <p className="sj-welcome__footnote">
          This garden opens with Google or Apple. Sign-in is not ready on
          this host yet.
        </p>
      ) : null}
      {pending ? (
        <p className="sj-welcome__status" role="status">
          Opening the garden…
        </p>
      ) : null}
      {error ? (
        <p className="sj-welcome__error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sj-welcome__footnote">
        Private to your Google or Apple account. Entries are encrypted before
        they are stored. A signed-in session can open them. This is not a
        zero-knowledge vault.
      </p>
    </div>
  );
}

async function ensureCsrf(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("csrf");
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("csrf");
  return body.csrfToken;
}

function loadAppleScript(): Promise<void> {
  if (window.AppleID) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("apple-script"));
    document.head.appendChild(script);
  });
}
