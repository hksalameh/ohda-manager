"use client";

import { useMemo, useState } from "react";
import { createStockDocument } from "../actions";

type ItemOption = {
  id: string;
  itemCode: string | null;
  name: string;
  unitName: string | null;
};

type LocationOption = { id: string; name: string };

type Line = { key: number; itemId: string; quantity: string; unitPriceJod: string; notes: string };

export function StockDocumentForm({
  documentType,
  items,
  locations,
  today,
}: {
  documentType: "RECEIPT" | "ISSUE";
  items: ItemOption[];
  locations: LocationOption[];
  today: string;
}) {
  const isReceipt = documentType === "RECEIPT";
  const [nextKey, setNextKey] = useState(2);
  const [lines, setLines] = useState<Line[]>([
    { key: 1, itemId: "", quantity: "1", unitPriceJod: "", notes: "" },
  ]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function addLine() {
    setLines((current) => [...current, { key: nextKey, itemId: "", quantity: "1", unitPriceJod: "", notes: "" }]);
    setNextKey((value) => value + 1);
  }

  function removeLine(key: number) {
    setLines((current) => current.length === 1 ? current : current.filter((line) => line.key !== key));
  }

  function updateLine(key: number, field: keyof Omit<Line, "key">, value: string) {
    setLines((current) => current.map((line) => line.key === key ? { ...line, [field]: value } : line));
  }

  return (
    <form action={createStockDocument} className="space-y-6">
      <input type="hidden" name="documentType" value={documentType} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">بيانات {isReceipt ? "مستند الإدخال" : "مستند الإخراج"}</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">رقم المستند
            <input name="documentNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="يمكن تركه فارغاً مؤقتاً" />
          </label>
          <label className="text-sm font-medium text-slate-700">تاريخ المستند
            <input name="documentDate" type="date" defaultValue={today} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">{isReceipt ? "موقع الاستلام" : "موقع الإخراج"}
            <select name="locationId" required defaultValue="" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
              <option value="" disabled>اختر الموقع</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          {isReceipt ? (
            <label className="text-sm font-medium text-slate-700">المورد / الجهة التي وردت منها
              <input name="supplierName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          ) : (
            <label className="text-sm font-medium text-slate-700">الجهة / الشخص المصروف له
              <input name="recipientName" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          )}
          <label className="text-sm font-medium text-slate-700 md:col-span-2">البيان
            <input name="statement" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder={isReceipt ? "مثال: توريد لوازم حسب الفاتورة" : "مثال: صرف لوازم للقسم"} />
          </label>
        </div>

        {isReceipt ? (
          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-medium text-slate-700">رقم الفاتورة
              <input name="invoiceNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">تاريخ الفاتورة
              <input name="invoiceDate" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">تاريخ لجنة الاستلام
              <input name="receivingCommitteeDate" type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">مرجع التقرير
              <input name="reportReference" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">رقم أمر الشراء
              <input name="purchaseOrderNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="font-bold text-slate-900">المواد</h3>
            <p className="mt-1 text-xs text-slate-500">يمكن أن يحتوي المستند على أي عدد من المواد.</p>
          </div>
          <button type="button" onClick={addLine} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800">
            + إضافة مادة
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="w-12 px-3 py-3 text-center">#</th>
                <th className="min-w-80 px-3 py-3 text-right">المادة</th>
                <th className="w-32 px-3 py-3 text-center">الكمية</th>
                {isReceipt ? <th className="w-40 px-3 py-3 text-center">سعر الوحدة (د.أ)</th> : null}
                <th className="min-w-52 px-3 py-3 text-right">ملاحظات</th>
                <th className="w-20 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, index) => {
                const selected = itemMap.get(line.itemId);
                return (
                  <tr key={line.key} className="align-top">
                    <td className="px-3 py-3 text-center font-bold">{index + 1}</td>
                    <td className="px-3 py-3">
                      <select
                        name="itemId"
                        required
                        value={line.itemId}
                        onChange={(event) => updateLine(line.key, "itemId", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">اختر المادة</option>
                        {items.map((item) => (
                          <option key={item.id} value={item.id}>{item.itemCode ? `${item.itemCode} — ` : ""}{item.name}</option>
                        ))}
                      </select>
                      {selected ? <div className="mt-1 text-xs text-slate-500">الوحدة: {selected.unitName ?? "غير محددة"}</div> : null}
                    </td>
                    <td className="px-3 py-3">
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, "quantity", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center"
                      />
                    </td>
                    {isReceipt ? (
                      <td className="px-3 py-3">
                        <input
                          name="unitPriceJod"
                          inputMode="decimal"
                          value={line.unitPriceJod}
                          onChange={(event) => updateLine(line.key, "unitPriceJod", event.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center"
                          placeholder="0.000"
                        />
                      </td>
                    ) : <input type="hidden" name="unitPriceJod" value="" />}
                    <td className="px-3 py-3">
                      <input
                        name="lineNotes"
                        value={line.notes}
                        onChange={(event) => updateLine(line.key, "notes", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button type="button" onClick={() => removeLine(line.key)} disabled={lines.length === 1} className="rounded-lg border border-red-200 px-2.5 py-2 text-xs font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-40">
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-sm font-medium text-slate-700">ملاحظات عامة
          <textarea name="notes" rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button className="rounded-lg bg-emerald-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
            حفظ كمسودة للمراجعة
          </button>
          <a href="/documents" className="rounded-lg border border-slate-300 px-6 py-2.5 text-center text-sm font-medium hover:bg-slate-50">إلغاء</a>
        </div>
      </section>
    </form>
  );
}
