"use client";

import { useState, useEffect, useCallback } from "react";
import { InfluencerEmail } from "@/lib/types";
import {
  parseOutreachData,
  formatOutreachDraft,
  formatOutreachCommentary,
  generateFollowupDraft,
  computeFollowupStatus,
  FormattedDraftOption,
  FormattedHook,
  FormattedSubjectLines,
} from "@/lib/emailFormatter";
import {
  Mail,
  Send,
  CheckCircle2,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Video,
  Sparkles,
  Save,
  Loader2,
  RefreshCw,
  Inbox,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  MessageSquare,
  Zap,
} from "lucide-react";
import { CreatorAvatar } from "./SafeImage";

interface EmailsReviewHubProps {
  initialChannelId?: string;
}

export default function EmailsReviewHub({ initialChannelId }: EmailsReviewHubProps) {
  const [status, setStatus] = useState<"pending" | "followup" | "sent" | "responded" | "all">("pending");
  const [emails, setEmails] = useState<InfluencerEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<InfluencerEmail | null>(null);

  // View Mode: initial outreach pitch vs follow-up pipeline & draft
  const [viewMode, setViewMode] = useState<"outreach" | "followup">("outreach");

  // Multi-draft, subject, and hooks state (Initial outreach)
  const [draftsMap, setDraftsMap] = useState<Record<string, FormattedDraftOption>>({});
  const [activeDraftKey, setActiveDraftKey] = useState<string>("option_a");
  const [activeSubject, setActiveSubject] = useState<string>("");
  const [draftContent, setDraftContent] = useState("");
  const [subjectLines, setSubjectLines] = useState<FormattedSubjectLines>({ primary: "", alternatives: [] });
  const [hooks, setHooks] = useState<FormattedHook[]>([]);
  const [showHooks, setShowHooks] = useState(true);

  // Follow-up draft state
  const [followupSubject, setFollowupSubject] = useState<string>("");
  const [followupBody, setFollowupBody] = useState<string>("");
  const [followupSaving, setFollowupSaving] = useState(false);
  const [followupSending, setFollowupSending] = useState(false);
  const [followupCopied, setFollowupCopied] = useState(false);
  const [respondingLoading, setRespondingLoading] = useState(false);
  const [cronRunning, setCronRunning] = useState(false);

  const [copied, setCopied] = useState(false);
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const applySelectedEmail = (email: InfluencerEmail) => {
    setSelectedEmail(email);
    const parsed = email.parsed || parseOutreachData(email.outreach_draft, email.outreach_commentary);

    const drafts =
      parsed.drafts && Object.keys(parsed.drafts).length > 0
        ? parsed.drafts
        : {
            option_a: {
              key: "option_a",
              label: "Default Draft",
              subject: parsed.activeSubject || "",
              body: email.outreach_draft || "",
            },
          };

    setDraftsMap(drafts);
    const initialKey = drafts[parsed.activeDraftKey]
      ? parsed.activeDraftKey
      : Object.keys(drafts)[0] || "option_a";
    setActiveDraftKey(initialKey);

    const activeDraft = drafts[initialKey];
    setDraftContent(activeDraft?.body || parsed.activeBody || email.outreach_draft || "");
    setActiveSubject(activeDraft?.subject || parsed.activeSubject || parsed.subjectLines?.primary || "");
    setSubjectLines(parsed.subjectLines || { primary: "", alternatives: [] });
    setHooks(parsed.hooks || []);

    // Set follow-up draft state
    let fuSubj = "";
    let fuBody = "";
    if (email.followup_draft) {
      const subjMatch = email.followup_draft.match(/Subject:\s*([^\n]*)/);
      fuSubj = subjMatch ? subjMatch[1].trim() : "";
      const bodyIdx = email.followup_draft.indexOf("Body:\n");
      if (bodyIdx !== -1) {
        fuBody = email.followup_draft.slice(bodyIdx + 6).trim();
      } else {
        fuBody = email.followup_draft.replace(/Subject:\s*[^\n]*\n?/, "").trim();
      }
    } else if (email.outreach_sent_at) {
      const currentStage = email.followup_status?.stage || 1;
      const gen = generateFollowupDraft(
        currentStage,
        email.channel_name || "there",
        email.video_title || "your recent tutorial",
        parsed.activeSubject || ""
      );
      fuSubj = gen.subject;
      fuBody = gen.body;
    }
    setFollowupSubject(fuSubj);
    setFollowupBody(fuBody);

    // If viewing follow-up or sent tabs, or creator was already emailed, switch view to follow-up
    if (email.outreach_sent_at && (status === "followup" || status === "sent" || status === "responded")) {
      setViewMode("followup");
    } else if (!email.outreach_sent_at) {
      setViewMode("outreach");
    }
  };

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (initialChannelId) params.set("channelId", initialChannelId);

      const res = await fetch(`/api/emails?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        const list: InfluencerEmail[] = data.emails || [];
        setEmails(list);

        // Retain or select first email
        if (list.length > 0) {
          const matching = selectedEmail ? list.find((e) => e.id === selectedEmail.id) : null;
          const current = matching || list[0];
          applySelectedEmail(current);
        } else {
          setSelectedEmail(null);
          setDraftContent("");
          setActiveSubject("");
          setDraftsMap({});
          setHooks([]);
          setFollowupSubject("");
          setFollowupBody("");
        }
      }
    } catch (err) {
      console.error("Failed to fetch emails:", err);
    } finally {
      setLoading(false);
    }
  }, [status, initialChannelId, selectedEmail?.id]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  const handleSelectEmail = (email: InfluencerEmail) => {
    applySelectedEmail(email);
  };

  const handleSwitchDraft = (newKey: string) => {
    if (newKey === activeDraftKey) return;

    // Save current active draft edits into draftsMap before switching
    const updatedMap: Record<string, FormattedDraftOption> = {
      ...draftsMap,
      [activeDraftKey]: {
        ...(draftsMap[activeDraftKey] || { key: activeDraftKey, label: activeDraftKey }),
        body: draftContent,
        subject: activeSubject,
      },
    };

    setDraftsMap(updatedMap);
    setActiveDraftKey(newKey);

    const targetDraft = updatedMap[newKey];
    if (targetDraft) {
      setDraftContent(targetDraft.body || "");
      if (targetDraft.subject) {
        setActiveSubject(targetDraft.subject);
      }
    }
  };

  const handleSelectSubject = (subj: string) => {
    setActiveSubject(subj);
    setDraftsMap((prev) => ({
      ...prev,
      [activeDraftKey]: {
        ...(prev[activeDraftKey] || { key: activeDraftKey, label: activeDraftKey, body: draftContent }),
        subject: subj,
      },
    }));
  };

  const handleCopy = () => {
    const fullText = activeSubject ? `Subject: ${activeSubject}\n\n${draftContent}` : draftContent;
    if (!fullText) return;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopySubject = () => {
    if (!activeSubject) return;
    navigator.clipboard.writeText(activeSubject);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!selectedEmail) return;
    setSaving(true);
    try {
      const currentDraftsMap = {
        ...draftsMap,
        [activeDraftKey]: {
          ...(draftsMap[activeDraftKey] || { key: activeDraftKey, label: activeDraftKey }),
          body: draftContent,
          subject: activeSubject,
        },
      };

      const formattedDraft = formatOutreachDraft(currentDraftsMap, activeDraftKey);
      const formattedCommentary = formatOutreachCommentary(hooks, {
        primary: activeSubject || subjectLines.primary,
        alternatives: subjectLines.alternatives,
      });

      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_draft",
          draft: formattedDraft,
          commentary: formattedCommentary,
        }),
      });

      if (res.ok) {
        const updatedParsed = parseOutreachData(formattedDraft, formattedCommentary);
        setEmails((prev) =>
          prev.map((e) =>
            e.id === selectedEmail.id
              ? {
                  ...e,
                  outreach_draft: formattedDraft,
                  outreach_commentary: formattedCommentary,
                  parsed: updatedParsed,
                }
              : e
          )
        );
        setSelectedEmail((prev) =>
          prev && prev.id === selectedEmail.id
            ? {
                ...prev,
                outreach_draft: formattedDraft,
                outreach_commentary: formattedCommentary,
                parsed: updatedParsed,
              }
            : prev
        );
        setDraftsMap(currentDraftsMap);
      }
    } catch (err) {
      console.error("Failed to save draft:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!selectedEmail) return;
    setActionLoading(true);
    try {
      const finalEmail = activeSubject ? `Subject: ${activeSubject}\n\n${draftContent}` : draftContent;
      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", final_email: finalEmail }),
      });
      if (res.ok) {
        // If in pending tab, remove from active list and advance to next
        if (status === "pending") {
          const remaining = emails.filter((e) => e.id !== selectedEmail.id);
          setEmails(remaining);
          if (remaining.length > 0) {
            applySelectedEmail(remaining[0]);
          } else {
            setSelectedEmail(null);
            setDraftContent("");
            setActiveSubject("");
            setDraftsMap({});
            setHooks([]);
          }
        } else {
          const nowIso = new Date().toISOString();
          const updatedStatus = computeFollowupStatus(
            nowIso,
            null,
            null,
            null,
            selectedEmail.followup_commentary
          );
          setEmails((prev) =>
            prev.map((e) =>
              e.id === selectedEmail.id
                ? {
                    ...e,
                    outreach_sent_at: nowIso,
                    followup_status: updatedStatus,
                  }
                : e
            )
          );
          setSelectedEmail((prev) =>
            prev
              ? {
                  ...prev,
                  outreach_sent_at: nowIso,
                  followup_status: updatedStatus,
                }
              : null
          );
        }
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Creator Responded toggle handler
  const handleToggleResponded = async () => {
    if (!selectedEmail) return;
    const currentResponded = !!selectedEmail.followup_status?.isResponded;
    const nextResponded = !currentResponded;
    setRespondingLoading(true);

    try {
      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "creator_responded",
          responded: nextResponded,
        }),
      });

      if (res.ok) {
        const nowIso = nextResponded ? new Date().toISOString() : null;
        const updatedStatus = computeFollowupStatus(
          selectedEmail.outreach_sent_at,
          nowIso,
          selectedEmail.followup_sent_at,
          selectedEmail.followup_draft,
          selectedEmail.followup_commentary
        );

        const updateItem = (e: InfluencerEmail): InfluencerEmail => {
          if (e.id !== selectedEmail.id) return e;
          return {
            ...e,
            creator_responded_at: nowIso,
            followup_status: updatedStatus,
          };
        };

        setEmails((prev) => {
          if (status === "followup" && nextResponded) {
            return prev.filter((e) => e.id !== selectedEmail.id);
          }
          if (status === "responded" && !nextResponded) {
            return prev.filter((e) => e.id !== selectedEmail.id);
          }
          return prev.map(updateItem);
        });

        setSelectedEmail((prev) => (prev ? updateItem(prev) : null));
      }
    } catch (err) {
      console.error("Failed to toggle creator responded:", err);
    } finally {
      setRespondingLoading(false);
    }
  };

  // Follow-up draft save handler
  const handleSaveFollowupDraft = async () => {
    if (!selectedEmail) return;
    setFollowupSaving(true);
    try {
      const formattedFu = `Subject: ${followupSubject}\n\nBody:\n${followupBody}`;
      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_followup_draft",
          followup_draft: formattedFu,
        }),
      });

      if (res.ok) {
        const updateItem = (e: InfluencerEmail): InfluencerEmail => {
          if (e.id !== selectedEmail.id) return e;
          return {
            ...e,
            followup_draft: formattedFu,
          };
        };
        setEmails((prev) => prev.map(updateItem));
        setSelectedEmail((prev) => (prev ? updateItem(prev) : null));
      }
    } catch (err) {
      console.error("Failed to save follow-up draft:", err);
    } finally {
      setFollowupSaving(false);
    }
  };

  // Follow-up send handler
  const handleSendFollowup = async () => {
    if (!selectedEmail) return;
    setFollowupSending(true);
    try {
      const finalFu = followupSubject
        ? `Subject: ${followupSubject}\n\n${followupBody}`
        : followupBody;
      const currentStage = selectedEmail.followup_status?.stage || 1;

      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_followup",
          final_email: finalFu,
          stage: currentStage,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const fuSentAt = data.followup_sent_at || new Date().toISOString();
        const updatedCommentary = (selectedEmail.followup_commentary || "") + `\n=== FU${currentStage}_SENT: ${fuSentAt} ===`;

        const updatedStatus = computeFollowupStatus(
          selectedEmail.outreach_sent_at,
          selectedEmail.creator_responded_at,
          fuSentAt,
          selectedEmail.followup_draft,
          updatedCommentary
        );

        const updateItem = (e: InfluencerEmail): InfluencerEmail => {
          if (e.id !== selectedEmail.id) return e;
          return {
            ...e,
            followup_sent_at: fuSentAt,
            followup_commentary: updatedCommentary,
            followup_email: finalFu,
            followup_status: updatedStatus,
          };
        };

        setEmails((prev) => prev.map(updateItem));
        setSelectedEmail((prev) => (prev ? updateItem(prev) : null));
      }
    } catch (err) {
      console.error("Failed to send follow-up:", err);
    } finally {
      setFollowupSending(false);
    }
  };

  // Load preset follow-up stage copy
  const handleLoadStagePreset = (stage: number) => {
    if (!selectedEmail) return;
    const gen = generateFollowupDraft(
      stage,
      selectedEmail.channel_name || "there",
      selectedEmail.video_title || "your recent tutorial",
      activeSubject || ""
    );
    setFollowupSubject(gen.subject);
    setFollowupBody(gen.body);
  };

  // Trigger follow-up cron endpoint manually
  const handleRunFollowupCron = async () => {
    setCronRunning(true);
    try {
      const res = await fetch("/api/emails/followups/cron", { method: "POST" });
      if (res.ok) {
        await fetchEmails();
      }
    } catch (err) {
      console.error("Failed to run follow-up check:", err);
    } finally {
      setCronRunning(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this email draft?")) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/emails/${id}`, { method: "DELETE" });
      if (res.ok) {
        const remaining = emails.filter((e) => e.id !== id);
        setEmails(remaining);
        if (selectedEmail?.id === id) {
          if (remaining.length > 0) {
            applySelectedEmail(remaining[0]);
          } else {
            setSelectedEmail(null);
            setDraftContent("");
            setActiveSubject("");
            setDraftsMap({});
            setHooks([]);
            setFollowupSubject("");
            setFollowupBody("");
          }
        }
      }
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {[
            { id: "pending", label: "Morning Review" },
            { id: "followup", label: "Follow-ups" },
            { id: "sent", label: "Sent Outreach" },
            { id: "responded", label: "Responded" },
            { id: "all", label: "All History" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setStatus(t.id as "pending" | "followup" | "sent" | "responded" | "all")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                status === t.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunFollowupCron}
            disabled={cronRunning || loading}
            title="Check Day 3/7/21 milestones and auto-generate due follow-up drafts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border border-indigo-800/50 text-xs font-medium transition-colors"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${cronRunning ? "animate-spin" : ""}`} />
            {cronRunning ? "Checking Milestones..." : "Check Due Follow-ups"}
          </button>

          <button
            onClick={() => fetchEmails()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Two-Column Review Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Email List (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[780px]">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              {status === "pending"
                ? "Queue to Review"
                : status === "followup"
                ? "Follow-up Pipeline"
                : status === "responded"
                ? "Creators Responded"
                : "Outreach History"}{" "}
              ({emails.length})
            </span>
            <span className="text-[11px] text-indigo-400 font-medium">Fylint Agency</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1">
            {loading ? (
              <div className="py-20 text-center text-xs text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-indigo-500 mb-2" />
                Loading email queue...
              </div>
            ) : emails.length === 0 ? (
              <div className="py-20 text-center text-xs text-slate-500 space-y-2">
                <Inbox className="w-8 h-8 mx-auto text-slate-600" />
                <div>No emails found in this tab.</div>
                <div className="text-[11px] text-slate-600">
                  {status === "pending"
                    ? "Approved creators without drafts will be generated by the morning cron worker."
                    : status === "followup"
                    ? "No follow-up sequences currently due. Send outreach first to start the Day 3/7/21 countdown."
                    : "No records found."}
                </div>
              </div>
            ) : (
              emails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                const isSent = !!email.outreach_sent_at;
                const fuStatus = email.followup_status;

                return (
                  <button
                    key={email.id}
                    onClick={() => handleSelectEmail(email)}
                    className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? "bg-indigo-600/15 border-indigo-500/30 text-white shadow-sm ring-1 ring-indigo-500/20"
                        : "bg-slate-950/40 border-transparent hover:bg-slate-800/40 text-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <CreatorAvatar
                        src={email.profile_photo_url}
                        name={email.channel_name || "Creator"}
                        className="w-9 h-9 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                        initialsClassName="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 ring-1 ring-slate-700"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white truncate">
                            {email.channel_name || "Creator"}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Status and Timer Pills */}
                            {!isSent ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                                Ready
                              </span>
                            ) : fuStatus?.isResponded ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold flex items-center gap-1">
                                <MessageSquare className="w-2.5 h-2.5" />
                                Responded
                              </span>
                            ) : fuStatus?.isCompleted ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                                Sequence Done
                              </span>
                            ) : fuStatus?.isDue ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold flex items-center gap-1 animate-pulse">
                                <Zap className="w-2.5 h-2.5 text-amber-400" />
                                FU {fuStatus.stage} Due
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium flex items-center gap-1 font-mono">
                                <Clock className="w-2.5 h-2.5" />
                                FU {fuStatus?.stage || 1} {fuStatus?.timeRemainingText}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {email.email_address}
                        </div>
                        {email.video_title && (
                          <div className="text-[11px] text-slate-500 truncate mt-1 flex items-center gap-1">
                            <Video className="w-3 h-3 text-slate-500 shrink-0" />
                            {email.video_title}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Draft Review Workspace (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[780px]">
          {selectedEmail ? (
            <>
              {/* Creator Context Header */}
              <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CreatorAvatar
                    src={selectedEmail.profile_photo_url}
                    name={selectedEmail.channel_name || "Creator"}
                    className="w-11 h-11 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                    initialsClassName="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 shrink-0 ring-1 ring-slate-700"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{selectedEmail.channel_name}</h3>
                      <a
                        href={`https://www.youtube.com/channel/${selectedEmail.channel_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-indigo-400"
                        title="View YouTube Channel"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="text-xs text-slate-400 font-mono mt-0.5">
                      To: {selectedEmail.email_address}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Creator Responded Button (Always visible when outreach was sent) */}
                  {selectedEmail.outreach_sent_at && (
                    <button
                      onClick={handleToggleResponded}
                      disabled={respondingLoading}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-all ${
                        selectedEmail.followup_status?.isResponded
                          ? "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                      }`}
                      title={
                        selectedEmail.followup_status?.isResponded
                          ? "Creator responded! Click to undo if clicked by mistake"
                          : "Mark creator as responded to stop follow-up sequence"
                      }
                    >
                      {respondingLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : selectedEmail.followup_status?.isResponded ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <MessageSquare className="w-3.5 h-3.5" />
                      )}
                      {selectedEmail.followup_status?.isResponded ? "Creator Responded ✓" : "Creator Responded"}
                    </button>
                  )}

                  {/* Send Initial Outreach Button */}
                  {!selectedEmail.outreach_sent_at ? (
                    <>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied!" : "Copy Draft"}
                      </button>

                      <button
                        onClick={handleMarkAsSent}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        Send & Next
                      </button>
                    </>
                  ) : null}

                  <button
                    onClick={() => handleDelete(selectedEmail.id)}
                    title="Delete Record"
                    className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* View Mode Segmented Controls (When outreach was sent) */}
              {selectedEmail.outreach_sent_at && (
                <div className="px-5 py-2.5 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setViewMode("followup")}
                      className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                        viewMode === "followup"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      Follow-up Pipeline & Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("outreach")}
                      className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
                        viewMode === "outreach"
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Mail className="w-3 h-3" />
                      Initial Pitch (Sent)
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    Outreach Sent: {new Date(selectedEmail.outreach_sent_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Follow-up Sequence Pipeline & Stepper (Visible when outreach was sent) */}
              {selectedEmail.outreach_sent_at && (
                <div className="border-b border-slate-800 bg-slate-950/40 p-4 space-y-3">
                  {/* Countdown / Status Banner */}
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                      selectedEmail.followup_status?.isResponded
                        ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
                        : selectedEmail.followup_status?.isCompleted
                        ? "bg-slate-900 border-slate-800 text-slate-400"
                        : selectedEmail.followup_status?.isDue
                        ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                        : "bg-indigo-950/30 border-indigo-500/30 text-indigo-300"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {selectedEmail.followup_status?.isResponded ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : selectedEmail.followup_status?.isDue ? (
                        <Zap className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
                      ) : (
                        <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                      )}
                      <span className="font-semibold">
                        {selectedEmail.followup_status?.isResponded
                          ? `Creator responded${
                              selectedEmail.followup_status.respondedAt
                                ? ` on ${new Date(selectedEmail.followup_status.respondedAt).toLocaleDateString()}`
                                : ""
                            } — follow-up sequence paused.`
                          : selectedEmail.followup_status?.isCompleted
                          ? "Sequence completed. All 3 follow-up touches dispatched."
                          : selectedEmail.followup_status?.isDue
                          ? `Follow-up Touch ${selectedEmail.followup_status.stage} is DUE NOW! Safwan's broker draft ready below.`
                          : `Next Follow-up (Touch ${selectedEmail.followup_status?.stage || 1}) scheduled ${
                              selectedEmail.followup_status?.timeRemainingText
                            }${
                              selectedEmail.followup_status?.nextFollowupDueAt
                                ? ` (${new Date(selectedEmail.followup_status.nextFollowupDueAt).toLocaleDateString(
                                    undefined,
                                    { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
                                  )})`
                                : ""
                            }`}
                      </span>
                    </div>

                    {!selectedEmail.followup_status?.isResponded && (
                      <button
                        onClick={handleToggleResponded}
                        disabled={respondingLoading}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-600 text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 transition-all shadow-sm"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Mark Responded
                      </button>
                    )}
                  </div>

                  {/* 4-Touch Sequence Stepper */}
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {(selectedEmail.followup_status?.milestones || []).map((m) => {
                      const isCurrentActive =
                        !selectedEmail.followup_status?.isResponded &&
                        selectedEmail.followup_status?.stage === m.stage;

                      return (
                        <div
                          key={m.stage}
                          className={`p-2 rounded-lg border text-center transition-all ${
                            m.isSent
                              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                              : m.isDue
                              ? "bg-amber-950/30 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30 font-semibold"
                              : isCurrentActive
                              ? "bg-indigo-950/40 border-indigo-500/40 text-indigo-300"
                              : "bg-slate-900/40 border-slate-800/80 text-slate-500"
                          }`}
                        >
                          <div className="text-[10px] uppercase font-bold tracking-wider">
                            {m.stage === 0 ? "Initial Pitch" : `Touch ${m.stage}`}
                          </div>
                          <div className="text-[11px] font-medium truncate mt-0.5">
                            {m.stage === 0
                              ? "Day 0"
                              : m.stage === 1
                              ? "Day 3 (Slots)"
                              : m.stage === 2
                              ? "Day 7 (Rates)"
                              : "Day 21 (Breakup)"}
                          </div>
                          <div className="text-[10px] mt-1 font-mono">
                            {m.isSent
                              ? "✓ Sent"
                              : m.isDue
                              ? "⚡ Due Now"
                              : `in ${m.dayOffset}d`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Follow-up View Mode: Follow-up Draft Editor Workspace */}
              {viewMode === "followup" && selectedEmail.outreach_sent_at ? (
                <div className="flex-1 p-5 flex flex-col min-h-0 bg-slate-950/40 space-y-3">
                  {/* Preset Template Switcher & Save Button */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                        Preset Copy:
                      </span>
                      {[
                        { stage: 1, label: "Touch 1 (Day 3 Slots)" },
                        { stage: 2, label: "Touch 2 (Day 7 Rates)" },
                        { stage: 3, label: "Touch 3 (Day 21 Breakup)" },
                      ].map((p) => (
                        <button
                          key={p.stage}
                          type="button"
                          onClick={() => handleLoadStagePreset(p.stage)}
                          className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                            selectedEmail.followup_status?.stage === p.stage
                              ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300 font-medium"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={handleSaveFollowupDraft}
                      disabled={followupSaving}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-xs text-indigo-400 border border-indigo-500/30 font-medium disabled:opacity-50 transition-colors shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {followupSaving ? "Saving..." : "Save Draft"}
                    </button>
                  </div>

                  {/* Follow-up Subject Line */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Follow-up Subject Line
                    </label>
                    <input
                      type="text"
                      value={followupSubject}
                      onChange={(e) => setFollowupSubject(e.target.value)}
                      placeholder="Re: Subject..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  {/* Follow-up Body */}
                  <div className="flex-1 flex flex-col min-h-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Follow-up Body (Safwan's Broker Voice)
                      </label>
                      <span className="text-[11px] text-slate-500">
                        {followupBody ? followupBody.split(/\s+/).filter(Boolean).length : 0} words
                      </span>
                    </div>
                    <textarea
                      value={followupBody}
                      onChange={(e) => setFollowupBody(e.target.value)}
                      className="flex-1 w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none"
                      placeholder="Follow-up copy in Safwan's voice will appear here..."
                    />
                  </div>

                  {/* Follow-up Footer Actions */}
                  <div className="pt-2 flex items-center justify-between border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => {
                        const fullText = followupSubject
                          ? `Subject: ${followupSubject}\n\n${followupBody}`
                          : followupBody;
                        if (!fullText) return;
                        navigator.clipboard.writeText(fullText);
                        setFollowupCopied(true);
                        setTimeout(() => setFollowupCopied(false), 2000);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-800 transition-colors"
                    >
                      {followupCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {followupCopied ? "Copied Follow-up!" : "Copy Follow-up"}
                    </button>

                    <button
                      onClick={handleSendFollowup}
                      disabled={followupSending || selectedEmail.followup_status?.isResponded}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {followupSending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      Send Touch {selectedEmail.followup_status?.stage || 1} Follow-up
                    </button>
                  </div>
                </div>
              ) : (
                /* Initial Outreach Review Mode */
                <>
                  {/* Draft Options Tabs */}
                  {draftsMap && Object.keys(draftsMap).length > 1 && (
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-950/70 border-b border-slate-800 overflow-x-auto">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-indigo-400" />
                        Draft Options:
                      </span>
                      <div className="flex items-center gap-1.5">
                        {Object.entries(draftsMap).map(([key, draft]) => {
                          const isCurrent = key === activeDraftKey;
                          const label = draft.label || key.replace(/_/g, " ").toUpperCase();
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleSwitchDraft(key)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                                isCurrent
                                  ? "bg-indigo-600 text-white shadow-sm ring-1 ring-indigo-500/40"
                                  : "bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800"
                              }`}
                            >
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Subject Line Editor + Alternative Pills */}
                  <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Subject Line
                      </label>
                      {activeSubject && (
                        <button
                          type="button"
                          onClick={handleCopySubject}
                          className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                        >
                          {copiedSubject ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {copiedSubject ? "Copied Subject" : "Copy Subject"}
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={activeSubject}
                      onChange={(e) => {
                        const val = e.target.value;
                        setActiveSubject(val);
                        setDraftsMap((prev) => ({
                          ...prev,
                          [activeDraftKey]: {
                            ...(prev[activeDraftKey] || { key: activeDraftKey, label: activeDraftKey, body: draftContent }),
                            subject: val,
                          },
                        }));
                      }}
                      placeholder="Enter outreach subject line..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    />

                    {/* Alternative Subject Pills */}
                    {subjectLines && (subjectLines.primary || (subjectLines.alternatives && subjectLines.alternatives.length > 0)) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider mr-1">
                          Alternatives:
                        </span>
                        {[
                          ...(subjectLines.primary ? [subjectLines.primary] : []),
                          ...(subjectLines.alternatives || []),
                        ]
                          .filter((subj, idx, self) => subj && self.indexOf(subj) === idx)
                          .map((subj, idx) => {
                            const isSelected = activeSubject === subj;
                            return (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleSelectSubject(subj)}
                                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left truncate max-w-xs ${
                                  isSelected
                                    ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300 font-medium"
                                    : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                                }`}
                                title={subj}
                              >
                                {subj}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Video Reference */}
                  {selectedEmail.video_title && (
                    <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-950/20 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2 truncate">
                        <Video className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">Referenced Video: {selectedEmail.video_title}</span>
                      </div>
                      {selectedEmail.video_id && (
                        <a
                          href={`https://www.youtube.com/watch?v=${selectedEmail.video_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 font-medium shrink-0 ml-2"
                        >
                          Watch Video &rarr;
                        </a>
                      )}
                    </div>
                  )}

                  {/* Video Hooks Strategy Accordion / Commentary */}
                  {hooks && hooks.length > 0 ? (
                    <div className="border-b border-slate-800 bg-slate-950/20">
                      <button
                        type="button"
                        onClick={() => setShowHooks(!showHooks)}
                        className="w-full px-5 py-2.5 flex items-center justify-between text-xs text-slate-300 hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="font-semibold text-white">Extracted Video Hooks</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                            {hooks.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <span>{showHooks ? "Hide" : "Show"}</span>
                          {showHooks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                      </button>

                      {showHooks && (
                        <div className="px-5 pb-3 pt-1 space-y-2 max-h-48 overflow-y-auto">
                          {hooks.map((h, idx) => {
                            const isCommentBacked = h.tag?.toLowerCase().includes("comment");
                            return (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 text-xs space-y-1.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
                                        isCommentBacked
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                      }`}
                                    >
                                      {isCommentBacked ? "💬 Comment-Backed" : "🎬 Transcript"}
                                    </span>
                                    {h.timestamp && (
                                      <span className="text-[10px] font-mono text-slate-400">
                                        ⏱ {h.timestamp}
                                      </span>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const hookInsert = `Saw your take at ${h.timestamp || "recent video"}: "${h.text}"\n\n`;
                                      setDraftContent((prev) => hookInsert + prev);
                                    }}
                                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                  >
                                    + Prepend to Draft
                                  </button>
                                </div>

                                <div className="text-slate-200 font-serif italic text-[11px] bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                                  &ldquo;{h.text}&rdquo;
                                </div>

                                {h.analysis && (
                                  <div className="text-[11px] text-slate-400 leading-relaxed">
                                    <span className="text-slate-500 font-medium">Angle: </span>
                                    {h.analysis}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : selectedEmail.outreach_commentary ? (
                    <div className="p-4 bg-indigo-950/20 border-b border-slate-800 text-xs text-indigo-300 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div className="leading-relaxed">
                        <span className="font-semibold text-indigo-200">AI Hook Strategy: </span>
                        {selectedEmail.outreach_commentary}
                      </div>
                    </div>
                  ) : null}

                  {/* Editable Draft Editor */}
                  <div className="flex-1 p-5 flex flex-col min-h-0 bg-slate-950/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          Outreach Body (Editable)
                        </label>
                        <span className="text-[11px] text-slate-500">
                          {draftContent ? draftContent.split(/\s+/).filter(Boolean).length : 0} words
                        </span>
                      </div>
                      <button
                        onClick={handleSaveDraft}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-xs text-indigo-400 border border-indigo-500/30 font-medium disabled:opacity-50 transition-colors"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving ? "Saving..." : "Save Draft"}
                      </button>
                    </div>
                    <textarea
                      value={draftContent}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftContent(val);
                        setDraftsMap((prev) => ({
                          ...prev,
                          [activeDraftKey]: {
                            ...(prev[activeDraftKey] || { key: activeDraftKey, label: activeDraftKey, subject: activeSubject }),
                            body: val,
                          },
                        }));
                      }}
                      className="flex-1 w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none"
                      placeholder="Generated outreach draft will appear here..."
                    />
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500 space-y-3">
              <Mail className="w-10 h-10 text-slate-700" />
              <div className="text-sm font-medium text-slate-400">Select an email to review</div>
              <div className="text-xs text-slate-600 max-w-sm">
                Pick a draft from the left queue to inspect the personalized video hook, polish the copy,
                and mark it as sent.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
