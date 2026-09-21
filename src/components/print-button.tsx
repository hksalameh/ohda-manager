"use client";

export function PrintButton({ label = "طباعة" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"
    >
      {label}
    </button>
  );
}
