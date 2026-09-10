"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatisticsData } from "@/lib/types";
import {
  TrendingUp,
  Users,
  CheckCircle2,
  Trash2,
  Loader2,
  Sparkles,
  Clock,
  Key,
  Video,
  Database,
  HardDrive,
  Layers,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export default function StatisticsView() {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const res = await fetch("/api/statistics");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to load statistics:", err);
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="py-24 text-center text-xs text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
        Calculating pipeline statistics and storage footprint...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
        No statistics available yet. Connect your database and run discovery to populate data.
      </div>
    );
  }

  const { overview, funnel, reasons, subscriberBuckets, topKeywords } = data;
  const totalRejections = reasons.reduce((sum, r) => sum + r.count, 0) || 1;
  const totalSubChannels = subscriberBuckets.reduce((sum, b) => sum + b.count, 0) || 1;

  // Conversion Funnel Stages
  const funnelSteps = [
    {
      label: "1. Discovered Channels",
      subtext: "Total channels cataloged across all scrapers",
      count: funnel.total,
      color: "bg-blue-500",
      pct: 100,
    },
    {
      label: "2. Target Audience Window (25K - 1M Subs)",
      subtext: "Filtered by optimal sponsorship subscriber range",
      count: funnel.fetched,
      color: "bg-cyan-500",
      pct: funnel.total > 0 ? (((funnel.fetched) / funnel.total) * 100).toFixed(1) : 0,
    },
    {
      label: '3. Qualified Creators ("The Perfect Ones")',
      subtext: "25K-1M subs + >25K avg views + >1% engagement",
      count: funnel.qualified,
      color: "bg-amber-500",
      pct: funnel.total > 0 ? (((funnel.qualified) / funnel.total) * 100).toFixed(1) : 0,
    },
    {
      label: "4. Approved for Outreach",
      subtext: "Manually vetted & accepted for campaign pitching",
      count: funnel.approved,
      color: "bg-emerald-500",
      pct: funnel.total > 0 ? (((funnel.approved) / funnel.total) * 100).toFixed(1) : 0,
    },
    {
      label: "5. Personalized Drafts Prepared",
      subtext: "AI custom hooks & sponsorship drafts generated",
      count: funnel.drafted,
      color: "bg-purple-500",
      pct: funnel.approved > 0 ? (((funnel.drafted) / funnel.approved) * 100).toFixed(1) : 0,
    },
    {
      label: "6. Outreach Dispatched",
      subtext: "Cold emails sent to verified creator mailboxes",
      count: funnel.sent,
      color: "bg-teal-500",
      pct: funnel.drafted > 0 ? (((funnel.sent) / funnel.drafted) * 100).toFixed(1) : 0,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">
          Showing real-time data calculated live from PostgreSQL relations.
        </div>
        <button
          onClick={() => loadStats(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-indigo-400" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh Stats"}
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {/* Card 1: Qualified Creators ("The Perfect Ones") - Highlighted */}
        <div className="relative overflow-hidden p-5 rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border-2 border-amber-500/40 shadow-lg shadow-amber-950/20 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Sparkles className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-amber-200">
                  Qualified Creators
                </h3>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/80">
                &ldquo;The Perfect Ones&rdquo;
              </p>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
              {overview.fetchedChannels > 0
                ? ((overview.qualifiedChannels / overview.fetchedChannels) * 100).toFixed(1)
                : 0}
              % Yield
            </span>
          </div>

          <div className="pt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {overview.qualifiedChannels.toLocaleString()}
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                25K – 1M Subs
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                &gt;25K Avg Views
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60">
                &gt;1.0% Engagement
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-amber-500/20 text-xs text-amber-300/80 flex items-center justify-between">
            <span>
              <strong className="text-amber-200 font-semibold">{overview.needReviewQualified.toLocaleString()}</strong> in review queue
            </span>
            <Link
              href="/channels?tab=unreviewed"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              Review Qualified →
            </Link>
          </div>
        </div>

        {/* Card 2: Need Review Queue (Explicitly Separated) */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-amber-500/20 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                <Clock className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white">Need Review (Triage)</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">
              Pending
            </span>
          </div>

          <div className="pt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {overview.needReviewChannels.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Unvetted channels awaiting approval or binning (<code className="text-slate-300 text-[11px]">valid IS NULL</code>).
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between">
            <span className="text-slate-400">
              <strong className="text-slate-200">{overview.needReviewQualified.toLocaleString()}</strong> meet &ldquo;Perfect&rdquo; criteria
            </span>
            <Link
              href="/channels?tab=unreviewed"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-yellow-400 hover:text-yellow-300 transition-colors"
            >
              Open Triage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Card 3: Approved Partners */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white">Approved Candidates</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              Ready for Outreach
            </span>
          </div>

          <div className="pt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {overview.approvedChannels.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              High-confidence channels approved for sponsorship pitching.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
            <span>
              <strong className="text-slate-200">{overview.draftedEmails}</strong> drafted •{" "}
              <strong className="text-slate-200">{overview.sentEmails}</strong> sent
            </span>
            <Link
              href="/channels?tab=approved"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              View Approved <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Card 4: Total Scraped & Audience Range */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Users className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white">Discovered Channels</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
              Total Catalog
            </span>
          </div>

          <div className="pt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {overview.totalChannels.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <strong className="text-slate-200">{overview.fetchedChannels.toLocaleString()}</strong> channels in target 25K–1M subscriber window.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs flex items-center justify-between text-slate-400">
            <span>
              {overview.rejectedChannels.toLocaleString()} disqualified in bin
            </span>
            <Link
              href="/channels?tab=rejected"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-slate-300 transition-colors"
            >
              View Bin →
            </Link>
          </div>
        </div>

        {/* Card 5: Videos Scraped */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                <Video className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white">Total Videos Scraped</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20 font-medium">
              yt_videos
            </span>
          </div>

          <div className="pt-1">
            <div className="text-3xl font-black text-white tracking-tight">
              {overview.totalVideos.toLocaleString()}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Indexed for engagement metrics, view averages, and hook transcriptions.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>
              ~{overview.totalChannels > 0 ? Math.round(overview.totalVideos / overview.totalChannels) : 0} videos / channel average
            </span>
            <span className="text-[11px] text-violet-400 font-medium">
              Metrics Indexed
            </span>
          </div>
        </div>

        {/* Card 6: Keyword Discovery Cycle */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Key className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white">Keyword Cycle Progress</h3>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
              {overview.keywordCycleProgressPct}% Done
            </span>
          </div>

          <div className="pt-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-white tracking-tight">
                {overview.usedKeywords.toLocaleString()}
              </span>
              <span className="text-sm font-semibold text-slate-400">
                / {overview.totalKeywords.toLocaleString()} keywords
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              <strong className="text-slate-200">{overview.unusedKeywords.toLocaleString()}</strong> keywords remaining in current discovery cycle.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-1.5">
            <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(2, overview.keywordCycleProgressPct))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Current Cycle Status</span>
              <Link
                href="/keywords"
                className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
              >
                Manage Keywords →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Database Storage Footprint Section */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              <Database className="w-4 h-4 text-indigo-400" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Database Storage & Infrastructure Footprint</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Physical relation disk usage reported by PostgreSQL engine (<code className="text-slate-300 text-[11px]">pg_total_relation_size</code>)
              </p>
            </div>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
            Postgres Live Metrics
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              <span>Channels Table Size</span>
            </div>
            <div className="text-xl font-bold text-white tracking-tight">
              {overview.channelsSize}
            </div>
            <p className="text-[11px] text-slate-500">
              Relation: <code className="text-slate-400">yt_channels</code>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Layers className="w-3.5 h-3.5 text-violet-400" />
              <span>Videos Table Size</span>
            </div>
            <div className="text-xl font-bold text-white tracking-tight">
              {overview.videosSize}
            </div>
            <p className="text-[11px] text-slate-500">
              Relation: <code className="text-slate-400">yt_videos</code>
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Database className="w-3.5 h-3.5 text-emerald-400" />
              <span>Total Database Size</span>
            </div>
            <div className="text-xl font-bold text-emerald-400 tracking-tight">
              {overview.dbSize}
            </div>
            <p className="text-[11px] text-slate-500">
              Full PostgreSQL database cluster
            </p>
          </div>
        </div>
      </div>

      {/* Funnel Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Influencer Conversion Funnel
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracking discovery drop-off from keyword scrape down to sent outreach
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
              {funnel.total > 0 ? ((funnel.qualified / funnel.total) * 100).toFixed(1) : 0}% Perfect Qualification Rate
            </span>
            <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
              {funnel.total > 0 ? ((funnel.approved / funnel.total) * 100).toFixed(1) : 0}% Approved Rate
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {funnelSteps.map((step, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-200">{step.label}</span>
                  <span className="text-slate-400 text-[11px] ml-2 hidden sm:inline">
                    — {step.subtext}
                  </span>
                </div>
                <span className="text-slate-400">
                  <span className="font-bold text-white">{step.count.toLocaleString()}</span> ({step.pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full ${step.color} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(1.5, Number(step.pct)))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rejection Analysis */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-red-400" />
              Rejection Reasons Breakdown (Bin Analysis)
            </h3>
            <span className="text-xs text-slate-500">{totalRejections} rejected</span>
          </div>

          <div className="space-y-3">
            {reasons.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No rejections recorded yet.</div>
            ) : (
              reasons.map((r) => {
                const pct = ((r.count / totalRejections) * 100).toFixed(1);
                return (
                  <div key={r.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize text-slate-300 font-medium">{r.reason}</span>
                      <span className="text-slate-400">
                        {r.count} <span className="text-slate-500">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-red-500/80 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Subscriber Audience Distribution */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Subscriber Size Distribution
            </h3>
            <span className="text-xs text-slate-500">Target: 25K - 1M</span>
          </div>

          <div className="space-y-3">
            {subscriberBuckets.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No subscriber data available.</div>
            ) : (
              subscriberBuckets.map((b) => {
                const pct = ((b.count / totalSubChannels) * 100).toFixed(1);
                return (
                  <div key={b.bucket} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300 font-medium">{b.bucket}</span>
                      <span className="text-slate-400">
                        {b.count} <span className="text-slate-500">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-indigo-500/80 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Top Performing Keywords by Yield */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          Top Performing Keywords (Highest Approved Yield)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/40">
                <th className="py-2.5 px-4">Keyword Query</th>
                <th className="py-2.5 px-4">Total Scraped</th>
                <th className="py-2.5 px-4">Approved Creators</th>
                <th className="py-2.5 px-4">Yield Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {topKeywords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No approved keyword data yet.
                  </td>
                </tr>
              ) : (
                topKeywords.map((k) => {
                  const rate = k.total > 0 ? ((k.approved / k.total) * 100).toFixed(1) : 0;
                  return (
                    <tr key={k.keyword} className="hover:bg-slate-800/30">
                      <td className="py-3 px-4 font-semibold text-white">{k.keyword}</td>
                      <td className="py-3 px-4 text-slate-300">{k.total}</td>
                      <td className="py-3 px-4 text-emerald-400 font-semibold">{k.approved}</td>
                      <td className="py-3 px-4 font-medium text-slate-300">{rate}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
