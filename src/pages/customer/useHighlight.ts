import { useEffect, useState } from "react";
import type { Highlight } from "@/core/domain/types";
import { getHighlight } from "@/features/highlights/highlightRepository";

export function useHighlight(id: string | undefined, tableId: string) {
  const [highlight, setHighlight] = useState<Highlight | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    setHighlight(undefined);
    void getHighlight(id ?? "").then((h) => {
      if (!alive) return;
      // A highlight belongs to the table it was cut from; never show it under another table.
      const ok = h && h.tableId === tableId ? h : null;
      setHighlight(ok);
      if (ok) {
        objectUrl = URL.createObjectURL(ok.blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, tableId]);

  return { highlight, url };
}
