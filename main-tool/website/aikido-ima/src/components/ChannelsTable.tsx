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
  AlertCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreatorAvatar, VideoThumbnail } from "./SafeImage";

function isChannelQualified(c: YtChannel): boolean {
  const subs = Number(c.subscriber_count || 0);
  const views = Number(c.avg_views || 0);
  const eng = Number(c.avg_engagement_rate || 0);
  return subs > 25000 && subs < 1000000 && views > 25000 && (eng > 1 || (eng <= 1 && eng > 0.01));
}

interface ChannelsTableProps {
  initialTab?: string;
  initialSearch?: string;
  initialScope?: string;
}

export default function ChannelsTable({
  initialTab = "qualified",
  initialSearch = "",
  initialScope = "unreviewed",
}: ChannelsTableProps) {
  const [tab, setTab] = useState(initialTab);
  const [qualifiedScope, setQualifiedScope] = useState(initialScope);
  const [unreviewedFilter, setUnreviewedFilter] = useState("all");
  const [tabCounts, setTabCounts] = useState<{
    qualified: number;
    unreviewed: number;
    approved: number;
    rejected: number;
    all: number;
  } | null>(null);
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

  // Email API setup prompt state
  const router = useRouter();
  const [showApiSetupPrompt, setShowApiSetupPrompt] = useState(false);
  const [promptTargetChannel, setPromptTargetChannel] = useState<YtChannel | null>(null);

  const handleGenerateEmailClick = async (channel: YtChannel) => {
    let isConfigured = false;
    try {
      const cached = localStorage.getItem("fylint_email_api_settings");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.apiUrl && parsed.apiUrl.trim() !== "") {
          isConfigured = true;
        }
      }
    } catch {}

    if (!isConfigured) {
      try {
        const res = await fetch("/api/settings?key=email_generation_api");
        if (res.ok) {
          const data = await res.json();
          if (data.settings && data.settings.apiUrl && data.settings.apiUrl.trim() !== "") {
            isConfigured = true;
            localStorage.setItem("fylint_email_api_settings", JSON.stringify(data.settings));
          }
        }
      } catch {}
    }

    if (!isConfigured) {
      setShowApiSetupPrompt(true);
      setPromptTargetChannel(channel);
    } else {
      const params = new URLSearchParams({ channelId: channel.channel_id });
      if (channel.discovery_video_id) {
        params.set("videoUrl", `https://www.youtube.com/watch?v=${channel.discovery_video_id}`);
      }
      router.push(`/emails/generate?${params.toString()}`);
    }
  };

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

      if (tab === "qualified") {
        params.set("scope", qualifiedScope);
      }
      if (tab === "unreviewed" && unreviewedFilter !== "all") {
        params.set("unreviewedFilter", unreviewedFilter);
      }

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
        if (data.tabCounts) {
          setTabCounts(data.tabCounts);
        }
      }
    } catch (err) {
      console.error("Failed to fetch channels:", err);
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    search,
    sortBy,
    sortOrder,
    subTier,
    minViews,
    minEngagement,
    rejectionReason,
    page,
    qualifiedScope,
    unreviewedFilter,
  ]);

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
    const target = channels.find((c) => c.channel_id === channelId);
    const wasQualified = target ? isChannelQualified(target) : false;

    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (res.ok) {
        // Optimistically update list
        if (
          tab === "unreviewed" ||
          tab === "rejected" ||
          (tab === "qualified" && qualifiedScope === "unreviewed")
        ) {
          setChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
          setTotalCount((prev) => Math.max(0, prev - 1));
        } else {
          setChannels((prev) =>
            prev.map((c) =>
              c.channel_id === channelId ? { ...c, valid: true, rejection_reason: null } : c
            )
          );
        }

        setTabCounts((prev) =>
          prev
            ? {
                ...prev,
                qualified: wasQualified ? Math.max(0, prev.qualified - 1) : prev.qualified,
                unreviewed: Math.max(0, prev.unreviewed - 1),
                approved: prev.approved + 1,
              }
            : null
        );
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectConfirm = async (channelId: string, reason: RejectionReason) => {
    setActionLoadingId(channelId);
    const target = channels.find((c) => c.channel_id === channelId);
    const wasQualified = target ? isChannelQualified(target) : false;

    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });

      if (res.ok) {
        // Optimistically update list
        if (
          tab === "unreviewed" ||
          tab === "approved" ||
          (tab === "qualified" && qualifiedScope === "unreviewed")
        ) {
          setChannels((prev) => prev.filter((c) => c.channel_id !== channelId));
          setTotalCount((prev) => Math.max(0, prev - 1));
        } else {
          setChannels((prev) =>
            prev.map((c) =>
              c.channel_id === channelId ? { ...c, valid: false, rejection_reason: reason } : c
            )
          );
        }

        setTabCounts((prev) =>
          prev
            ? {
                ...prev,
                qualified: wasQualified ? Math.max(0, prev.qualified - 1) : prev.qualified,
                unreviewed: Math.max(0, prev.unreviewed - 1),
                rejected: prev.rejected + 1,
              }
            : null
        );
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
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {[
            {
              id: "qualified",
              label: "Qualified Creators",
              icon: Sparkles,
              count: tabCounts?.qualified,
              highlight: true,
            },
            {
              id: "unreviewed",
              label: "Need Review",
              icon: HelpCircle,
              count: tabCounts?.unreviewed,
              highlight: false,
            },
            {
              id: "approved",
              label: "Approved Candidates",
              icon: CheckCircle2,
              count: tabCounts?.approved,
              highlight: false,
            },
            {
              id: "rejected",
              label: "Rejected (Bin)",
              icon: XCircle,
              count: tabCounts?.rejected,
              highlight: false,
            },
            {
              id: "all",
              label: "All Channels",
              icon: null,
              count: tabCounts?.all,
              highlight: false,
            },
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
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? t.highlight
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-sm shadow-amber-500/20"
                      : "bg-indigo-600 text-white shadow-sm"
                    : t.highlight
                    ? "text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 border border-amber-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                {Icon && (
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive && t.highlight ? "text-slate-950" : t.highlight ? "text-amber-400" : ""
                    }`}
                  />
                )}
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                      isActive
                        ? t.highlight
                          ? "bg-slate-950/20 text-slate-950"
                          : "bg-white/20 text-white"
                        : t.highlight
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {t.count.toLocaleString()}
                  </span>
                )}
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

      {/* Category Sub-Header Banner for Qualified Creators */}
      {tab === "qualified" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 text-xs shadow-sm">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-200">
                  Qualified Creators (&ldquo;The Perfect Ones&rdquo;)
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                  Strict High-Yield Criteria
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                25K – 1M Subscribers • &gt;25K Average Views • &gt;1.0% Engagement Rate
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => {
                setQualifiedScope("unreviewed");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                qualifiedScope === "unreviewed"
                  ? "bg-amber-500 text-slate-950 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Awaiting Review ({tabCounts?.qualified ?? 0})
            </button>
            <button
              onClick={() => {
                setQualifiedScope("approved");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                qualifiedScope === "approved"
                  ? "bg-amber-500 text-slate-950 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Approved Qualified
            </button>
            <button
              onClick={() => {
                setQualifiedScope("all");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                qualifiedScope === "all"
                  ? "bg-amber-500 text-slate-950 shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Qualified
            </button>
          </div>
        </div>
      )}

      {/* Category Sub-Header Banner for Need Review (Triage Queue) */}
      {tab === "unreviewed" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
              <HelpCircle className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white">Need Review (Triage Queue)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                  valid IS NULL
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                All unvetted channels awaiting triage decisions (approval or rejection).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
            <button
              onClick={() => {
                setUnreviewedFilter("all");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                unreviewedFilter === "all"
                  ? "bg-indigo-600 text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Pending ({tabCounts?.unreviewed ?? 0})
            </button>
            <button
              onClick={() => {
                setUnreviewedFilter("non-qualified");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                unreviewedFilter === "non-qualified"
                  ? "bg-indigo-600 text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Standard / Non-Qualified
            </button>
          </div>
        </div>
      )}

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
                  <option value="woman">Woman</option>
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
                  const isQualified = isChannelQualified(channel);

                  return (
                    <tr
                      key={channel.channel_id}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      {/* Creator Profile */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <CreatorAvatar
                            src={channel.profile_photo_url}
                            name={channel.channel_name}
                            className="w-8 h-8 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                            initialsClassName="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 ring-1 ring-slate-700"
                          />
                          <div className="min-w-0 max-w-[200px]">
                            <div className="font-semibold text-white truncate text-xs flex items-center gap-1.5">
                              <span className="truncate">{channel.channel_name}</span>
                              {isQualified && (
                                <span
                                  title="Qualified Creator ('The Perfect Ones'): 25K–1M subs, >25K avg views, >1.0% engagement"
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold shrink-0"
                                >
                                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                                  Perfect
                                </span>
                              )}
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
                            <VideoThumbnail
                              src={channel.discovery_thumbnail_url}
                              title={channel.discovery_video_title || "Discovery video"}
                              className="w-12 h-7 object-cover rounded bg-slate-800 ring-1 ring-slate-700 shrink-0"
                              fallbackClassName="w-12 h-7 bg-slate-800 rounded flex items-center justify-center text-slate-500 shrink-0 ring-1 ring-slate-700/50"
                            />
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

                          {/* Generate Email Action */}
                          <button
                            type="button"
                            onClick={() => handleGenerateEmailClick(channel)}
                            title="Generate Outreach Email"
                            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
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

      {/* API Setup Required Prompt Modal */}
      {showApiSetupPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Email Generation API Not Configured</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                To generate personalized outreach emails for{" "}
                <span className="text-slate-200 font-semibold">
                  {promptTargetChannel?.channel_name || "this creator"}
                </span>
                , please configure your Bring-Your-Own (BYO) Email Generation API in Settings first.
              </p>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 font-mono">
              Expected Endpoint: <span className="text-indigo-400">POST /api/generate-email</span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowApiSetupPrompt(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <Link
                href="/settings"
                onClick={() => setShowApiSetupPrompt(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all"
              >
                <Settings className="w-3.5 h-3.5" />
                Configure in Settings
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
