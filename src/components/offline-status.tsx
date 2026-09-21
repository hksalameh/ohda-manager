"use client";

import { useEffect, useState } from "react";

export default function OfflineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <div className="no-print fixed bottom-3 left-3 z-50">
      <div className={`rounded-full border px-3 py-1.5 text-xs font-bold shadow-sm ${online ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-100 text-amber-950"}`}>
        {online ? "● متصل" : "● غير متصل — العمل محفوظ محلياً"}
      </div>
    </div>
  );
}
