import { chatGPTSignInPath } from "../chatgpt-auth";

export const metadata = {
  title: "Welcome",
};

export default function WelcomePage() {
  return (
    <main className="relative grid min-h-[100svh] overflow-hidden bg-[var(--color-background)] px-5 pb-[max(32px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[var(--color-text-primary)] sm:px-8 lg:px-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_28%,rgba(221,229,247,.13),transparent_22rem),radial-gradient(circle_at_72%_78%,rgba(242,182,205,.08),transparent_26rem),linear-gradient(145deg,var(--primitive-indigo),var(--primitive-void)_62%)]"
      />
      <nav className="relative z-10 flex items-start justify-between">
        <span className="font-[var(--font-poetic)] text-[28px] leading-9 sm:text-[32px]">
          Seed Journal
        </span>
        <a
          href={chatGPTSignInPath("/")}
          className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] border border-[var(--color-border)] px-4 text-[14px] text-[var(--color-text-primary)] no-underline transition-colors hover:bg-[var(--color-surface-raised)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
        >
          Sign in
        </a>
      </nav>
      <section className="relative z-10 my-auto max-w-[680px] pb-20 pt-24">
        <p className="mb-5 text-[13px] font-medium tracking-[0.06em] text-[var(--color-text-secondary)] uppercase">
          A private place to grow
        </p>
        <h1 className="m-0 text-balance font-[var(--font-poetic)] text-[48px] leading-[0.98] font-normal sm:text-[64px] lg:text-[76px]">
          Nurture what grows within.
        </h1>
        <p className="mt-7 max-w-[540px] text-[17px] leading-7 text-[var(--color-text-secondary)] sm:text-[18px] sm:leading-8">
          Reflect with care. Follow the questions that matter. Watch a living
          sakura carry every memory forward.
        </p>
        <a
          href={chatGPTSignInPath("/")}
          className="mt-10 inline-flex min-h-14 items-center rounded-[var(--radius-control)] bg-[var(--color-blossom-light)] px-6 text-[15px] font-semibold text-[var(--primitive-void)] no-underline transition-[opacity,transform] duration-150 hover:opacity-90 active:translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]"
        >
          Enter your garden
        </a>
        <p className="mt-5 text-[12px] leading-5 text-[var(--color-text-secondary)]">
          Your writing is encrypted in your browser before it is stored.
        </p>
      </section>
    </main>
  );
}
