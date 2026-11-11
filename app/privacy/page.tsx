import type { Metadata } from "next";
import Link from "next/link";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Seed Journal encrypts, what a signed-in session can open, and what an export cannot do.",
};

export default function PrivacyPage() {
  return (
    <main className="sj-privacy" id="main-content">
      <nav className="sj-privacy__nav" aria-label="Privacy">
        <Link href="/welcome">Seed Journal</Link>
      </nav>
      <article>
        <p className="sj-privacy__eyebrow">A private garden</p>
        <h1>How a journal is kept.</h1>
        <p className="sj-privacy__lede">
          The words are yours. The garden can open them only while you are
          signed in. This page says exactly what that means.
        </p>

        <section>
          <h2>What is encrypted</h2>
          <p>
            Each entry is encrypted on this device before it is stored. The
            writing, the question, and the line you chose to carry are in that
            encrypted form. Seed Journal does not keep a recording of your
            voice. If you dictate, the browser may send audio to its own speech
            service. Only the words that land in the entry are saved.
          </p>
        </section>

        <section>
          <h2>What a signed-in session can open</h2>
          <p>
            Sign-in is with Google or Apple. There is no separate passphrase.
            After you sign in, this garden can unwrap the journal for that
            session and show it to you. That is account-private. It is not a
            lock that even we cannot open.
          </p>
        </section>

        <section>
          <h2>What the server still knows</h2>
          <p>
            The server stores the encrypted entries and the account they belong
            to. It also keeps what it needs to hold the garden together: that
            an entry exists, whether it is still a draft, when it was written
            and completed, and the order in which the tree grew. It does not
            keep a separate plain copy. It does keep the wrapped key, so a
            signed-in session can read the writing.
          </p>
        </section>

        <section>
          <h2>What delete removes</h2>
          <p>
            Deleting the journal removes the account, the entries, and the tree
            from the server, and clears the encrypted copy kept in this
            browser. Sessions for that account are closed. The garden cannot
            restore what you delete. If you want the words to survive, take a
            copy first.
          </p>
        </section>

        <section>
          <h2>What an export cannot do</h2>
          <p>
            An encrypted backup is a file for safekeeping. This garden cannot
            open it or import it back. A readable download is plain text.
            Anyone who receives that file can read every word. Treat it as a
            paper journal that has left the desk.
          </p>
        </section>
      </article>
    </main>
  );
}
