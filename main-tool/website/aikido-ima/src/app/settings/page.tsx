import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import SettingsView from "@/components/SettingsView";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <div className="p-6 sm:p-8 max-w-[1600px] mx-auto">
        <SettingsView />
      </div>
    </DashboardShell>
  );
}
