"use client";
import { useEffect } from "react";
export default function ClearAuditDraft({ roomId }: { roomId: string }) {
  useEffect(() => {
    try { window.localStorage.removeItem(`room-audit:${roomId}`); } catch { /* private browsing */ }
  }, [roomId]);
  return null;
}
