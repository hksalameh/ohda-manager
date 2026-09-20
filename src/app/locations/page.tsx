import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const [locations, balances] = await Promise.all([
    prisma.location.findMany({
      where: { centerId: center.id, active: true },
      orderBy: { name: "asc" },
    }),
    getCenterInventoryBalances(center.id),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">المواقع والغرف</h2>
        <p className="mt-2 text-sm text-slate-500">الكميات الحالية بعد احتساب الجرد الافتتاحي وجميع مستندات الإدخال والإخراج والنقل.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {locations.map((location) => (
          <article key={location.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{location.type}</p>
            <h3 className="mt-1 text-lg font-bold text-slate-900">{location.name}</h3>
            <div className="mt-5 flex items-end justify-between border-t border-slate-100 pt-4">
              <span className="text-sm text-slate-500">إجمالي القطع حالياً</span>
              <span className="text-2xl font-bold text-slate-900">{balances.locationTotals.get(location.id) ?? 0}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
