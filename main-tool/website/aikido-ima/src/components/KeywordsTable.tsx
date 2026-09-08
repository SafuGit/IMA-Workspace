"use client";

import { useState, useEffect, useCallback } from "react";
import { Keyword } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import {
  Search,
  Plus,
  RotateCcw,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Loader2,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export default function KeywordsTable() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // Add keyword modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newKeywordText, setNewKeywordText] = useState("");
  const [addingLoading, setAddingLoading] = useState(false);
  const [resettingCycle, setResettingCycle] = useState(false);

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, filter });
      const res = await fetch(`/api/keywords?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setKeywords(data.keywords || []);
      }
    } catch (err) {
      console.error("Failed to fetch keywords:", err);
    } finally {
      setLoading(false);
    }
  }, [search, filter]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  const handleToggleCycle = async (id: number, current: boolean) => {
    try {
      const res = await fetch(`/api/keywords/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ used_in_current_cycle: !current }),
      });

      if (res.ok) {
        setKeywords((prev) =>
          prev.map((k) => (k.id === id ? { ...k, used_in_current_cycle: !current } : k))
        );
      }
    } catch (err) {
      console.error("Failed to toggle keyword:", err);
    }
  };

  const handleResetCycle = async () => {
    if (!confirm("Are you sure you want to reset the discovery cycle for all keywords?")) return;
    setResettingCycle(true);
    try {
      const res = await fetch(`/api/keywords/reset-cycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchKeywords();
      }
    } finally {
      setResettingCycle(false);
    }
  };

  const handleAddKeywords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeywordText.trim()) return;

    setAddingLoading(true);
    try {
      const lines = newKeywordText
        .split(/[\n,]+/)
        .map((k) => k.trim())
        .filter(Boolean);

      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: lines }),
      });

      if (res.ok) {
        setNewKeywordText("");
        setIsAddOpen(false);
        fetchKeywords();
      }
    } finally {
      setAddingLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* Cycle Filter */}
          <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
            {[
              { id: "all", label: "All Keywords" },
              { id: "active", label: "Active in Cycle" },
              { id: "unused", label: "Pending Next Run" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filter === t.id
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            onClick={handleResetCycle}
            disabled={resettingCycle}
            title="Reset cycle flags so all keywords run again"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resettingCycle ? "animate-spin" : ""}`} />
            Reset Cycle
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder:text-slate-500"
            />
          </div>

          {/* Add Keyword Button */}
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Keywords
          </button>
        </div>
      </div>

      {/* Keywords Table */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                <th className="py-3 px-5">Keyword Query</th>
                <th className="py-3 px-4">Cycle Status</th>
                <th className="py-3 px-4">Channels Matched</th>
                <th className="py-3 px-4">Approved Yield</th>
                <th className="py-3 px-4">Usage Count</th>
                <th className="py-3 px-4">Last Discovered</th>
                <th className="py-3 px-5 text-right">View Channels</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading keywords performance...
                  </td>
                </tr>
              ) : keywords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-500">
                    No keywords found. Click &quot;+ Add Keywords&quot; to seed your discovery list.
                  </td>
                </tr>
              ) : (
                keywords.map((kw) => {
                  const totalMatched = Number(kw.total_matched) || 0;
                  const passed = Number(kw.passed_gate) || 0;
                  const yieldRate = totalMatched > 0 ? ((passed / totalMatched) * 100).toFixed(1) : "0";

                  return (
                    <tr key={kw.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-white text-xs">
                        {kw.text}
                      </td>

                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleToggleCycle(kw.id, kw.used_in_current_cycle)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                            kw.used_in_current_cycle
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
                              : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              kw.used_in_current_cycle ? "bg-blue-400" : "bg-slate-500"
                            }`}
                          />
                          {kw.used_in_current_cycle ? "Used in Cycle" : "Pending Run"}
                        </button>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-200">
                        {totalMatched.toLocaleString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-emerald-400">{yieldRate}%</span>
                          <span className="text-[11px] text-slate-500">({passed} approved)</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-300 font-medium">
                        {kw.usage_count} run(s)
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-400">
                        {formatDate(kw.last_used_at)}
                      </td>

                      <td className="py-3.5 px-5 text-right">
                        <Link
                          href={`/channels?search=${encodeURIComponent(kw.text)}`}
                          className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Explore <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Keyword Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                Add Discovery Keywords
              </h3>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Enter one or multiple search terms (separated by commas or new lines). These will feed
              into the next scraping cycle.
            </p>
            <form onSubmit={handleAddKeywords} className="space-y-4">
              <textarea
                required
                rows={5}
                placeholder="e.g.&#10;python coding session&#10;top ai models 2026&#10;building saas with nextjs"
                value={newKeywordText}
                onChange={(e) => setNewKeywordText(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder:text-slate-600 font-mono"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLoading}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {addingLoading ? "Adding..." : "Save Keywords"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
