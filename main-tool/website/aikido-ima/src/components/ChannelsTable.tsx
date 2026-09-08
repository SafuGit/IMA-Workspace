"use client";

import { useState, useEffect, useCallback } from "react";
import { YtChannel, RejectionReason } from "@/lib/types";
import { formatCompactNumber, formatPercent } from "@/lib/utils";
import RejectModal from "./RejectModal";
import {
  Search,
  Check,
  Trash2,
  Mail,
  ExternalLink,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  RefreshCw,
  Video,
} from "lucide-react";
import Link from "next/link";

interface ChannelsTableProps {
  initialTab?: string;
  initialSearch?: string;
}

export default function ChannelsTable({
  initialTab = "unreviewed",
  initialSearch = "",
}: ChannelsTableProps) {
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState(initialSearch);
  const [channels, setChannels] = useState<YtChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Reject modal state
  const [rejectingChannel, setRejectingChannel] = useState<YtChannel | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab,
        search,
        page: page.toString(),
        limit: "25",
      });

      const res = await fetch(`/api/channels?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setChannels(data.channels || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleApprove = async (channelId: string) => {
    setActionLoadingId(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (res.ok) {
        // Optimistically update list
        if (tab === "unreviewed" || tab === "rejected") {
          setChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
          setTotalCount((prev) => Math.max(0, prev - 1));
        } else {
          setChannels((prev) =>
            prev.map((c) =>
              c.channel_id === channelId ? { ...c, valid: true, rejection_reason: null } : c
            )
          );
        }
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectConfirm = async (channelId: string, reason: RejectionReason) => {
    setActionLoadingId(channelId);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });

      if (res.ok) {
        // Optimistically update list
        if (tab === "unreviewed" || tab === "approved") {
          setChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
          setTotalCount((prev) => Math.max(0, prev - 1));
        } else {
          setChannels((prev) =>
            prev.map((c) =>
              c.channel_id === channelId ? { ...c, valid: false, rejection_reason: reason } : c
            )
          );
        }
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tab Buttons */}
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
          {[
            { id: "unreviewed", label: "Unreviewed Queue", icon: HelpCircle },
            { id: "approved", label: "Approved Candidates", icon: CheckCircle2 },
            { id: "rejected", label: "Rejected (Bin)", icon: XCircle },
            { id: "all", label: "All Channels", icon: null },
          ].map((t) => {
            const isActive = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search channel name or @handle..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder:text-slate-500 transition-all"
          />
        </div>
      </div>

      {/* Main Table Container */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="text-xs text-slate-400 font-medium">
            Showing <span className="text-white font-semibold">{channels.length}</span> of{" "}
            <span className="text-white font-semibold">{totalCount.toLocaleString()}</span> creators
          </div>
          <button
            onClick={() => fetchChannels()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-950/60">
                <th className="py-3 px-5">Creator</th>
                <th className="py-3 px-4">Subscribers</th>
                <th className="py-3 px-4">Avg Views</th>
                <th className="py-3 px-4">Engagement</th>
                <th className="py-3 px-4">Discovery Video</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-5 text-right">Triage Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    Loading channels from database...
                  </td>
                </tr>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-xs text-slate-500">
                    No creators found matching this filter.
                  </td>
                </tr>
              ) : (
                channels.map((channel) => {
                  const isLoading = actionLoadingId === channel.channel_id;

                  return (
                    <tr
                      key={channel.channel_id}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      {/* Creator Profile */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          {channel.profile_photo_url ? (
                            <img
                              src={channel.profile_photo_url}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
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
                                title="Open YouTube Channel"
                                className="text-slate-500 hover:text-indigo-400 transition-colors"
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

                      {/* Subscribers */}
                      <td className="py-3.5 px-4 text-xs font-semibold text-slate-200">
                        {formatCompactNumber(channel.subscriber_count)}
                      </td>

                      {/* Avg Views */}
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-300">
                        {formatCompactNumber(channel.avg_views)}
                      </td>

                      {/* Engagement Rate */}
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-300">
                        {formatPercent(channel.avg_engagement_rate)}
                      </td>

                      {/* Discovery Video Thumbnail & Context */}
                      <td className="py-3.5 px-4">
                        {channel.discovery_video_id ? (
                          <a
                            href={`https://www.youtube.com/watch?v=${channel.discovery_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 group/video max-w-xs"
                            title={channel.discovery_video_title || "Watch video"}
                          >
                            {channel.discovery_thumbnail_url ? (
                              <img
                                src={channel.discovery_thumbnail_url}
                                alt=""
                                className="w-14 h-8 object-cover rounded bg-slate-800 ring-1 ring-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-8 bg-slate-800 rounded flex items-center justify-center text-slate-500 shrink-0">
                                <Video className="w-4 h-4" />
                              </div>
                            )}
                            <span className="text-[11px] text-slate-300 group-hover/video:text-indigo-400 truncate font-medium">
                              {channel.discovery_video_title || "Discovery video"}
                            </span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-xs">
                        {channel.valid === true ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Approved
                          </span>
                        ) : channel.valid === false ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                              <XCircle className="w-3 h-3" /> Bin
                            </span>
                            {channel.rejection_reason && (
                              <div className="text-[10px] text-slate-500 truncate">
                                {channel.rejection_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <HelpCircle className="w-3 h-3" /> Unreviewed
                          </span>
                        )}
                      </td>

                      {/* Triage Actions */}
                      <td className="py-3.5 px-5 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Approve Button */}
                          <button
                            onClick={() => handleApprove(channel.channel_id)}
                            disabled={isLoading || channel.valid === true}
                            title="Approve Creator"
                            className={`p-1.5 rounded-lg border transition-all ${
                              channel.valid === true
                                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 opacity-60 cursor-default"
                                : "bg-slate-800 hover:bg-emerald-500/20 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 border-slate-700"
                            }`}
                          >
                            <Check className="w-4 h-4" />
                          </button>

                          {/* Reject / Bin Button */}
                          <button
                            onClick={() => setRejectingChannel(channel)}
                            disabled={isLoading || channel.valid === false}
                            title="Reject and Throw in Bin"
                            className={`p-1.5 rounded-lg border transition-all ${
                              channel.valid === false
                                ? "bg-red-500/20 border-red-500/40 text-red-400 opacity-60 cursor-default"
                                : "bg-slate-800 hover:bg-red-500/20 hover:border-red-500/40 text-slate-300 hover:text-red-400 border-slate-700"
                            }`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {/* Send Email Action */}
                          <Link
                            href={`/emails?channelId=${channel.channel_id}`}
                            title="View or Draft Outreach Email"
                            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between text-xs text-slate-400">
          <div>
            Page <span className="font-semibold text-slate-200">{page}</span> of{" "}
            <span className="font-semibold text-slate-200">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      <RejectModal
        channel={rejectingChannel}
        isOpen={!!rejectingChannel}
        onClose={() => setRejectingChannel(null)}
        onConfirm={handleRejectConfirm}
      />
    </div>
  );
}
