"use client";

import { useEffect } from "react";
import { deleteOfflineDraft } from "@/lib/offline-drafts";

export default function OfflineDraftCleaner({ draftKey }: { draftKey: string }) {
  useEffect(() => {
    deleteOfflineDraft(draftKey).catch(() => undefined);
  }, [draftKey]);

  return null;
}
