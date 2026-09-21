import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.trim() : "";
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = value(params.q);
  const center = await getCurrentCenter();
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;
  }

  const [items, balances] = await Promise.all([
    prisma.item.findMany({
      where: {
        active: true,
        ...(q ? {
          OR: [
            { itemCode: { contains: q } },
            { name: { contains: q } },
            { legacyLedgerPageNo: { contains: q } },
          ],
        } : {}),
      },
      orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      include: {
        unit: true,
        openingLines: {
          where: { snapshot: { centerId: center.id } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    getCenterInventoryBalances(center.id),
  ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">المواد</h2>
          <p className="mt-2 text-sm text-slate-500">الرصيد الحالي محسوب من جميع حركات الإدخال والإخراج والنقل والعهدة، مع الاحتفاظ بأرقام الجرد القديم للمقارنة.</p>
        </div>
        <Link href="/items/new" className="rounded-lg bg-blue-700 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-blue-800">+ مادة جديدة</Link>
      </div>

      <form className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
        <input name="q" defaultValue={q} placeholder="ابحث باسم المادة أو رقمها أو صفحة الدفتر" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5" />
        <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white">بحث</button>
        {q ? <Link href="/items" className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium hover:bg-slate-50">مسح البحث</Link> : null}
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">عدد المواد الظاهرة: <strong className="text-slate-900">{items.length}</strong></div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">رقم المادة</th>
                <th className="min-w-80 px-4 py-3 text-right font-semibold">المادة</th>
                <th className="px-4 py-3 text-center font-semibold">الرصيد الدفتري القديم</th>
                <th className="px-4 py-3 text-center font-semibold">الموجود 31/12/2025</th>
                <th className="px-4 py-3 text-center font-semibold">الرصيد الحالي</th>
                <th className="px-4 py-3 text-center font-semibold">صفحة الدفتر</th>
                <th className="px-4 py-3 text-center font-semibold">الوحدة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const opening = item.openingLines[0];
                const current = balances.itemTotals.get(item.id) ?? 0;
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{item.itemCode ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-center">{opening?.bookBalance ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{opening?.physicalQuantity ?? "—"}</td>
                    <td className="px-4 py-3 text-center text-base font-bold text-emerald-800">{current}</td>
                    <td className="px-4 py-3 text-center">{opening?.ledgerPageNo ?? item.legacyLedgerPageNo ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{item.unit?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-left">
                      <div className="flex justify-end gap-2">
                        <Link href={`/reports/item-card?itemId=${encodeURIComponent(item.id)}`} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100">بطاقة الصنف</Link>
                        <Link href={`/items/${item.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">كل تفاصيل المادة</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">لا توجد مواد مطابقة للبحث.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
