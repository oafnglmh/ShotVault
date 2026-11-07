import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  clearDraft,
  exportConfigJson,
  loadAdminWorkingCopy,
  loadPublishedConfig,
  saveDraft,
} from "@/core/config/configRepository";
import { parseVenueConfig } from "@/core/config/venueSchema";
import type { VenueConfig } from "@/core/domain/types";

/**
 * Admin works on a DRAFT stored in this browser's IndexedDB. Publishing = exporting
 * venue.json and deploying it with the static site. There is no server to push to.
 */
interface AdminDraftState {
  draft: VenueConfig | null;
  published: VenueConfig | null;
  publishedError: string | null;
  saving: boolean;
  saveError: string | null;
  dirtyVsPublished: boolean;
  update(fn: (d: VenueConfig) => VenueConfig): void;
  replace(next: VenueConfig): Promise<void>;
  discardDraft(): Promise<void>;
  exportJson(): string;
  importJson(text: string): Promise<void>;
}

const Ctx = createContext<AdminDraftState | null>(null);

const normalize = (c: VenueConfig) => JSON.stringify({ ...c, updatedAt: 0 });

export function AdminDraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<VenueConfig | null>(null);
  const [published, setPublished] = useState<VenueConfig | null>(null);
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    void loadAdminWorkingCopy().then(setDraft);
    loadPublishedConfig()
      .then(setPublished)
      .catch((e) => setPublishedError(e instanceof Error ? e.message : String(e)));
  }, []);

  const persist = useCallback((next: VenueConfig) => {
    clearTimeout(timer.current);
    setSaving(true);
    timer.current = setTimeout(() => {
      saveDraft(next)
        .then(() => setSaveError(null))
        .catch((e) => setSaveError(e instanceof Error ? e.message : String(e)))
        .finally(() => setSaving(false));
    }, 350);
  }, []);

  const update = useCallback(
    (fn: (d: VenueConfig) => VenueConfig) => {
      setDraft((d) => {
        if (!d) return d;
        const next = fn(structuredClone(d));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const replace = useCallback(
    async (next: VenueConfig) => {
      const parsed = parseVenueConfig(next);
      setDraft(parsed);
      persist(parsed);
    },
    [persist],
  );

  const discardDraft = useCallback(async () => {
    clearTimeout(timer.current);
    await clearDraft();
    setDraft(await loadAdminWorkingCopy());
  }, []);

  const importJson = useCallback(
    async (text: string) => {
      await replace(parseVenueConfig(JSON.parse(text)));
    },
    [replace],
  );

  const value: AdminDraftState = {
    draft,
    published,
    publishedError,
    saving,
    saveError,
    dirtyVsPublished: !!draft && (!published || normalize(draft) !== normalize(published)),
    update,
    replace,
    discardDraft,
    exportJson: () => (draft ? exportConfigJson(draft) : "{}"),
    importJson,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdminDraft(): AdminDraftState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdminDraft outside provider");
  return v;
}
