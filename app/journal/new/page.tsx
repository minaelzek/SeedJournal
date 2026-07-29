import { ProtectedSeedJournal } from "../../protected-seed-journal";

export const dynamic = "force-dynamic";
export const metadata = { title: "New reflection" };

export default function NewJournalPage() {
  return <ProtectedSeedJournal initialPath="/journal/new" />;
}
