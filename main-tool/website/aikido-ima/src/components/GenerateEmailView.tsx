"use client";

import { useState, useEffect, useCallback } from "react";
import { YtChannel, GeneratedEmailResponse, GeneratedHook, GeneratedDraft } from "@/lib/types";
import { formatCompactNumber, formatPercent } from "@/lib/utils";
import { CreatorAvatar, VideoThumbnail } from "./SafeImage";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ExternalLink,
  Copy,
  Check,
  Save,
  ArrowLeft,
  Loader2,
  Video,
  CheckCircle2,
  Clock,
  Settings,
  MessageSquare,
  FileText,
  AlertCircle,
  RefreshCw,
  Star,
  Layers,
} from "lucide-react";

interface GenerateEmailViewProps {
  channelId?: string;
  initialVideoUrl?: string;
}

const STORAGE_KEY = "fylint_email_api_settings";

export default function GenerateEmailView({
  channelId,
  initialVideoUrl,
}: GenerateEmailViewProps) {
  const [channel, setChannel] = useState<YtChannel | null>(null);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl || "");
  const [loadingChannel, setLoadingChannel] = useState(Boolean(channelId));
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [apiUrl, setApiUrl] = useState<string>("");

  // Generation state
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<GeneratedEmailResponse | null>(null);

  // Active UI state
  const [selectedDraftKey, setSelectedDraftKey] = useState<string>("option_a");
  const [editedBody, setEditedBody] = useState<string>("");
  const [copiedSubject, setCopiedSubject] = useState<string | null>(null);
  const [copiedBody, setCopiedBody] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Check API configuration
  useEffect(() => {
    async function checkApi() {
      let url = "";
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.apiUrl) {
            url = parsed.apiUrl;
          }
        }
      } catch {}

      if (!url) {
        try {
          const res = await fetch("/api/settings?key=email_generation_api");
          if (res.ok) {
            const data = await res.json();
            if (data.settings && data.settings.apiUrl) {
              url = data.settings.apiUrl;
            }
          }
        } catch {}
      }

      setApiUrl(url);
      setApiConfigured(Boolean(url && url.trim() !== ""));
    }

    checkApi();
  }, []);

  // Fetch channel details if channelId is provided
  useEffect(() => {
    if (!channelId) {
      setLoadingChannel(false);
      return;
    }

    async function fetchChannel() {
      try {
        const res = await fetch(`/api/channels/${channelId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.channel) {
            setChannel(data.channel);
            if (!videoUrl) {
              const url = data.channel.discovery_video_id
                ? `https://www.youtube.com/watch?v=${data.channel.discovery_video_id}`
                : "";
              setVideoUrl(url);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load channel details:", err);
      } finally {
        setLoadingChannel(false);
      }
    }

    fetchChannel();
  }, [channelId]);

  // Handle generation call
  const handleGenerate = async () => {
    if (!videoUrl) {
      setError("Please enter or select a YouTube video URL.");
      return;
    }

    setGenerating(true);
    setError(null);
    setStep(1);

    // Simulate progress steps while upstream API works
    const stepTimer1 = setTimeout(() => setStep(2), 2500);
    const stepTimer2 = setTimeout(() => setStep(3), 6000);

    try {
      const res = await fetch("/api/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: videoUrl.trim(),
          channelId: channel?.channel_id,
          channelName: channel?.channel_name,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "Email generation failed");
      }

      setResponse(data);
      // Select first draft
      if (data.drafts) {
        const firstKey = Object.keys(data.drafts)[0] || "option_a";
        setSelectedDraftKey(firstKey);
        setEditedBody(data.drafts[firstKey]?.body || "");
      }
    } catch (err: any) {
      console.error("Generation error:", err);
      setError(err.message || "Failed to generate outreach email");
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setGenerating(false);
      setStep(0);
    }
  };

  const handleSelectDraft = (key: string) => {
    setSelectedDraftKey(key);
    if (response?.drafts && response.drafts[key]) {
      setEditedBody(response.drafts[key].body || "");
    }
  };

  const handleCopySubject = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSubject(id);
    setTimeout(() => setCopiedSubject(null), 2000);
  };

  const handleCopyBody = () => {
    if (!editedBody) return;
    navigator.clipboard.writeText(editedBody);
    setCopiedBody(true);
    setTimeout(() => setCopiedBody(false), 2000);
  };

  const handleSaveToReviewHub = async () => {
    if (!response || !editedBody) return;
    setSavingDraft(true);
    setSavedSuccess(false);

    try {
      // Find active draft
      const activeDraft = response.drafts[selectedDraftKey];
      const subject = activeDraft?.subject || response.subject_lines?.primary || "";
      const hooksSummary = response.hooks
        ?.map((h, i) => `[Hook ${i + 1} (${h.tag})]: ${h.text} (${h.timestamp})`)
        .join("\n\n");

      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: channel?.channel_id || response.channel_id,
          video_id: response.video_id,
          video_title: response.title,
          outreach_draft: editedBody,
          outreach_commentary: hooksSummary,
          status: "pending",
        }),
      });

      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3500);
      } else {
        const err = await res.json();
        alert(`Failed to save draft: ${err.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Save draft error:", err);
    } finally {
      setSavingDraft(false);
    }
  };

  const activeDraft = response?.drafts ? response.drafts[selectedDraftKey] : null;
  const wordCount = editedBody ? editedBody.split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Navigation Header */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/channels"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Channels Triage
        </Link>

        {apiConfigured === false && (
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-all"
          >
            <Settings className="w-3.5 h-3.5" /> Configure Email API in Settings
          </Link>
        )}
      </div>

      {/* Creator Summary Card */}
      {channel && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <CreatorAvatar
              src={channel.profile_photo_url}
              name={channel.channel_name}
              className="w-14 h-14 rounded-2xl ring-2 ring-indigo-500/20 object-cover"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight">
                  {channel.channel_name}
                </h1>
                <a
                  href={`https://www.youtube.com/channel/${channel.channel_id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-slate-500 hover:text-indigo-400 transition-colors"
                  title="Open YouTube Channel"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {channel.channel_handle || `@${channel.channel_id.slice(0, 10)}`}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6 text-xs text-slate-300">
            <div>
              <div className="text-slate-500 text-[11px]">Subscribers</div>
              <div className="font-semibold text-slate-100 mt-0.5 font-mono">
                {formatCompactNumber(channel.subscriber_count)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">Avg Views</div>
              <div className="font-semibold text-slate-100 mt-0.5 font-mono">
                {formatCompactNumber(channel.avg_views)}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-[11px]">Engagement</div>
              <div className="font-semibold text-emerald-400 mt-0.5 font-mono">
                {formatPercent(channel.avg_engagement_rate)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Target Video & Generator Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Video className="w-3.5 h-3.5 text-indigo-400" /> Target YouTube Video URL
            </span>
            {channel?.discovery_video_title && (
              <span className="text-[11px] text-slate-500 truncate max-w-[300px]">
                Discovery: {channel.discovery_video_title}
              </span>
            )}
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-100 placeholder-slate-600 font-mono transition-all"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating || !videoUrl || apiConfigured === false}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50 shrink-0"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Outreach Email</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* API Status Pill */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                apiConfigured ? "bg-emerald-400" : "bg-amber-400"
              }`}
            />
            <span>
              {apiConfigured
                ? `Active API: ${apiUrl}`
                : "API not configured. Please set up in Settings."}
            </span>
          </div>
          <Link
            href="/settings"
            className="text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            Settings &rarr;
          </Link>
        </div>

        {/* Live Step Progress Indicator */}
        {generating && (
          <div className="p-4 bg-slate-950 rounded-xl border border-indigo-500/30 space-y-3 animate-in fade-in">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-200">
              <span className="flex items-center gap-2 text-indigo-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Pipeline Running
              </span>
              <span className="text-[11px] text-slate-400">Step {step} of 3</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className={`flex items-center gap-2 ${step >= 1 ? "text-slate-200" : "text-slate-600"}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${step > 1 ? "text-emerald-400" : step === 1 ? "text-indigo-400 animate-pulse" : "text-slate-700"}`} />
                <span>[1/3] Fetching video details and top viewer comments</span>
              </div>
              <div className={`flex items-center gap-2 ${step >= 2 ? "text-slate-200" : "text-slate-600"}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${step > 2 ? "text-emerald-400" : step === 2 ? "text-indigo-400 animate-pulse" : "text-slate-700"}`} />
                <span>[2/3] Extracting captions & transcript (via ProxyDB rotation)</span>
              </div>
              <div className={`flex items-center gap-2 ${step >= 3 ? "text-slate-200" : "text-slate-600"}`}>
                <CheckCircle2 className={`w-3.5 h-3.5 ${step === 3 ? "text-indigo-400 animate-pulse" : "text-slate-700"}`} />
                <span>[3/3] Generating personalization hooks & 3 distinct outreach drafts</span>
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Results View */}
      {response && (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
          {/* Section 1: Personalization Hooks */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  1. Personalization Hooks
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  High-converting moments verified with timestamped video links.
                </p>
              </div>
              {response.recommendation && (
                <div className="hidden sm:block text-[11px] px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-medium">
                  {response.recommendation}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3.5">
              {response.hooks?.map((hook, idx) => {
                const isCommentBacked = hook.tag?.toLowerCase().includes("comment");
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      hook.is_recommended
                        ? "bg-slate-950/80 border-indigo-500/40 ring-1 ring-indigo-500/20"
                        : "bg-slate-950/50 border-slate-800/80"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          Hook {idx + 1}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                            isCommentBacked
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                          }`}
                        >
                          {isCommentBacked ? "comment-backed" : "transcript-only"}
                        </span>
                        {hook.is_recommended && (
                          <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                            <Star className="w-2.5 h-2.5 fill-amber-300" /> Recommended Lead
                          </span>
                        )}
                      </div>

                      {hook.timestamp && (
                        <span className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                          <Clock className="w-3 h-3 text-slate-500" /> {hook.timestamp}
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-200 mb-2 italic">
                      &ldquo;{hook.text}&rdquo;
                    </p>

                    {hook.what_happens && (
                      <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/60 mb-2">
                        <span className="font-semibold text-slate-300">What happens: </span>
                        {hook.what_happens}
                      </div>
                    )}

                    {hook.video_link && (
                      <a
                        href={hook.video_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors font-mono"
                      >
                        <Video className="w-3 h-3" />
                        <span>Watch clip at timestamp</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Subject Line Options */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                2. Subject Line Options
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Tailored 2-4 word lowercase subject lines with zero generic sales words.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: "primary",
                  label: "Primary (Feature Focus)",
                  val: response.subject_lines?.primary,
                },
                {
                  id: "alt1",
                  label: "Alt 1 (Workflow / Demo)",
                  val: response.subject_lines?.alternative_1,
                },
                {
                  id: "alt2",
                  label: "Alt 2 (Niche Integration)",
                  val: response.subject_lines?.alternative_2,
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                      {item.label}
                    </div>
                    <div className="text-xs font-mono font-medium text-indigo-300 truncate">
                      {item.val || "—"}
                    </div>
                  </div>
                  {item.val && (
                    <button
                      type="button"
                      onClick={() => handleCopySubject(item.val, item.id)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors shrink-0"
                      title="Copy subject line"
                    >
                      {copiedSubject === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Outreach Drafts (A/B/C) */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  3. Outreach Email Drafts
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Three distinct strategic angles in Safwan&apos;s personal voice.
                </p>
              </div>

              {/* Word Count Badge */}
              <div
                className={`text-[11px] px-2.5 py-1 rounded-full font-mono font-medium border shrink-0 ${
                  wordCount >= 50 && wordCount <= 80
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}
              >
                {wordCount} words {wordCount >= 50 && wordCount <= 80 ? "• Optimal (50-80)" : "• Standard"}
              </div>
            </div>

            {/* Draft Tabs */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: "option_a", label: "Option A", desc: "Monetization & Flat Rates" },
                { key: "option_b", label: "Option B", desc: "Software Category Fit" },
                { key: "option_c", label: "Option C", desc: "Production Pipeline" },
              ].map((tab) => {
                const isActive = selectedDraftKey === tab.key;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => handleSelectDraft(tab.key)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                      isActive
                        ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-300 shadow-sm"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] text-slate-500 font-normal hidden sm:inline">
                      ({tab.desc})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Draft Subject Header */}
            {activeDraft?.subject && (
              <div className="text-xs text-slate-300 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 font-mono">
                <span className="text-slate-500">Subject: </span>
                <span className="font-semibold text-slate-200">{activeDraft.subject}</span>
              </div>
            )}

            {/* Editable Draft Body Textarea */}
            <div className="relative">
              <textarea
                rows={10}
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm text-slate-200 leading-relaxed font-sans placeholder-slate-600 transition-all resize-y"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                {savedSuccess && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved to Review Hub!
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyBody}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  {copiedBody ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Email</span>
                    </>
                  )}
                </button>

                {/* Save as Draft in Review Hub */}
                <button
                  type="button"
                  onClick={handleSaveToReviewHub}
                  disabled={savingDraft || !editedBody}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition-all disabled:opacity-50"
                >
                  {savingDraft ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Save Draft to Review Hub</span>
                </button>

                {/* Link to Review Hub */}
                <Link
                  href={channel ? `/emails?channelId=${channel.channel_id}` : "/emails"}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-indigo-500/20 transition-colors"
                >
                  <span>Open Hub</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
