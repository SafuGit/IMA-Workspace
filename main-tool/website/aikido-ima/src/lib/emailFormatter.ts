export interface FormattedDraftOption {
  key: string;
  label: string;
  subject: string;
  body: string;
}

export interface FormattedHook {
  tag: string;
  timestamp: string;
  text: string;
  analysis?: string;
}

export interface FormattedSubjectLines {
  primary: string;
  alternatives: string[];
}

export interface ParsedOutreachData {
  activeDraftKey: string;
  activeSubject: string;
  activeBody: string;
  drafts: Record<string, FormattedDraftOption>;
  subjectLines: FormattedSubjectLines;
  hooks: FormattedHook[];
  isFormatted: boolean;
}

/**
 * Formats all 3 outreach drafts into a single structured string for DB storage.
 */
export function formatOutreachDraft(
  drafts: Record<string, { label?: string; subject?: string; body: string } | undefined>,
  activeKey: string = "option_a"
): string {
  let out = `=== ACTIVE_KEY: ${activeKey} ===\n\n`;

  for (const [key, draft] of Object.entries(drafts)) {
    if (!draft) continue;
    const label = draft.label || key;
    const subject = draft.subject || "";
    const body = draft.body || "";
    out += `=== DRAFT_START: ${key} | ${label} ===\n`;
    out += `Subject: ${subject}\n`;
    out += `Body:\n${body.trim()}\n`;
    out += `=== DRAFT_END ===\n\n`;
  }

  return out.trim();
}

/**
 * Formats subject lines and hooks into a single structured string for DB storage.
 */
export function formatOutreachCommentary(
  hooks: FormattedHook[] = [],
  subjectLines?:
    | FormattedSubjectLines
    | { primary?: string; alternative_1?: string; alternative_2?: string; alternatives?: string[] }
): string {
  const parts: string[] = [];

  if (subjectLines) {
    const primary = subjectLines.primary || "";
    let alternatives: string[] = [];
    if ("alternatives" in subjectLines && Array.isArray(subjectLines.alternatives)) {
      alternatives = subjectLines.alternatives;
    } else {
      const anySubs = subjectLines as { alternative_1?: string; alternative_2?: string };
      if (anySubs.alternative_1) alternatives.push(anySubs.alternative_1);
      if (anySubs.alternative_2) alternatives.push(anySubs.alternative_2);
    }

    if (primary || alternatives.length > 0) {
      let slPart = `=== SUBJECT_LINES ===\n`;
      if (primary) {
        slPart += `Primary: ${primary}\n`;
      }
      for (const alt of alternatives) {
        if (alt?.trim()) {
          slPart += `Alternative: ${alt.trim()}\n`;
        }
      }
      parts.push(slPart.trim());
    }
  }

  if (hooks && hooks.length > 0) {
    let hooksPart = `=== HOOKS ===\n`;
    hooks.forEach((h, idx) => {
      hooksPart += `--- HOOK ${idx + 1} [${h.tag || "Hook"} | ${h.timestamp || "00:00"}] ---\n`;
      hooksPart += `Text: ${h.text || ""}\n`;
      if (h.analysis) {
        hooksPart += `Analysis: ${h.analysis}\n`;
      }
      hooksPart += `\n`;
    });
    parts.push(hooksPart.trim());
  }

  return parts.join("\n\n").trim();
}

/**
 * Parses outreach_draft and outreach_commentary back into structured data.
 * Falls back gracefully to plain text for legacy records.
 */
