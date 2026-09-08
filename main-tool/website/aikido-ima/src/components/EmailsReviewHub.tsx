"use client";

import { useState, useEffect, useCallback } from "react";
import { InfluencerEmail } from "@/lib/types";
import { formatDate } from "@/lib/utils";
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
} from "lucide-react";

interface EmailsReviewHubProps {
  initialChannelId?: string;
}

export default function EmailsReviewHub({ initialChannelId }: EmailsReviewHubProps) {
  const [status, setStatus] = useState<"pending" | "sent" | "all">("pending");
  const [emails, setEmails] = useState<InfluencerEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<InfluencerEmail | null>(null);

  // Editable draft state
  const [draftContent, setDraftContent] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
          setSelectedEmail(current);
          setDraftContent(current.outreach_draft || "");
        } else {
          setSelectedEmail(null);
          setDraftContent("");
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
    setSelectedEmail(email);
    setDraftContent(email.outreach_draft || "");
  };

  const handleCopy = () => {
    if (!draftContent) return;
    navigator.clipboard.writeText(draftContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveDraft = async () => {
    if (!selectedEmail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", draft: draftContent }),
      });
      if (res.ok) {
        setEmails((prev) =>
          prev.map((e) => (e.id === selectedEmail.id ? { ...e, outreach_draft: draftContent } : e))
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!selectedEmail) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send" }),
      });
      if (res.ok) {
        // If in pending tab, remove from active list and advance to next
        if (status === "pending") {
          const remaining = emails.filter((e) => e.id !== selectedEmail.id);
          setEmails(remaining);
          if (remaining.length > 0) {
            setSelectedEmail(remaining[0]);
            setDraftContent(remaining[0].outreach_draft || "");
          } else {
            setSelectedEmail(null);
            setDraftContent("");
          }
        } else {
          setEmails((prev) =>
            prev.map((e) =>
              e.id === selectedEmail.id
                ? { ...e, outreach_sent_at: new Date().toISOString() }
                : e
            )
          );
        }
      }
    } finally {
      setActionLoading(false);
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
            setSelectedEmail(remaining[0]);
            setDraftContent(remaining[0].outreach_draft || "");
          } else {
            setSelectedEmail(null);
            setDraftContent("");
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
        <div className="inline-flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
          {[
            { id: "pending", label: "Morning Review Queue" },
            { id: "sent", label: "Sent Outreach" },
            { id: "all", label: "All Outreach" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setStatus(t.id as "pending" | "sent" | "all")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                status === t.id
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => fetchEmails()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Queue
        </button>
      </div>

      {/* Main Two-Column Review Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Email List (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[750px]">
          <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">
              {status === "pending" ? "Queue to Review" : "Outreach History"} ({emails.length})
            </span>
            <span className="text-[11px] text-indigo-400 font-medium">Overnight Batch</span>
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
                  Approved creators without drafts will be generated by the morning cron worker.
                </div>
              </div>
            ) : (
              emails.map((email) => {
                const isSelected = selectedEmail?.id === email.id;
                const isSent = !!email.outreach_sent_at;

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
                      {email.profile_photo_url ? (
                        <img
                          src={email.profile_photo_url}
                          alt=""
                          className="w-9 h-9 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">
                          {(email.channel_name || "C").charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-white truncate">
                            {email.channel_name || "Creator"}
                          </span>
                          {isSent ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              Sent
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                              Ready
                            </span>
                          )}
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
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[750px]">
          {selectedEmail ? (
            <>
              {/* Creator Context Header */}
              <div className="p-5 border-b border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {selectedEmail.profile_photo_url ? (
                    <img
                      src={selectedEmail.profile_photo_url}
                      alt=""
                      className="w-11 h-11 rounded-full object-cover bg-slate-800 ring-1 ring-slate-700 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-400 shrink-0">
                      {(selectedEmail.channel_name || "C").charAt(0)}
                    </div>
                  )}
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied!" : "Copy Draft"}
                  </button>

                  <button
                    onClick={handleMarkAsSent}
                    disabled={actionLoading || !!selectedEmail.outreach_sent_at}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold shadow-md transition-all ${
                      selectedEmail.outreach_sent_at
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-default"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                    }`}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {selectedEmail.outreach_sent_at ? "Marked as Sent" : "Send & Next"}
                  </button>

                  <button
                    onClick={() => handleDelete(selectedEmail.id)}
                    title="Delete Draft"
                    className="p-1.5 rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Personalization Context Box */}
              {selectedEmail.outreach_commentary && (
                <div className="p-4 bg-indigo-950/20 border-b border-slate-800 text-xs text-indigo-300 flex items-start gap-2.5">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-semibold text-indigo-200">AI Hook Strategy: </span>
                    {selectedEmail.outreach_commentary}
                  </div>
                </div>
              )}

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

              {/* Editable Draft Editor */}
              <div className="flex-1 p-5 flex flex-col min-h-0 bg-slate-950/40">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Outreach Copy (Editable)
                  </label>
                  <button
                    onClick={handleSaveDraft}
                    disabled={saving}
                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? "Saving..." : "Save Draft"}
                  </button>
                </div>
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="flex-1 w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 resize-none"
                  placeholder="Generated outreach draft will appear here..."
                />
              </div>
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
