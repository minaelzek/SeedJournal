import { ProtectedSeedJournal } from "./protected-seed-journal";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <ProtectedSeedJournal initialPath="/" />;
}
