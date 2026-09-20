import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { TransferForm } from "./transfer-form";

export const dynamic = "force-dynamic";

export default async function TransferPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const [items, locations, balances] = await Promise.all([
    prisma.item.findMany({
      where: { active: true },
      orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      select: { id: true, itemCode: true, name: true },
    }),
    prisma.location.findMany({
      where: { centerId: center.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getCenterInventoryBalances(center.id),
  ]);

  const availability: Record<string, Record<string, number>> = {};
  for (const item of items) {
    const perLocation = balances.itemLocationTotals.get(item.id);
    if (!perLocation) continue;
    for (const [locationId, quantity] of perLocation.entries()) {
      if (quantity <= 0) continue;
      availability[locationId] ??= {};
      availability[locationId][item.id] = quantity;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">المستندات / نقل المواد</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">إنشاء سند نقل بين المواقع</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            اختر الموقع المصدر والوجهة، ثم أضف المواد والكميات. لن يسمح النظام بنقل كمية أكبر من الرصيد الفعلي في المصدر.
          </p>
        </div>
        <Link href="/documents" className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium hover:bg-slate-50">
          العودة للمستندات
        </Link>
      </div>

      {locations.length < 2 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
          يلزم وجود موقعين فعالين على الأقل لإنشاء سند نقل.
        </section>
      ) : (
        <TransferForm items={items} locations={locations} availability={availability} />
      )}
    </div>
  );
}
