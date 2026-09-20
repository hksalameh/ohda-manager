"use client";

import { useMemo, useState } from "react";
import { createHistoricalDocument } from "./actions";

type ItemOption = {
  id: string;
  itemCode: string | null;
  name: string;
  remainingOpening: number;
};

type Line = { key: number; itemId: string; quantity: string; linkedQuantity: string; price: string; notes: string };

export function HistoricalDocumentForm({
  type,
  items,
}: {
  type: "HISTORICAL_RECEIPT" | "HISTORICAL_ISSUE";
  items: ItemOption[];
}) {
  const isReceipt = type === "HISTORICAL_RECEIPT";
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([{ key: 1, itemId: "", quantity: "1", linkedQuantity: "0", price: "", notes: "" }]);
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function addLine() {
    setLines((current) => [...current, { key: nextKey, itemId: "", quantity: "1", linkedQuantity: "0", price: "", notes: "" }]);
    setNextKey((value) => value + 1);
  }

  function updateLine(key: number, field: keyof Omit<Line, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  return (
    <form action={createHistoricalDocument} className="space-y-6">
      <input type="hidden" name="documentType" value={type} />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">رقم السند القديم<input name="documentNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">تاريخ السند<input name="documentDate" type="date" max="2025-12-31" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700">{isReceipt ? "المورد / مصدر المواد" : "الجهة المصروف لها"}<input name="partyName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2 lg:col-span-3">البيان<input name="statement" defaultValue={isReceipt ? "سند إدخال تاريخي من الدفتر" : "سند إخراج تاريخي من الدفتر"} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div><h3 className="font-bold">مواد السند القديم</h3><p className="mt-1 text-xs text-slate-500">يسمح السند بأكثر من مادة كما هو موجود في النماذج الورقية.</p></div>
          <button type="button" onClick={addLine} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">+ مادة</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[950px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="w-12 px-3 py-3">#</th><th className="min-w-80 px-3 py-3 text-right">المادة</th><th className="w-28 px-3 py-3">كمية السند</th>{isReceipt ? <><th className="w-44 px-3 py-3">من رصيد البداية</th><th className="w-36 px-3 py-3">سعر الوحدة</th></> : null}<th className="min-w-52 px-3 py-3 text-right">ملاحظات</th><th className="w-20"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => {
                const item = itemMap.get(line.itemId);
                return <tr key={line.key} className="align-top">
                  <td className="px-3 py-3 text-center font-bold">{index + 1}</td>
                  <td className="px-3 py-3"><select name="itemId" required value={line.itemId} onChange={(e) => updateLine(line.key, "itemId", e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">اختر المادة</option>{items.map((option) => <option key={option.id} value={option.id}>{option.itemCode ? `${option.itemCode} — ` : ""}{option.name}</option>)}</select>{isReceipt && item ? <span className="mt-1 block text-xs text-slate-500">غير موثق من رصيد البداية: {item.remainingOpening}</span> : null}</td>
                  <td className="px-3 py-3"><input name="quantity" type="number" min={1} required value={line.quantity} onChange={(e) => updateLine(line.key, "quantity", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center" /></td>
                  {isReceipt ? <>
                    <td className="px-3 py-3"><input name="linkedQuantity" type="number" min={0} max={item?.remainingOpening ?? 0} value={line.linkedQuantity} onChange={(e) => updateLine(line.key, "linkedQuantity", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center" /><span className="mt-1 block text-[11px] text-slate-500">لا يغيّر الرصيد الحالي</span></td>
                    <td className="px-3 py-3"><input name="unitPriceJod" inputMode="decimal" placeholder="0.000" value={line.price} onChange={(e) => updateLine(line.key, "price", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center" /></td>
                  </> : <><input type="hidden" name="linkedQuantity" value="0" /><input type="hidden" name="unitPriceJod" value="" /></>}
                  <td className="px-3 py-3"><input name="lineNotes" value={line.notes} onChange={(e) => updateLine(line.key, "notes", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></td>
                  <td className="px-3 py-3 text-center"><button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))} className="rounded-lg border border-red-200 px-2 py-2 text-xs font-bold text-red-700 disabled:opacity-40">حذف</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-slate-700">ملاحظات عامة<textarea name="notes" rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-950">هذا المستند مرجعي تاريخي فقط؛ لا يضيف ولا يخصم من الرصيد الحالي. في سند الإدخال تستطيع تحديد مقدار الكمية الحالية التي يرجع مصدرها لهذا السند.</div>
        <button className="mt-4 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white">حفظ المستند التاريخي</button>
      </section>
    </form>
  );
}
