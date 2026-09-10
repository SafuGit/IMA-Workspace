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
