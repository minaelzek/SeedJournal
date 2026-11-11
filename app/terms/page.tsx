import type { Metadata } from "next";
import Link from "next/link";
import "../privacy/privacy.css";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The plain terms for using Seed Journal: a private account, encrypted entries, and deletion that cannot be undone.",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="sj-privacy" id="main-content">
      <nav className="sj-privacy__nav" aria-label="Terms">
        <Link href="/welcome">Seed Journal</Link>
        {" · "}
        <Link href="/privacy">Privacy</Link>
      </nav>
      <article>
        <p className="sj-privacy__eyebrow">Before you plant</p>
        <h1>Terms of the garden.</h1>
        <p className="sj-privacy__lede">
          Seed Journal is a private reflection journal. These terms say what
          the garden does today. They are not a substitute for advice from
          your own counsel before a public launch.
        </p>

        <section>
          <h2>The account is yours</h2>
          <p>
            You sign in with Google or Apple. The journal is tied to that
            account. Do not share the signed-in browser with someone who
            should not read the writing. A quiet stretch locks the garden on
            this device; the server also expires an unused session.
          </p>
        </section>

        <section>
          <h2>What is stored</h2>
          <p>
            Entries are encrypted before they are stored. A signed-in session
            can open them. This is not a lock that even the operator cannot
            open. The server also keeps the account, the fact that an entry
            exists, and the order in which the tree grew. Details are on the
            privacy page.
          </p>
        </section>

        <section>
          <h2>Copies and deletion</h2>
          <p>
            You can download an encrypted copy by choosing a passphrase for
            that file, or a readable copy that is plain text. The garden does
            not import either file back. Deleting the journal removes the
            account and its entries from the live database and closes its
            sessions. That cannot be undone from inside the garden. Platform
            backups outside the app may keep a copy until the host’s own
            retention expires.
          </p>
        </section>

        <section>
          <h2>The garden is a tool, not a therapist</h2>
          <p>
            Prompts are local and deterministic. They are not medical, legal,
            or crisis care. If you are in danger, contact local emergency
            services.
          </p>
        </section>

        <section>
          <h2>Acceptable use</h2>
          <p>
            Do not use the garden to break the law, to attempt to read someone
            else’s journal, or to disrupt the service. Sign-in tokens and
            sessions may be rejected when they are invalid, expired, or sent
            from a context the garden does not trust.
          </p>
        </section>
      </article>
    </main>
  );
}
