import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import ChannelsTable from "@/components/ChannelsTable";

export const dynamic = "force-dynamic";

interface ChannelsPageProps {
  searchParams: Promise<{ tab?: string; search?: string; scope?: string }>;
}

export default async function ChannelsPage({ searchParams }: ChannelsPageProps) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  const { tab, search, scope } = await searchParams;

  return (
    <DashboardShell>
      <div className="p-6 sm:p-8 max-w-[1600px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Creators Triage & Qualification</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review top-tier qualified creators (&ldquo;The Perfect Ones&rdquo;), triage incoming YouTube channels, and manage approvals.
          </p>
        </div>

        <ChannelsTable
          initialTab={tab || "qualified"}
          initialSearch={search || ""}
          initialScope={scope || "unreviewed"}
        />
      </div>
    </DashboardShell>
  );
}
