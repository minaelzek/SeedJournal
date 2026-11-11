import { redirect } from "next/navigation";
import { SeedJournalApp } from "@/features/app/SeedJournalApp";
import { getRequestPrincipal } from "@/lib/auth/principal";

export async function ProtectedSeedJournal({
  initialPath,
}: {
  initialPath: string;
}) {
  const principal = await getRequestPrincipal();
  if (!principal && process.env.NODE_ENV === "production") {
    redirect("/welcome");
  }

  const displayName =
    principal && principal.kind === "legacy"
      ? (principal.displayName ?? principal.email ?? "Gardener")
      : "Gardener";

  return (
    <SeedJournalApp initialPath={initialPath} displayName={displayName} />
  );
}
