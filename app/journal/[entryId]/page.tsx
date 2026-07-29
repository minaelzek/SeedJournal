import { ProtectedSeedJournal } from "../../protected-seed-journal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memory" };

export default async function EntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  return <ProtectedSeedJournal initialPath={`/journal/${entryId}`} />;
}
