import type { BankId, Line } from "./types.js";

export interface BankProfile {
  id: BankId;
  label: string;
  /** Matched against the first lines of page 1 (letterhead), then the whole statement. */
  detect: RegExp;
  /** Where wrapped description lines sit relative to the dated line. */
  descriptionPosition: "below" | "above";
  /** Dates printed as ddmmyy without separators. */
  compactDate: boolean;
}

export const BANK_PROFILES: BankProfile[] = [
  { id: "MAYBANK", label: "Maybank", detect: /maybank|malayan banking/i, descriptionPosition: "below", compactDate: false },
  { id: "CIMB", label: "CIMB", detect: /\bcimb\b/i, descriptionPosition: "below", compactDate: false },
  { id: "PUBLIC_BANK", label: "Public Bank", detect: /public\s*bank|public islamic|\bpbe\b/i, descriptionPosition: "below", compactDate: false },
  { id: "RHB", label: "RHB", detect: /\brhb\b/i, descriptionPosition: "below", compactDate: false },
  { id: "HONG_LEONG", label: "Hong Leong", detect: /hong\s*leong|\bhlb\b/i, descriptionPosition: "below", compactDate: false },
  { id: "AMBANK", label: "AmBank", detect: /\bambank\b|ambank\s*islamic|ambank\s*\(m\)/i, descriptionPosition: "below", compactDate: false },
  { id: "BANK_ISLAM", label: "Bank Islam", detect: /bank\s*islam/i, descriptionPosition: "below", compactDate: false },
  { id: "BANK_MUAMALAT", label: "Bank Muamalat", detect: /muamalat/i, descriptionPosition: "below", compactDate: false },
  { id: "BANK_RAKYAT", label: "Bank Rakyat", detect: /bank\s*kerjasama\s*rakyat|bank\s*rakyat\b(?!\s*indonesia)/i, descriptionPosition: "below", compactDate: false },
  { id: "BSN", label: "BSN", detect: /bank\s*simpanan\s*nasional|\bmybsn\b|\bbsn\b/i, descriptionPosition: "above", compactDate: false },
  { id: "ALLIANCE", label: "Alliance Bank", detect: /alliance\s*(bank|islamic)/i, descriptionPosition: "below", compactDate: true },
  { id: "AFFIN", label: "AFFIN Bank", detect: /\baffin\b/i, descriptionPosition: "below", compactDate: false },
];

export const UNKNOWN_PROFILE: BankProfile = {
  id: "UNKNOWN",
  label: "Bank tidak dikenali",
  detect: /$^/,
  descriptionPosition: "below",
  compactDate: false,
};

/** Statements from banks outside Malaysia that share a name (e.g. Bank Rakyat Indonesia). */
const FOREIGN = /bank\s*rakyat\s*indonesia|\bBRI\b.*\bIDR\b|saldo\s*awal/i;

export function detectBank(lines: Line[]): { profile: BankProfile; foreign: boolean } {
  const all = lines.map((l) => l.text).join("\n");
  if (FOREIGN.test(all)) return { profile: UNKNOWN_PROFILE, foreign: true };
  const head = lines.filter((l) => l.page === 1).slice(0, 30).map((l) => l.text).join("\n");
  const score = (text: string) =>
    BANK_PROFILES.map((p) => ({ p, n: (text.match(new RegExp(p.detect.source, "gi")) ?? []).length })).sort((a, b) => b.n - a.n);
  for (const text of [head, all]) {
    const [best, second] = score(text);
    if (best && best.n > 0 && (!second || best.n > second.n)) return { profile: best.p, foreign: false };
  }
  return { profile: UNKNOWN_PROFILE, foreign: false };
}
