"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white"
    >
      طباعة
    </button>
  );
}
