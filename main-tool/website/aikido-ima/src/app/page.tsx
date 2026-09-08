import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import DashboardShell from "@/components/DashboardShell";
import {
  Users,
  CheckCircle2,
  Mail,
  Search,
  ArrowRight,
  HelpCircle,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.db) {
    redirect("/login");
  }

  // Fetch pipeline aggregates
  let totalChannels = 0;
  let unreviewed = 0;
  let approved = 0;
  let rejected = 0;
  let totalKeywords = 0;
  let activeKeywords = 0;
  let emailsDrafted = 0;
  let emailsSent = 0;
  let dbError: string | null = null;

  try {
    const [chStats, kwStats, emailStats] = await Promise.all([
      query<{
        total: string;
        unreviewed: string;
        approved: string;
        rejected: string;
      }>(`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE valid IS NULL)::text AS unreviewed,
          COUNT(*) FILTER (WHERE valid = TRUE)::text AS approved,
          COUNT(*) FILTER (WHERE valid = FALSE)::text AS rejected
        FROM yt_channels
      `),
      query<{ total: string; active: string }>(`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (WHERE used_in_current_cycle = TRUE)::text AS active
        FROM keywords
      `),
      query<{ drafted: string; sent: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE outreach_draft IS NOT NULL)::text AS drafted,
          COUNT(*) FILTER (WHERE outreach_sent_at IS NOT NULL)::text AS sent
        FROM influencer_emails
      `),
    ]);

    totalChannels = Number(chStats[0]?.total || 0);
    unreviewed = Number(chStats[0]?.unreviewed || 0);
    approved = Number(chStats[0]?.approved || 0);
    rejected = Number(chStats[0]?.rejected || 0);

    totalKeywords = Number(kwStats[0]?.total || 0);
    activeKeywords = Number(kwStats[0]?.active || 0);

    emailsDrafted = Number(emailStats[0]?.drafted || 0);
    emailsSent = Number(emailStats[0]?.sent || 0);
  } catch (err: unknown) {
    dbError = err instanceof Error ? err.message : "Failed to load overview data";
  }

  return (
    <DashboardShell>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              Pipeline Overview
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                Live DB
              </span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Real-time influencer qualification, keywords discovery, and email pipeline metrics.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/channels?tab=unreviewed"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Users className="w-3.5 h-3.5" />
              Review Candidates ({unreviewed})
            </Link>
            <Link
              href="/emails"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
            >
              <Mail className="w-3.5 h-3.5" />
              Morning Email Hub
            </Link>
          </div>
        </div>

        {dbError && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            Database Query Error: {dbError}
          </div>
        )}

        {/* Primary Metric Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Unreviewed */}
          <Link
            href="/channels?tab=unreviewed"
            className="group p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition-all shadow-lg hover:shadow-indigo-500/5"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Needs Review</span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-3">{unreviewed.toLocaleString()}</div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>Awaiting manual triage</span>
              <span className="text-indigo-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Review <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>

          {/* Card 2: Approved */}
          <Link
            href="/channels?tab=approved"
            className="group p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/40 transition-all shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Approved Creators</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-3">{approved.toLocaleString()}</div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>{totalChannels > 0 ? ((approved / totalChannels) * 100).toFixed(1) : 0}% of total discovery</span>
              <span className="text-emerald-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                View <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>

          {/* Card 3: Outreach Generated */}
          <Link
            href="/emails"
            className="group p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-violet-500/40 transition-all shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Generated Drafts</span>
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center border border-violet-500/20">
                <Mail className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-3">{emailsDrafted.toLocaleString()}</div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>{emailsSent} sent so far</span>
              <span className="text-violet-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Inspect <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>

          {/* Card 4: Keywords */}
          <Link
            href="/keywords"
            className="group p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-blue-500/40 transition-all shadow-lg"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Keywords in Cycle</span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                <Search className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-3">
              {activeKeywords} <span className="text-xs text-slate-500 font-normal">/ {totalKeywords}</span>
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <span>Total discovered: {totalChannels}</span>
              <span className="text-blue-400 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Manage <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </Link>
        </div>

        {/* Quick Workflow Action Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-500/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" /> Morning Outreach Routine
            </div>
            <h3 className="text-lg font-bold text-white">
              {unreviewed > 0
                ? `${unreviewed} creator candidates are waiting for your approval`
                : "All creator candidates have been reviewed"}
            </h3>
            <p className="text-xs text-slate-400">
              Approve the best channels to feed into tonight&apos;s automated email generation batch.
            </p>
          </div>
          <Link
            href="/channels?tab=unreviewed"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition-all shrink-0"
          >
            Start Triage Now <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </DashboardShell>
  );
}
