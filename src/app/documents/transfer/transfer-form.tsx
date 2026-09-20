"use client";

import { useMemo, useState } from "react";
import { createTransferDraft } from "./actions";

type ItemOption = { id: string; itemCode: string | null; name: string };
type LocationOption = { id: string; name: string };
type Availability = Record<string, Record<string, number>>;
type Line = { key: number; itemId: string; quantity: string; notes: string };

export function TransferForm({ items, locations, availability }: { items: ItemOption[]; locations: LocationOption[]; availability: Availability }) {
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: "", quantity: "1", notes: "" }]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const availableItems = useMemo(() => items.filter((item) => (availability[fromLocationId]?.[item.id] ?? 0) > 0), [availability, fromLocationId, items]);

  function updateLine(key: number, field: keyof Omit<Line, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  return (
    <form action={createTransferDraft} className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">من الموقع
            <select name="fromLocationId" required value={fromLocationId} onChange={(event) => { setFromLocationId(event.target.value); setLines([{ key: nextKey, itemId: "", quantity: "1", notes: "" }]); setNextKey((value) => value + 1); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">اختر المصدر</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">إلى الموقع
            <select name="toLocationId" required value={toLocationId} onChange={(event) => setToLocationId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="">اختر الوجهة</option>
              {locations.filter((location) => location.id !== fromLocationId).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">رقم المستند
            <input name="documentNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">البيان
            <input name="statement" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div><h3 className="font-bold text-slate-900">المواد المنقولة</h3><p className="mt-1 text-xs text-slate-500">تظهر فقط المواد المتوفرة فعلياً في الموقع المصدر.</p></div>
          <button type="button" disabled={!fromLocationId} onClick={() => { setLines((current) => [...current, { key: nextKey, itemId: "", quantity: "1", notes: "" }]); setNextKey((value) => value + 1); }} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">+ مادة</button>
        </div>
        {!fromLocationId ? <p className="p-5 text-sm text-slate-500">اختر الموقع المصدر أولاً.</p> : availableItems.length === 0 ? <p className="p-5 text-sm text-amber-800">لا توجد مواد برصيد موجب في هذا الموقع.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="w-12 px-3 py-3">#</th><th className="min-w-80 px-3 py-3 text-right">المادة</th><th className="w-32 px-3 py-3">المتوفر</th><th className="w-32 px-3 py-3">الكمية</th><th className="min-w-52 px-3 py-3 text-right">ملاحظات</th><th className="w-20"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((line, index) => {
                  const selected = itemMap.get(line.itemId);
                  const available = line.itemId ? (availability[fromLocationId]?.[line.itemId] ?? 0) : 0;
                  return <tr key={line.key} className="align-top">
                    <td className="px-3 py-3 text-center font-bold">{index + 1}</td>
                    <td className="px-3 py-3"><select name="itemId" required value={line.itemId} onChange={(event) => updateLine(line.key, "itemId", event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">اختر المادة</option>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.itemCode ? `${item.itemCode} — ` : ""}{item.name}</option>)}</select></td>
                    <td className="px-3 py-3 text-center font-bold text-emerald-800">{selected ? available : "—"}</td>
                    <td className="px-3 py-3"><input name="quantity" type="number" min={1} max={available || undefined} required value={line.quantity} onChange={(event) => updateLine(line.key, "quantity", event.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center" /></td>
                    <td className="px-3 py-3"><input name="lineNotes" value={line.notes} onChange={(event) => updateLine(line.key, "notes", event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></td>
                    <td className="px-3 py-3 text-center"><button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))} className="rounded-lg border border-red-200 px-2 py-2 text-xs font-bold text-red-700 disabled:opacity-40">حذف</button></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-slate-700">ملاحظات عامة<textarea name="notes" rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <button disabled={!fromLocationId || !toLocationId || fromLocationId === toLocationId} className="mt-4 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">حفظ مسودة النقل</button>
      </section>
    </form>
  );
}
