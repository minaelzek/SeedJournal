import Link from "next/link";
import { WelcomeLivingCompanion } from "./WelcomeLivingCompanion";
import { WelcomeSignIn } from "./WelcomeSignIn";
import "./welcome.css";

export const metadata = {
  title: "Welcome",
};

export default function WelcomePage() {
  return (
    <main className="sj-welcome" id="main-content">
      <div className="sj-welcome__sky" aria-hidden="true" />
      <div className="sj-welcome__garden" aria-hidden="true">
        <WelcomeLivingCompanion />
      </div>
      <nav className="sj-welcome__nav" aria-label="Welcome">
        <span className="sj-welcome__wordmark">Seed Journal</span>
        <Link className="sj-welcome__privacy" href="/privacy">
          Privacy
        </Link>
      </nav>
      <section className="sj-welcome__hero" aria-labelledby="sj-welcome-title">
        <h1 id="sj-welcome-title">A seed is waiting.</h1>
        <WelcomeSignIn />
      </section>
    </main>
  );
}
