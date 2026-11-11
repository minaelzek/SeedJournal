import Link from "next/link";
import "@/features/shell/shell.css";

export default function NotFound() {
  return (
    <main className="sj-lost" id="main-content">
      <span className="sj-lost__seed" aria-hidden="true" />
      <h1>This path does not grow here.</h1>
      <Link className="sj-lost__home" href="/">
        Return home
      </Link>
    </main>
  );
}