export function parseOutreachData(
  rawDraft: string | null | undefined,
  rawCommentary?: string | null | undefined
): ParsedOutreachData {
  const result: ParsedOutreachData = {
    activeDraftKey: "option_a",
    activeSubject: "",
    activeBody: "",
    drafts: {},
    subjectLines: { primary: "", alternatives: [] },
    hooks: [],
    isFormatted: false,
  };

  if (!rawDraft && !rawCommentary) {
    return result;
  }

  // 1. Parse drafts from rawDraft
  if (rawDraft) {
    if (rawDraft.includes("=== DRAFT_START:")) {
      result.isFormatted = true;

      // Check for active key
      const activeMatch = rawDraft.match(/=== ACTIVE_KEY:\s*(\w+)\s*===/);
      if (activeMatch) {
        result.activeDraftKey = activeMatch[1];
      }

      // Split by DRAFT_START
      const draftChunks = rawDraft.split(/=== DRAFT_START:\s*/);
      for (let i = 1; i < draftChunks.length; i++) {
        const chunk = draftChunks[i];
        const headerEndIdx = chunk.indexOf("===");
        if (headerEndIdx === -1) continue;

        const header = chunk.slice(0, headerEndIdx).trim();
        const [keyPart, labelPart] = header.split("|").map((s) => s.trim());
        const key = keyPart || `option_${i}`;
        const label = labelPart || key;

        const content = chunk.slice(headerEndIdx + 3).split("=== DRAFT_END ===")[0] || "";

        let subject = "";
        let body = "";

        const subjectMatch = content.match(/Subject:\s*([^\n]*)/);
        if (subjectMatch) {
          subject = subjectMatch[1].trim();
        }

        const bodyIdx = content.indexOf("Body:\n");
        if (bodyIdx !== -1) {
          body = content.slice(bodyIdx + 6).trim();
        } else {
          body = content.replace(/Subject:\s*[^\n]*\n?/, "").trim();
        }

        result.drafts[key] = {
          key,
          label,
          subject,
          body,
        };
      }

      // Set active draft
      const active = result.drafts[result.activeDraftKey] || Object.values(result.drafts)[0];
      if (active) {
        result.activeDraftKey = active.key;
        result.activeSubject = active.subject;
        result.activeBody = active.body;
      }
    } else {
      // Legacy unformatted plain text
      result.activeDraftKey = "option_a";
      result.activeBody = rawDraft.trim();
      result.activeSubject = "";
      result.drafts["option_a"] = {
        key: "option_a",
        label: "Default Draft",
        subject: "",
        body: rawDraft.trim(),
      };
    }
  }

  // 2. Parse Subject Lines & Hooks from rawCommentary or rawDraft
  const commentarySources = [rawCommentary, rawDraft].filter(Boolean) as string[];

  for (const src of commentarySources) {
    // Subject lines
    if (src.includes("=== SUBJECT_LINES ===")) {
      result.isFormatted = true;
      const subSection = src.split("=== SUBJECT_LINES ===")[1]?.split("===")[0] || "";
      const lines = subSection.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("Primary:")) {
          result.subjectLines.primary = trimmed.replace(/^Primary:\s*/, "").trim();
        } else if (trimmed.startsWith("Alternative:")) {
          const alt = trimmed.replace(/^Alternative:\s*/, "").trim();
          if (alt && !result.subjectLines.alternatives.includes(alt)) {
            result.subjectLines.alternatives.push(alt);
          }
        }
      }
    }

    // Hooks
    if (src.includes("=== HOOKS ===")) {
      result.isFormatted = true;
      const hookSection = src.split("=== HOOKS ===")[1]?.split("===")[0] || "";
      const hookBlocks = hookSection.split(/--- HOOK \d+/);
      for (let j = 1; j < hookBlocks.length; j++) {
        const block = hookBlocks[j];
        const headerMatch = block.match(/^\s*\[([^|\]]+)(?:\|\s*([^\]]+))?\]\s*---/);
        const tag = headerMatch?.[1]?.trim() || `Hook ${j}`;
        const timestamp = headerMatch?.[2]?.trim() || "00:00";

        let text = "";
        let analysis: string | undefined;

        const textMatch = block.match(/Text:\s*([\s\S]*?)(?=\nAnalysis:|$)/);
        if (textMatch) {
          text = textMatch[1].trim();
        }

        const analysisMatch = block.match(/Analysis:\s*([\s\S]*?)(?=\n---|$)/);
        if (analysisMatch) {
          analysis = analysisMatch[1].trim();
        }

        if (text) {
          result.hooks.push({
            tag,
            timestamp,
            text,
            analysis,
          });
        }
      }
    }
  }

  // If activeSubject is empty but we have a primary subject line, sync them
  if (!result.activeSubject && result.subjectLines.primary) {
    result.activeSubject = result.subjectLines.primary;
  }

  return result;
}

export interface FollowupMilestone {
  stage: number; // 0 = Initial, 1 = Day 3, 2 = Day 7, 3 = Day 21
  title: string;
  dayOffset: number;
  dueAt: string;
  isSent: boolean;
  isDue: boolean;
  isUpcoming: boolean;
  sentAt?: string | null;
}

