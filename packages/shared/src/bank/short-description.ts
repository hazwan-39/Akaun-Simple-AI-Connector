/**
 * Short description for the Deposits / Payments "Butiran" column.
 *
 * The template's Butiran column is about 43 characters wide without wrap text, while bank descriptions
 * often run to 60–90 characters (transaction type, counterparty, reference numbers, card numbers).
 * The full text stays in Buku Bank; this keeps what a bookkeeper reads (type + counterparty) and drops
 * reference-like tokens. Users can edit the result in Buku Bank before transferring.
 */
export const SHORT_DESCRIPTION_MAX = 43;

/** Reference numbers, card numbers, dates, trace codes: anything carrying 4+ digits or a long digit-bearing code. */
const isReferenceLike = (tok: string) => {
  const digits = (tok.match(/\d/g) ?? []).length;
  if (digits >= 4) return true;
  if (tok.length >= 10 && digits > 0) return true;
  return /^X{4,}/i.test(tok);
};

const NOISE = /^(reference|number:?|ref:?|no:?|[-*/:,.|]+)$/i;

export function shortDescription(full: string, max = SHORT_DESCRIPTION_MAX): string {
  const words = full
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.replace(/^[,;]+|[,;]+$/g, ""))
    .filter((w) => w && !isReferenceLike(w) && !NOISE.test(w));
  // Drop immediate repeats ("DUITNOW DUITNOW", "TRANSFER TRANSFER").
  const deduped = words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1]!.toLowerCase());
  let out = "";
  for (const w of deduped) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > max) break;
    out = next;
  }
  if (!out) out = (deduped[0] ?? full.trim()).slice(0, max);
  return out.replace(/[\s\-/,:*]+$/, "");
}
