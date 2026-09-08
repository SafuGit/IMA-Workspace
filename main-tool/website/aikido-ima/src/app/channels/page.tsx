import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import ChannelsTable from "@/components/ChannelsTable";

export const dynamic = "force-dynamic";

interface ChannelsPageProps {
  searchParams: Promise<{ tab?: string; search?: string }>;
}

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  const { tab, search } = await searchParams;

  return (
    <DashboardShell>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Creators Triage</h1>
          <p className="text-sm text-slate-400 mt-1">
            Qualify incoming YouTube creators, approve high-fit candidates, and reject poor matches into the bin.
          </p>
        </div>

        <ChannelsTable
          initialTab={tab || "unreviewed"}
          initialSearch={search || ""}
        />
      </div>
    </DashboardShell>
  );
}
