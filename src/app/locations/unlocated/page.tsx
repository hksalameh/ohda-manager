import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

export default async function UnlocatedItems() {
  const center = await getCurrentCenter();
  if (!center) return <p>لا يوجد مركز مفعّل.</p>;
  const [unlocated, balances] = await Promise.all([
    prisma.location.findFirst({ where: { centerId: center.id, code: "UNLOCATED" } }),
    getCenterInventoryBalances(center.id),
  ]);
  const counts = unlocated ? [...balances.itemLocationTotals].map(([id, byLocation]) => ({
    id, quantity: byLocation.get(unlocated.id) ?? 0,
  })).filter((item) => item.quantity > 0) : [];
  const items = counts.length ? await prisma.item.findMany({
    where: { id: { in: counts.map((item) => item.id) } }, orderBy: { name: "asc" },
  }) : [];
  const byId = new Map(counts.map((row) => [row.id, row.quantity]));
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="rounded-3xl bg-amber-50 p-6">
      <p className="text-sm font-bold text-amber-800">المتابعة بعد الجرد</p>
      <h1 className="mt-2 text-3xl font-black text-slate-900">مواد غير محددة الموقع</h1>
      <p className="mt-2 text-sm leading-7 text-slate-700">هذه المواد لم تختفِ من سجلات المركز. نُقلت إلى قائمة متابعة مستقلة إلى أن يتم العثور على موقعها الصحيح.</p>
      <Link href="/locations" className="mt-4 inline-block rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold">العودة للغرف</Link>
    </div>
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-4 text-sm font-bold">المواد بانتظار تحديد مكانها — {counts.reduce((a, b) => a + b.quantity, 0)} قطعة</div>
      <div className="divide-y">
        {items.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><Link href={`/items/${item.id}`} className="font-bold text-blue-900 hover:underline">{item.name}</Link><p className="text-xs text-slate-500">{item.itemCode || "بلا رقم"} • عدد {byId.get(item.id)}</p></div>
          <Link href={`/documents/transfer?fromLocationId=${unlocated!.id}&itemId=${item.id}`} className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-bold text-white">تحديد غرفتها ونقلها</Link>
        </div>)}
        {items.length === 0 && <p className="p-8 text-center text-slate-600">لا توجد مواد غير محددة الموقع حاليًا.</p>}
      </div>
    </div>
  </div>;
}