export interface FollowupStatusInfo {
  stage: number; // 1 = Day 3, 2 = Day 7, 3 = Day 21
  isResponded: boolean;
  respondedAt: string | null;
  nextFollowupDueAt: string | null;
  isDue: boolean;
  timeRemainingText: string;
  badgeLabel: string;
  badgeVariant: "scheduled" | "due" | "responded" | "completed";
  milestones: FollowupMilestone[];
  isCompleted: boolean;
}

/**
 * Computes follow-up timing and sequence status relative to outreach_sent_at.
 * Follow-up schedule:
 * - Initial Touch (Day 0)
 * - Touch 1 (FU 1): 3 days after outreach (Day 3)
 * - Touch 2 (FU 2): 7 days after outreach (Day 7)
 * - Touch 3 (FU 3): 21 days after outreach (Day 21 - Breakup touch)
 */
export function computeFollowupStatus(
  outreachSentAt: string | null | undefined,
  creatorRespondedAt: string | null | undefined,
  followupSentAt: string | null | undefined,
  followupDraft?: string | null | undefined,
  followupCommentary?: string | null | undefined
): FollowupStatusInfo {
  let respondedAt = creatorRespondedAt || null;

  // Check commentary for creator responded markers, taking the last marker
  if (followupCommentary?.includes("=== CREATOR_RESPONDED:")) {
    const matches = [...followupCommentary.matchAll(/=== CREATOR_RESPONDED:\s*([^\n=]+)\s*===/g)];
    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1][1]?.trim();
      if (lastMatch === "false") {
        respondedAt = null;
      } else if (lastMatch) {
        respondedAt = lastMatch;
      }
    }
  }

  // Parse sent touches from commentary or fallback followupSentAt
  const fu1SentMatch = followupCommentary?.match(/=== FU1_SENT:\s*([^\n=]+)\s*===/);
  const fu2SentMatch = followupCommentary?.match(/=== FU2_SENT:\s*([^\n=]+)\s*===/);
  const fu3SentMatch = followupCommentary?.match(/=== FU3_SENT:\s*([^\n=]+)\s*===/);

  const fu1Sent = !!fu1SentMatch || (!!followupSentAt && !fu2SentMatch && !fu3SentMatch);
  const fu1SentAt = fu1SentMatch ? fu1SentMatch[1].trim() : followupSentAt || null;
  const fu2Sent = !!fu2SentMatch;
  const fu2SentAt = fu2SentMatch ? fu2SentMatch[1].trim() : null;
  const fu3Sent = !!fu3SentMatch;
  const fu3SentAt = fu3SentMatch ? fu3SentMatch[1].trim() : null;

  const isCompleted = fu3Sent;

  if (!outreachSentAt) {
    return {
      stage: 0,
      isResponded: false,
      respondedAt: null,
      nextFollowupDueAt: null,
      isDue: false,
      timeRemainingText: "Draft Only",
      badgeLabel: "Draft Only",
      badgeVariant: "scheduled",
      milestones: [],
      isCompleted: false,
    };
  }

  const sentTime = new Date(outreachSentAt).getTime();
  const now = Date.now();

  const day3Ms = sentTime + 3 * 24 * 60 * 60 * 1000;
  const day7Ms = sentTime + 7 * 24 * 60 * 60 * 1000;
  const day21Ms = sentTime + 21 * 24 * 60 * 60 * 1000;

  const milestones: FollowupMilestone[] = [
    {
      stage: 0,
      title: "Initial Pitch",
      dayOffset: 0,
      dueAt: outreachSentAt,
      isSent: true,
      isDue: false,
      isUpcoming: false,
      sentAt: outreachSentAt,
    },
    {
      stage: 1,
      title: "Touch 1 (Slots)",
      dayOffset: 3,
      dueAt: new Date(day3Ms).toISOString(),
      isSent: fu1Sent,
      isDue: !fu1Sent && now >= day3Ms,
      isUpcoming: !fu1Sent && now < day3Ms,
      sentAt: fu1SentAt,
    },
    {
      stage: 2,
      title: "Touch 2 (Valuation)",
      dayOffset: 7,
      dueAt: new Date(day7Ms).toISOString(),
      isSent: fu2Sent,
      isDue: fu1Sent && !fu2Sent && now >= day7Ms,
      isUpcoming: !fu2Sent && (now < day7Ms || !fu1Sent),
      sentAt: fu2SentAt,
    },
    {
      stage: 3,
      title: "Touch 3 (Breakup)",
      dayOffset: 21,
      dueAt: new Date(day21Ms).toISOString(),
      isSent: fu3Sent,
      isDue: fu2Sent && !fu3Sent && now >= day21Ms,
      isUpcoming: !fu3Sent && (now < day21Ms || !fu2Sent),
      sentAt: fu3SentAt,
    },
  ];

  if (respondedAt) {
    return {
      stage: 0,
      isResponded: true,
      respondedAt,
      nextFollowupDueAt: null,
      isDue: false,
      timeRemainingText: "Responded",
      badgeLabel: "Creator Responded",
      badgeVariant: "responded",
      milestones,
      isCompleted: true,
    };
  }

  if (isCompleted) {
    return {
      stage: 3,
      isResponded: false,
      respondedAt: null,
      nextFollowupDueAt: null,
      isDue: false,
      timeRemainingText: "Sequence Done",
      badgeLabel: "Sequence Completed",
      badgeVariant: "completed",
      milestones,
      isCompleted: true,
    };
  }

  // Determine active stage
  let activeStage = 1;
  let targetMs = day3Ms;
  let stageName = "Follow-up 1 (Day 3)";

  if (fu2Sent) {
    activeStage = 3;
    targetMs = day21Ms;
    stageName = "Follow-up 3 (Day 21)";
  } else if (fu1Sent) {
    activeStage = 2;
    targetMs = day7Ms;
    stageName = "Follow-up 2 (Day 7)";
  }

  const diffMs = targetMs - now;

  if (diffMs > 0) {
    const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const text = days > 0 ? `${days}d ${hours}h` : `${hours}h`;

    return {
      stage: activeStage,
      isResponded: false,
      respondedAt: null,
      nextFollowupDueAt: new Date(targetMs).toISOString(),
      isDue: false,
      timeRemainingText: `in ${text}`,
      badgeLabel: `${stageName} in ${text}`,
      badgeVariant: "scheduled",
      milestones,
      isCompleted: false,
    };
  } else {
    // Due now or overdue
    return {
      stage: activeStage,
      isResponded: false,
      respondedAt: null,
      nextFollowupDueAt: new Date(targetMs).toISOString(),
      isDue: true,
      timeRemainingText: "Due Now",
      badgeLabel: followupDraft ? `${stageName} Ready` : `${stageName} Due Now`,
      badgeVariant: "due",
      milestones,
      isCompleted: false,
    };
  }
}

