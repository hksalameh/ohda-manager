"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QrScanner } from "@/components/qr-scanner";
import { parseQr } from "@/lib/qr-codes";

export function RoomScan({ locations }: { locations: Array<{ id: string; name: string; code: string | null }> }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  function handle(raw: string) {
    const parsed = parseQr(raw);
    const location =
      parsed.kind === "location"
        ? locations.find((entry) => entry.id === parsed.id)
        : parsed.kind === "text"
          ? locations.find((entry) => entry.code && entry.code.toLowerCase() === parsed.value.toLowerCase())
          : undefined;

    if (!location) {
      setError(parsed.kind === "item" ? "هذا ملصق مادة. امسح ملصق الغرفة أولاً." : "الرمز لا يطابق أي غرفة في المركز الحالي.");
      return;
    }
    setError(null);
    router.push(`/stocktake?locationId=${encodeURIComponent(location.id)}`);
  }

  return (
    <div className="space-y-2">
      <QrScanner label="مسح ملصق الغرفة" onResult={handle} className="w-full rounded-lg border border-blue-300 bg-blue-50 px-5 py-3 text-sm font-bold text-blue-800 hover:bg-blue-100" />
      {error ? <p className="rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">{error}</p> : null}
    </div>
  );
}
