import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const items = await prisma.item.findMany({
    where: { active: true },
    orderBy: [{ itemCode: "asc" }, { name: "asc" }],
    include: {
      unit: true,
      openingLines: {
        where: { snapshot: { centerId: center.id } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">المواد</h2>
        <p className="mt-2 text-sm text-slate-500">بيانات المواد المستوردة من الجرد الافتتاحي ويمكن تعديلها واستكمال تاريخها لاحقاً.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right font-semibold">رقم المادة</th>
                <th className="min-w-80 px-4 py-3 text-right font-semibold">المادة</th>
                <th className="px-4 py-3 text-center font-semibold">الرصيد القديم</th>
                <th className="px-4 py-3 text-center font-semibold">الموجود</th>
                <th className="px-4 py-3 text-center font-semibold">صفحة الدفتر</th>
                <th className="px-4 py-3 text-center font-semibold">الوحدة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => {
                const opening = item.openingLines[0];
                return (
                  <tr key={item.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{item.itemCode ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 text-center">{opening?.bookBalance ?? "—"}</td>
                    <td className="px-4 py-3 text-center font-semibold">{opening?.physicalQuantity ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{opening?.ledgerPageNo ?? item.legacyLedgerPageNo ?? "—"}</td>
                    <td className="px-4 py-3 text-center">{item.unit?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
