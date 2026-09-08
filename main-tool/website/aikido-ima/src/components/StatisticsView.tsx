"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Users,
  CheckCircle2,
  Mail,
  Send,
  Trash2,
  PieChart,
  BarChart,
  Loader2,
  Sparkles,
} from "lucide-react";

interface StatisticsData {
  funnel: {
    total: number;
    unreviewed: number;
    approved: number;
    rejected: number;
    drafted: number;
    sent: number;
  };
  reasons: { reason: string; count: number }[];
  subscriberBuckets: { bucket: string; count: number }[];
  topKeywords: { keyword: string; total: number; approved: number }[];
}

export default function StatisticsView() {
  const [data, setData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/statistics");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="py-24 text-center text-xs text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
        Calculating pipeline statistics...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
        No statistics available yet. Run discovery to populate data.
      </div>
    );
  }

  const { funnel, reasons, subscriberBuckets, topKeywords } = data;
  const totalRejections = reasons.reduce((sum, r) => sum + r.count, 0) || 1;
  const totalSubChannels = subscriberBuckets.reduce((sum, b) => sum + b.count, 0) || 1;

  // Funnel steps
  const funnelSteps = [
    { label: "1. Discovered Creators", count: funnel.total, color: "bg-blue-500", pct: 100 },
    {
      label: "2. Evaluated & Triage",
      count: funnel.approved + funnel.rejected,
      color: "bg-indigo-500",
      pct: funnel.total > 0 ? (((funnel.approved + funnel.rejected) / funnel.total) * 100).toFixed(1) : 0,
    },
    {
      label: "3. Approved for Outreach",
      count: funnel.approved,
      color: "bg-emerald-500",
      pct: funnel.total > 0 ? ((funnel.approved / funnel.total) * 100).toFixed(1) : 0,
    },
    {
      label: "4. Personalized Emails Drafted",
      count: funnel.drafted,
      color: "bg-violet-500",
      pct: funnel.approved > 0 ? ((funnel.drafted / funnel.approved) * 100).toFixed(1) : 0,
    },
    {
      label: "5. Outreach Dispatched",
      count: funnel.sent,
      color: "bg-teal-500",
      pct: funnel.drafted > 0 ? ((funnel.sent / funnel.drafted) * 100).toFixed(1) : 0,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Funnel Section */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-400" />
              Influencer Conversion Funnel
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tracking discovery drop-off from keyword scrape down to sent outreach
            </p>
          </div>
          <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
            {funnel.total > 0 ? ((funnel.approved / funnel.total) * 100).toFixed(1) : 0}% Qualified Rate
          </span>
        </div>

        <div className="space-y-4">
          {funnelSteps.map((step, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">{step.label}</span>
                <span className="text-slate-400">
                  <span className="font-bold text-white">{step.count.toLocaleString()}</span> ({step.pct}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full ${step.color} rounded-full transition-all duration-500`}
                  style={{ width: `${Math.min(100, Math.max(2, Number(step.pct)))}%` }}
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
