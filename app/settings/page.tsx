import { ProtectedSeedJournal } from "../protected-seed-journal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return <ProtectedSeedJournal initialPath="/settings" />;
}
