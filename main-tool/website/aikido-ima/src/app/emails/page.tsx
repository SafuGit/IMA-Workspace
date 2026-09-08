import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import DashboardShell from "@/components/DashboardShell";
import EmailsReviewHub from "@/components/EmailsReviewHub";

export const dynamic = "force-dynamic";

interface EmailsPageProps {
  searchParams: Promise<{ channelId?: string }>;
}

export default async function EmailsPage({ searchParams }: EmailsPageProps) {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  const { channelId } = await searchParams;

  return (
    <DashboardShell>
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Morning Outreach Hub</h1>
          <p className="text-sm text-slate-400 mt-1">
            Review your overnight batch of 20–30 personalized creator emails, inspect video hooks, polish copy, and dispatch outreach.
          </p>
        </div>

        <EmailsReviewHub initialChannelId={channelId} />
      </div>
    </DashboardShell>
  );
}
