/**
 * Pilot access key storage. Kept in the add-in's own (partitioned) browser
 * storage – never written into the workbook.
 */
const KEY = "akaunsimple.ai.accessKey";

export function loadAccessKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveAccessKey(value: string): void {
  try {
    localStorage.setItem(KEY, value.trim());
  } catch {
    /* storage unavailable – key lives for this session only */
  }
}

export function clearAccessKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const isPlausibleAccessKey = (v: string) => /^[A-Za-z0-9_\-.]{20,200}$/.test(v.trim());
