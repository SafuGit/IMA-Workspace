"use client";

import { useState } from "react";
import { RejectionReason, YtChannel } from "@/lib/types";
import { Trash2, X, AlertTriangle, Loader2 } from "lucide-react";

interface RejectModalProps {
  channel: YtChannel | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (channelId: string, reason: RejectionReason) => Promise<void>;
}

const REJECTION_OPTIONS: { reason: RejectionReason; label: string; desc: string }[] = [
  { reason: "followers", label: "Out of Follower Range", desc: "Less than 25k or greater than 1M subscribers" },
  { reason: "avg views", label: "Low Average Views", desc: "Low viewership relative to subscriber count" },
  { reason: "bad engagement rate", label: "Poor Engagement", desc: "Low like/comment ratio, inactive audience" },
  { reason: "bad content", label: "Low Quality Content", desc: "Automated slop, re-uploads, or poor video style" },
  { reason: "unrelated", label: "Unrelated Niche", desc: "Not in IT, coding, SaaS, or tech hardware space" },
  { reason: "other", label: "Other / Unfit", desc: "General mismatch for Fylint brand sponsorship" },
];

export default function RejectModal({
  channel,
  isOpen,
  onClose,
  onConfirm,
}: RejectModalProps) {
  const [selectedReason, setSelectedReason] = useState<RejectionReason>("bad content");
  const [loading, setLoading] = useState(false);

  if (!isOpen || !channel) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(channel.channel_id, selectedReason);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center border border-red-500/20 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Reject & Throw into Bin</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Disqualify <span className="font-semibold text-slate-200">{channel.channel_name}</span> from outreach
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Reason Selection */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Select Rejection Reason
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REJECTION_OPTIONS.map((opt) => {
              const isSelected = selectedReason === opt.reason;
              return (
                <button
                  key={opt.reason}
                  type="button"
                  onClick={() => setSelectedReason(opt.reason)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? "bg-red-500/10 border-red-500/40 text-white ring-1 ring-red-500/30 shadow-sm"
                      : "bg-slate-950/60 border-slate-800/80 text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                  }`}
                >
                  <div className="text-xs font-bold leading-tight">{opt.label}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">{opt.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Alert Note */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>This creator will be archived as rejected and will not be drafted for email outreach.</span>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleConfirm}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-lg shadow-red-600/20 transition-all disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                Confirm Rejection
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
