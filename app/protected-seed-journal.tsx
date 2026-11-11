import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SeedJournalApp } from "@/features/app/SeedJournalApp";
import { devAuthAllowedForHostHeader } from "@/lib/auth/dev-auth";
import { getRequestPrincipal } from "@/lib/auth/principal";

export async function ProtectedSeedJournal({
  initialPath,
}: {
  initialPath: string;
}) {
  const principal = await getRequestPrincipal();
  const requestHeaders = await headers();
  if (!principal && !devAuthAllowedForHostHeader(requestHeaders.get("host"))) {
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
