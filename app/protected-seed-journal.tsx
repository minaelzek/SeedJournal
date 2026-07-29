import { requireChatGPTUser } from "./chatgpt-auth";
import { SeedJournalApp } from "@/features/app/SeedJournalApp";

export async function ProtectedSeedJournal({
  initialPath,
}: {
  initialPath: string;
}) {
  const user = await requireChatGPTUser(initialPath);
  return (
    <SeedJournalApp
      initialPath={initialPath}
      displayName={user.displayName}
    />
  );
}
