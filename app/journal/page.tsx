import { ProtectedSeedJournal } from "../protected-seed-journal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal" };

export default function JournalPage() {
  return <ProtectedSeedJournal initialPath="/journal" />;
}
