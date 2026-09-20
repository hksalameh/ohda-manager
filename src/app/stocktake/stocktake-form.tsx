"use client";

import { useMemo, useState } from "react";
import { createStocktakeAdjustments } from "./actions";

type ItemOption = {
  id: string;
  itemCode: string | null;
  name: string;
  unitName: string | null;
  systemQuantity: number;
};

type ExtraLine = {
  key: number;
  itemId: string;
  actualQuantity: string;
};

export function StocktakeForm({
  locationId,
  expectedItems,
  allItems,
  today,
}: {
  locationId: string;
  expectedItems: ItemOption[];
  allItems: Omit<ItemOption, "systemQuantity">[];
  today: string;
}) {
  const [nextKey, setNextKey] = useState(2);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const expectedIds = useMemo(() => new Set(expectedItems.map((item) => item.id)), [expectedItems]);
  const selectedExtraIds = useMemo(() => new Set(extras.map((line) => line.itemId).filter(Boolean)), [extras]);

  return (
    <form action={createStocktakeAdjustments} className="space-y-6">
      <input type="hidden" name="locationId" value={locationId} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            تاريخ الجرد
            <input name="countDate" type="date" defaultValue={today} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            رقم / مرجع الجرد
            <input name="referenceNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="اختياري - يولده النظام تلقائياً" />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-1">
            ملاحظات عامة
            <input name="notes" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="مثال: جرد سنوي / لجنة الجرد" />
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">المواد المسجلة حالياً في الموقع</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            اكتب الكمية التي وجدتها فعلياً. اترك الحقل فارغاً إذا لم يتم عد المادة بعد. الرقم صفر يعني أنك تأكدت أن المادة غير موجودة فعلياً.
          </p>
        </div>

        {expectedItems.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لا توجد مواد مسجلة حالياً في هذا الموقع. يمكنك إضافة مواد وجدت فعلياً من القسم التالي.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-right">رقم المادة</th>
                  <th className="min-w-80 px-4 py-3 text-right">المادة</th>
                  <th className="px-4 py-3 text-center">الوحدة</th>
                  <th className="px-4 py-3 text-center">رصيد النظام</th>
                  <th className="px-4 py-3 text-center">الفعلي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expectedItems.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono text-xs">{item.itemCode ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-center">{item.unitName ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-bold">{item.systemQuantity}</td>
                    <td className="px-4 py-3 text-center">
                      <input type="hidden" name="itemId" value={item.id} />
                      <input name="actualQuantity" type="number" min={0} step={1} className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-center" placeholder="—" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">مواد موجودة فعلياً وغير مسجلة في هذا الموقع</h3>
            <p className="mt-1 text-xs leading-6 text-slate-500">استخدم هذا فقط عندما تجد مادة في الموقع ورصيد النظام لها هنا صفر.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setExtras((current) => [...current, { key: nextKey, itemId: "", actualQuantity: "1" }]);
              setNextKey((value) => value + 1);
            }}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800"
          >
            + إضافة مادة
          </button>
        </div>

        {extras.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لا توجد مواد إضافية مسجلة في نموذج الجرد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-16 px-3 py-3 text-center">#</th>
                  <th className="min-w-96 px-3 py-3 text-right">المادة</th>
                  <th className="w-36 px-3 py-3 text-center">الكمية الفعلية</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {extras.map((line, index) => (
                  <tr key={line.key}>
                    <td className="px-3 py-3 text-center font-bold">{index + 1}</td>
                    <td className="px-3 py-3">
                      <select
                        name="itemId"
                        required
                        value={line.itemId}
                        onChange={(event) => setExtras((current) => current.map((entry) => entry.key === line.key ? { ...entry, itemId: event.target.value } : entry))}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                      >
                        <option value="">اختر المادة</option>
                        {allItems
                          .filter((item) => !expectedIds.has(item.id))
                          .filter((item) => !selectedExtraIds.has(item.id) || item.id === line.itemId)
                          .map((item) => (
                            <option key={item.id} value={item.id}>{item.itemCode ? `${item.itemCode} — ` : ""}{item.name}</option>
                          ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        name="actualQuantity"
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={line.actualQuantity}
                        onChange={(event) => setExtras((current) => current.map((entry) => entry.key === line.key ? { ...entry, actualQuantity: event.target.value } : entry))}
                        className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-center"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button type="button" onClick={() => setExtras((current) => current.filter((entry) => entry.key !== line.key))} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50">حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
        قبل إنشاء التسوية، يقارن النظام الكمية الفعلية مع الرصيد الحالي. المواد المتطابقة لا تنشئ أي حركة. الزيادة والنقص ينشآن مسودات تسوية منفصلة للمراجعة قبل الاعتماد.
      </section>

      <button className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800">مقارنة الجرد وإنشاء مسودة التسوية</button>
    </form>
  );
}
