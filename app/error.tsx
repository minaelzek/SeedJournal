"use client";

import Link from "next/link";
import "@/features/shell/shell.css";

export default function GardenError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="sj-lost" id="main-content">
      <span className="sj-lost__seed" aria-hidden="true" />
      <h1>The garden stumbled.</h1>
      <div className="sj-lost__actions">
        <button type="button" className="sj-lost__retry" onClick={() => reset()}>
          Try again
        </button>
        <Link className="sj-lost__home" href="/">
          Return home
        </Link>
      </div>
    </main>
  );
}