/**
 * Generates structured follow-up email copy tailored to stage in Safwan's authentic broker voice.
 */
export function generateFollowupDraft(
  stage: number,
  creatorName: string = "there",
  videoTitle: string = "your recent tutorial",
  originalSubject: string = ""
): { subject: string; body: string } {
  const cleanName = creatorName.replace(/^@/, "").trim() || "there";
  const cleanVideo = videoTitle.trim() || "your recent tutorial";
  const subject = originalSubject
    ? originalSubject.toLowerCase().startsWith("re:")
      ? originalSubject
      : `Re: ${originalSubject}`
    : `Re: ${cleanVideo}`;

  if (stage === 1) {
    // Follow-up 1 (Day 3): Quick broker touch, asking about open integration slots (~35 words)
    return {
      subject,
      body: `Hey ${cleanName},\n\nFollowing up on my note about your "${cleanVideo}" video.\n\nWe work as a sponsorship brokerage for tech creators, pitching your channel directly to relevant software brands and negotiating flat rates so you don't deal with the admin.\n\nCurious if you have any open integration slots in your upcoming recording schedule?\n\nBest,\nSafwan | Fylint`,
    };
  } else if (stage === 2) {
    // Follow-up 2 (Day 7): Commercial valuation angle (~35 words)
    return {
      subject,
      body: `Hey ${cleanName},\n\nWanted to circle back on this. Given the retention and viewer trust on your channel, your tutorials command premium flat rates in the current software sponsor market.\n\nCurious to see where we'd benchmark your integration pricing?\n\nBest,\nSafwan | Fylint`,
    };
  } else {
    // Follow-up 3 (Day 21): Respectful breakup touch (~30 words)
    return {
      subject,
      body: `Hey ${cleanName},\n\nAssuming you're all set on brand partnerships for now, so I won't crowd your inbox.\n\nIf you ever want an agency to source and negotiate software sponsorships for your channel down the road, feel free to reach out anytime.\n\nBest,\nSafwan | Fylint`,
    };
  }
}
