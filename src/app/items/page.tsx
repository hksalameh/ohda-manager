import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

export default async function ItemsPage({ searchParams }: {
  searchParams: Promise<{ q?: string }>;
}) {
  const query = await searchParams;
  const q = (query.q ?? "").trim();
  const center = await getCurrentCenter();
  if (!center) return <p>لا يوجد مركز مفعل.</p>;
  const [items, locations, balances] = await Promise.all([
    prisma.item.findMany({
      where: {
        ...(q ? { OR: [{ name: { contains: q } }, { itemCode: { contains: q } }, { legacyLedgerPageNo: { contains: q } }] } : {}),
      },
      include: { unit: true },
      orderBy: [{ name: "asc" }],
    }),
    prisma.location.findMany({ where: { centerId: center.id, active: true }, select: { id: true, name: true, code: true } }),
    getCenterInventoryBalances(center.id),
  ]);
  const locationNames = new Map(locations.map((room) => [room.id, room]));
  const totalPieces = items.reduce((n, item) => n + (balances.itemTotals.get(item.id) ?? 0), 0);
  const unlocated = locations.find((location) => location.code === "UNLOCATED");

  return <div className="mx-auto max-w-7xl space-y-5">
    <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
      <p className="text-sm font-bold text-teal-300">دليل العهدة</p>
      <h1 className="mt-2 text-3xl font-black">جميع المواد وأماكن وجودها</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">اسم المادة ورقمها ورصيدها، ثم كل غرفة توجد فيها وعدد القطع. اضغط اسم الغرفة لفتحها وجردها.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/locations" className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950">فتح الغرف والجرد</Link>
        <Link href="/items/new" className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white">+ إضافة مادة جديدة للدليل</Link>
      </div>
    </header>
    <form action="/items" className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <input name="q" defaultValue={q} placeholder="ابحث باسم المادة أو رقمها..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"/>
      <button type="submit" className="rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white">بحث</button>
      {q && <Link href="/items" className="rounded-xl border px-4 py-3 text-sm font-bold">الكل</Link>}
    </form>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">المواد المعروضة</p><p className="text-3xl font-black">{items.length}</p></div>
      <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">القطع المسجلة</p><p className="text-3xl font-black">{totalPieces}</p></div>
      <Link href="/locations/unlocated" className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-900">غير محدد الموقع</p><p className="text-3xl font-black text-amber-950">{unlocated ? balances.locationTotals.get(unlocated.id) ?? 0 : 0}</p></Link>
    </div>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="w-28 px-4 py-3 text-right">رقم المادة</th>
              <th className="min-w-48 px-4 py-3 text-right">المادة</th>
              <th className="w-24 px-4 py-3 text-center">الإجمالي</th>
              <th className="min-w-72 px-4 py-3 text-right">أين توجد؟ (العدد في كل غرفة)</th>
              <th className="w-24 px-4 py-3 text-center">تفاصيل</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const quantities = [...(balances.itemLocationTotals.get(item.id) ?? [])]
                .filter(([id, quantity]) => quantity > 0 && locationNames.has(id))
                .sort(([a], [b]) => (locationNames.get(a)?.name ?? "").localeCompare(locationNames.get(b)?.name ?? "", "ar"));
              const total = balances.itemTotals.get(item.id) ?? 0;
              return <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-4 font-mono text-xs">{item.itemCode || "—"}</td>
                <td className="px-4 py-4"><Link href={`/items/${item.id}`} className="font-extrabold text-slate-950 hover:text-teal-800">{item.name}</Link><p className="text-xs text-slate-500">{item.unit?.name ?? "قطعة"}{!item.active ? " • مادة مؤرشفة" : ""}</p></td>
                <td className="px-4 py-4 text-center text-lg font-black text-teal-800">{total}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    {quantities.map(([id, count]) => {
                      const location = locationNames.get(id)!;
                      return <Link key={id} href={location.code === "UNLOCATED" ? "/locations/unlocated" : `/locations/${id}`} className={`rounded-lg border px-3 py-2 text-xs font-bold hover:shadow-sm ${location.code === "UNLOCATED" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-teal-200 bg-teal-50 text-teal-900"}`}>{location.code === "UNLOCATED" ? "غير محدد الموقع" : location.name} <span className="mr-1 rounded bg-white px-2 py-0.5 text-slate-900">{count}</span></Link>;
                    })}
                    {!quantities.length && <span className="text-xs text-slate-400">غير موجودة في أي غرفة حتى الآن</span>}
                  </div>
                </td>
                <td className="px-4 py-4 text-center"><Link href={`/items/${item.id}`} className="text-xs font-bold text-blue-800 underline-offset-2 hover:underline">سجل المادة</Link></td>
              </tr>;
            })}
            {!items.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">لا توجد مواد مطابقة.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
