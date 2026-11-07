/** Tiny, failure-tolerant localStorage wrapper for per-device conveniences only. */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(`bh.${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`bh.${key}`);
    else localStorage.setItem(`bh.${key}`, value);
  } catch {
    /* storage blocked: the preference simply won't persist */
  }
}
