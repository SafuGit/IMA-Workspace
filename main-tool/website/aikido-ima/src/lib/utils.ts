import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCompactNumber(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, "").trim());
  if (isNaN(num)) return "—";
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1) + "B";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return Math.round(num).toLocaleString();
}

export function formatPercent(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === "") return "—";
  const parsed = typeof val === "number" ? val : parseFloat(String(val).replace(/%/g, "").trim());
  if (isNaN(parsed)) return "—";
  // If value is a decimal like 0.0452, convert to 4.52%
  const num = parsed > 1 ? parsed : parsed * 100;
  return Number(num).toFixed(2) + "%";
}

export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return String(dateString);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateString);
  }
}
