import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import KeywordsTable from "@/components/KeywordsTable";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  return (
    <DashboardShell>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Discovery Keywords</h1>
          <p className="text-sm text-slate-400 mt-1">
            Track performance of search queries, analyze creator yield rates, and manage discovery cycles.
          </p>
        </div>

        <KeywordsTable />
      </div>
    </DashboardShell>
  );
}
