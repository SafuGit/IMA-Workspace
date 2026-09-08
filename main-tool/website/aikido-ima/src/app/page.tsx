import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";
import DashboardShell from "@/components/DashboardShell";
import { formatCompactNumber, formatPercent, formatDate } from "@/lib/utils";
import {
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Mail,
  Search,
  ArrowRight,
  TrendingUp,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { YtChannel } from "@/lib/types";

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
  let recentChannels: YtChannel[] = [];
  let dbError: string | null = null;

  try {
    const [
      chStats,
      kwStats,
      emailStats,
      recentChRows,
    ] = await Promise.all([
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
      query<YtChannel>(`
        SELECT
          channel_id,
          channel_handle,
          channel_name,
          profile_photo_url,
          subscriber_count,
          avg_views,
          avg_engagement_rate,
          valid,
          rejection_reason,
          created_at
        FROM yt_channels
        ORDER BY created_at DESC
        LIMIT 6
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
    recentChannels = recentChRows;
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

        {/* Recent Channels Table */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white">Recently Discovered Creators</h2>
              <p className="text-xs text-slate-400 mt-0.5">Latest channels captured from keyword discovery runs</p>
            </div>
            <Link
              href="/channels"
              className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View All Channels <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                  <th className="py-3 px-5">Creator</th>
                  <th className="py-3 px-4">Subscribers</th>
                  <th className="py-3 px-4">Avg Views</th>
                  <th className="py-3 px-4">Engagement</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-sm">
                {recentChannels.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      No channels recorded yet in yt_channels table.
                    </td>
                  </tr>
                ) : (
                  recentChannels.map((channel) => (
                    <tr key={channel.channel_id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          {channel.profile_photo_url ? (
                            <img
                              src={channel.profile_photo_url}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                              {channel.channel_name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate text-xs flex items-center gap-1.5">
                              {channel.channel_name}
                              <a
                                href={`https://www.youtube.com/channel/${channel.channel_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-slate-300"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {channel.channel_handle || channel.channel_id}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-300">
                        {formatCompactNumber(channel.subscriber_count)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-300">
                        {formatCompactNumber(channel.avg_views)}
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-300">
                        {formatPercent(channel.avg_engagement_rate)}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {channel.valid === true ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        ) : channel.valid === false ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <HelpCircle className="w-3 h-3" /> Unreviewed
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-right">
                        <Link
                          href={`/channels?search=${encodeURIComponent(channel.channel_name)}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Review &rarr;
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
