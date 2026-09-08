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
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  RotateCcw,
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

  // Sorting state
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Filtering state
  const [subTier, setSubTier] = useState<string>("all");
  const [minViews, setMinViews] = useState<string>("");
  const [minEngagement, setMinEngagement] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(true);

  // Reject modal state
  const [rejectingChannel, setRejectingChannel] = useState<YtChannel | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    try {
      let minSubs = 0;
      let maxSubs = 0;
      if (subTier === "under50k") {
        maxSubs = 50000;
      } else if (subTier === "50k-100k") {
        minSubs = 50000;
        maxSubs = 100000;
      } else if (subTier === "100k-250k") {
        minSubs = 100000;
        maxSubs = 250000;
      } else if (subTier === "250k-1m") {
        minSubs = 250000;
        maxSubs = 1000000;
      } else if (subTier === "over1m") {
        minSubs = 1000000;
      }

      const params = new URLSearchParams({
        tab,
        search,
        sortBy,
        sortOrder,
        page: page.toString(),
        limit: "25",
      });

      if (minSubs > 0) params.set("minSubs", minSubs.toString());
      if (maxSubs > 0) params.set("maxSubs", maxSubs.toString());
      if (minViews) params.set("minViews", minViews);
      if (minEngagement) params.set("minEngagement", minEngagement);
      if (rejectionReason) params.set("rejectionReason", rejectionReason);

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
  }, [tab, search, sortBy, sortOrder, subTier, minViews, minEngagement, rejectionReason, page]);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder(column === "channel_name" ? "asc" : "desc");
    }
    setPage(1);
  };

  const handleQuickSortChange = (val: string) => {
    const [col, dir] = val.split("-");
    setSortBy(col);
    setSortOrder(dir as "asc" | "desc");
    setPage(1);
  };

  const activeFiltersCount =
    (subTier !== "all" ? 1 : 0) +
    (minViews ? 1 : 0) +
    (minEngagement ? 1 : 0) +
    (rejectionReason ? 1 : 0) +
    (sortBy !== "created_at" || sortOrder !== "desc" ? 1 : 0);

  const handleResetFilters = () => {
    setSubTier("all");
    setMinViews("");
    setMinEngagement("");
    setRejectionReason("");
    setSortBy("created_at");
    setSortOrder("desc");
    setSearch("");
    setPage(1);
  };

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
    <div className="space-y-4">
      {/* Top Filter & Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Tab Buttons */}
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
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

        {/* Search & Filter Trigger */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search creator name or @handle..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 placeholder:text-slate-500 transition-all"
            />
          </div>

          <button
            onClick={() => setShowFilters((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              showFilters || activeFiltersCount > 0
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/30"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Filters</span>
            {activeFiltersCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      {showFilters && (
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-lg space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Quick Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Sort:</span>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => handleQuickSortChange(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="created_at-desc">Recently Discovered</option>
                <option value="created_at-asc">Oldest Discovered</option>
                <option value="subscriber_count-desc">Subscribers: High to Low</option>
                <option value="subscriber_count-asc">Subscribers: Low to High</option>
                <option value="avg_views-desc">Avg Views: High to Low</option>
                <option value="avg_views-asc">Avg Views: Low to High</option>
                <option value="avg_engagement_rate-desc">Engagement: High to Low</option>
                <option value="channel_name-asc">Channel Name: A to Z</option>
              </select>
            </div>

            {/* Subscriber Tier Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Audience:</span>
              <select
                value={subTier}
                onChange={(e) => {
                  setSubTier(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="all">All Subscribers</option>
                <option value="under50k">&lt; 50K</option>
                <option value="50k-100k">50K - 100K</option>
                <option value="100k-250k">100K - 250K</option>
                <option value="250k-1m">250K - 1M</option>
                <option value="over1m">&gt; 1M</option>
              </select>
            </div>

            {/* Min Views Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Views:</span>
              <select
                value={minViews}
                onChange={(e) => {
                  setMinViews(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Any Avg Views</option>
                <option value="1000">&gt; 1,000 views</option>
                <option value="5000">&gt; 5,000 views</option>
                <option value="10000">&gt; 10,000 views</option>
                <option value="50000">&gt; 50,000 views</option>
                <option value="100000">&gt; 100,000 views</option>
              </select>
            </div>

            {/* Min Engagement Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Engagement:</span>
              <select
                value={minEngagement}
                onChange={(e) => {
                  setMinEngagement(e.target.value);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                <option value="">Any Engagement</option>
                <option value="1">&gt; 1%</option>
                <option value="2">&gt; 2%</option>
                <option value="3">&gt; 3%</option>
                <option value="5">&gt; 5%</option>
                <option value="10">&gt; 10%</option>
              </select>
            </div>

            {/* Rejection Reason Dropdown (for rejected or all tabs) */}
            {(tab === "rejected" || tab === "all") && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">Bin Reason:</span>
                <select
                  value={rejectionReason}
                  onChange={(e) => {
                    setRejectionReason(e.target.value);
                    setPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                >
                  <option value="">All Rejection Reasons</option>
                  <option value="followers">Followers Out of Range</option>
                  <option value="avg views">Low Average Views</option>
                  <option value="bad engagement rate">Poor Engagement Rate</option>
                  <option value="bad content">Low Quality Content</option>
                  <option value="unrelated">Unrelated Niche</option>
                  <option value="other">Other / Unfit</option>
                </select>
              </div>
            )}

            {/* Reset All Filters Button */}
            {(activeFiltersCount > 0 || search.trim() !== "") && (
              <button
                onClick={handleResetFilters}
                className="flex items-center gap-1 text-slate-400 hover:text-red-400 text-xs font-medium ml-auto px-2.5 py-1.5 rounded-lg hover:bg-slate-800/60 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
            <span>
              Showing <span className="text-white font-semibold">{channels.length}</span> of{" "}
              <span className="text-white font-semibold">{totalCount.toLocaleString()}</span> creators
            </span>
            {sortBy && sortBy !== "created_at" && (
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 font-mono">
                Sorted by {sortBy} ({sortOrder.toUpperCase()})
              </span>
            )}
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
                {/* Creator (Sortable) */}
                <th className="py-3 px-4">
                  <button
                    onClick={() => handleSort("channel_name")}
                    className="inline-flex items-center gap-1.5 uppercase hover:text-white transition-colors group"
                  >
                    <span>Creator</span>
                    {sortBy === "channel_name" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    )}
                  </button>
                </th>

                {/* Subscribers (Sortable) */}
                <th className="py-3 px-3">
                  <button
                    onClick={() => handleSort("subscriber_count")}
                    className="inline-flex items-center gap-1.5 uppercase hover:text-white transition-colors group"
                  >
                    <span>Subscribers</span>
                    {sortBy === "subscriber_count" || sortBy === "subscribers" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    )}
                  </button>
                </th>

                {/* Avg Views (Sortable) */}
                <th className="py-3 px-3">
                  <button
                    onClick={() => handleSort("avg_views")}
                    className="inline-flex items-center gap-1.5 uppercase hover:text-white transition-colors group"
                  >
                    <span>Avg Views</span>
                    {sortBy === "avg_views" || sortBy === "views" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    )}
                  </button>
                </th>

                {/* Engagement Rate (Sortable) */}
                <th className="py-3 px-3">
                  <button
                    onClick={() => handleSort("avg_engagement_rate")}
                    className="inline-flex items-center gap-1.5 uppercase hover:text-white transition-colors group"
                  >
                    <span>Engagement</span>
                    {sortBy === "avg_engagement_rate" || sortBy === "engagement" ? (
                      sortOrder === "asc" ? (
                        <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    )}
                  </button>
                </th>

                {/* Discovery Video */}
                <th className="py-3 px-3">Discovery Video</th>

                {/* Status */}
                <th className="py-3 px-3">Status</th>

                {/* Sticky Triage Actions */}
                <th className="py-3 px-4 text-right sticky right-0 bg-slate-950/95 backdrop-blur shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.5)] z-10">
                  Triage Actions
                </th>
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
                    <div className="space-y-1">
                      <div>No creators found matching these filters.</div>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={handleResetFilters}
                          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                          Reset filters
                        </button>
                      )}
                    </div>
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
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          {channel.profile_photo_url ? (
                            <img
                              src={channel.profile_photo_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                              {channel.channel_name.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0 max-w-[200px]">
                            <div className="font-semibold text-white truncate text-xs flex items-center gap-1.5">
                              <span className="truncate">{channel.channel_name}</span>
                              <a
                                href={`https://www.youtube.com/channel/${channel.channel_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open YouTube Channel"
                                className="text-slate-500 hover:text-indigo-400 transition-colors shrink-0"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate font-mono">
                              {channel.channel_handle || channel.channel_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Subscribers */}
                      <td className="py-3 px-3 text-xs font-semibold text-slate-200 whitespace-nowrap">
                        {formatCompactNumber(channel.subscriber_count)}
                      </td>

                      {/* Avg Views */}
                      <td className="py-3 px-3 text-xs font-medium text-slate-300 whitespace-nowrap">
                        {formatCompactNumber(channel.avg_views)}
                      </td>

                      {/* Engagement Rate */}
                      <td className="py-3 px-3 text-xs font-medium text-slate-300 whitespace-nowrap">
                        {formatPercent(channel.avg_engagement_rate)}
                      </td>

                      {/* Discovery Video Thumbnail & Context */}
                      <td className="py-3 px-3">
                        {channel.discovery_video_id ? (
                          <a
                            href={`https://www.youtube.com/watch?v=${channel.discovery_video_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 group/video max-w-[220px]"
                            title={channel.discovery_video_title || "Watch video"}
                          >
                            {channel.discovery_thumbnail_url ? (
                              <img
                                src={channel.discovery_thumbnail_url}
                                alt=""
                                className="w-12 h-7 object-cover rounded bg-slate-800 ring-1 ring-slate-700 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-7 bg-slate-800 rounded flex items-center justify-center text-slate-500 shrink-0">
                                <Video className="w-3.5 h-3.5" />
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
                      <td className="py-3 px-3 text-xs whitespace-nowrap">
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
                              <div className="text-[10px] text-slate-500 truncate max-w-[120px]">
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
                      <td className="py-3 px-4 text-right sticky right-0 bg-slate-900 group-hover:bg-slate-800/90 backdrop-blur shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.5)] z-10">
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
