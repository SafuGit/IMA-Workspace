import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import StatisticsView from "@/components/StatisticsView";

export const dynamic = "force-dynamic";

export default async function StatisticsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline Statistics & Analytics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Macro-level conversion funnels, audience size distribution, and disqualified creator analytics.
          </p>
        </div>

        <StatisticsView />
      </div>
    </DashboardShell>
  );
}
