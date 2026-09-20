import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEmployeeCustodyBalances } from "@/lib/custody-query";
import { createReturnDraftForLocation } from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      center: true,
      locationAssignments: {
        orderBy: { startsAt: "desc" },
        include: { location: true },
      },
      documents: {
        where: { documentType: { in: ["CUSTODY", "RETURN"] } },
        orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: { _count: { select: { lines: true } } },
      },
    },
  });
  if (!employee) notFound();

  const balances = await getEmployeeCustodyBalances(employee.id);
  const itemIds = [...new Set(balances.map((balance) => balance.itemId))];
  const locationIds = [...new Set(balances.map((balance) => balance.locationId))];

  const [items, balanceLocations, allLocations] = await Promise.all([
    prisma.item.findMany({
      where: { id: { in: itemIds } },
      include: { unit: true },
    }),
    prisma.location.findMany({ where: { id: { in: locationIds } } }),
    prisma.location.findMany({
      where: { centerId: employee.centerId, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const itemMap = new Map(items.map((item) => [item.id, item]));
  const locationMap = new Map(balanceLocations.map((location) => [location.id, location]));
  const byLocation = new Map<string, typeof balances>();
  for (const balance of balances) {
    const current = byLocation.get(balance.locationId) ?? [];
    current.push(balance);
    byLocation.set(balance.locationId, current);
  }

  const currentAssignment = employee.locationAssignments.find((assignment) => assignment.isPrimary && !assignment.endsAt);
  const totalCustodyPieces = balances.reduce((sum, balance) => sum + balance.quantity, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">الموظفون / تفاصيل العهدة</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{employee.fullName}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {employee.employeeNo ? `الرقم الوظيفي: ${employee.employeeNo}` : "بدون رقم وظيفي"}
            {employee.jobTitle ? ` • ${employee.jobTitle}` : ""}
            {currentAssignment ? ` • الموقع الحالي: ${currentAssignment.location.name}` : ""}
          </p>
        </div>
        <Link href="/employees" className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium hover:bg-slate-50">العودة للموظفين</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">إجمالي القطع في عهدته الآن</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{totalCustodyPieces}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">عدد الأصناف الحالية</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{balances.length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">سندات العهدة والإرجاع</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{employee.documents.length}</p>
        </article>
      </div>

      {balances.length === 0 ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-950">
          لا توجد عهدة حالية مسجلة على هذا الموظف. يمكن إنشاء سند عهدة جديد من شاشة الموظفين بعد ربطه بالغرفة.
        </section>
      ) : (
        <div className="space-y-5">
          {[...byLocation.entries()].map(([locationId, locationBalances]) => {
            const location = locationMap.get(locationId);
            if (!location) return null;
            return (
              <section key={locationId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 p-4">
                  <h3 className="font-bold text-slate-900">العهدة الموجودة في: {location.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">يمكن إرجاع جزء من المواد أو كلها، إما مع إبقائها في نفس الغرفة بدون عهدة شخصية، أو نقلها إلى موقع آخر.</p>
                </div>

                <form action={createReturnDraftForLocation}>
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <input type="hidden" name="fromLocationId" value={locationId} />
                  <div className="overflow-x-auto">
                    <table className="min-w-[720px] w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-20 px-3 py-3 text-center">إرجاع</th>
                          <th className="px-4 py-3 text-right">رقم المادة</th>
                          <th className="min-w-72 px-4 py-3 text-right">المادة</th>
                          <th className="px-4 py-3 text-center">العهدة الحالية</th>
                          <th className="px-4 py-3 text-center">كمية الإرجاع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {locationBalances.map((balance) => {
                          const item = itemMap.get(balance.itemId);
                          if (!item) return null;
                          return (
                            <tr key={`${balance.itemId}-${locationId}`}>
                              <td className="px-3 py-3 text-center"><input type="checkbox" name="includedItem" value={item.id} className="h-4 w-4" /></td>
                              <td className="px-4 py-3 font-mono text-xs">{item.itemCode ?? "—"}</td>
                              <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                              <td className="px-4 py-3 text-center font-bold">{balance.quantity}</td>
                              <td className="px-4 py-3 text-center"><input name={`quantity:${item.id}`} type="number" min={1} max={balance.quantity} defaultValue={balance.quantity} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-center" /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
                    <label className="text-sm font-medium text-slate-700">الموقع بعد الإرجاع
                      <select name="toLocationId" defaultValue={locationId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                        {allLocations.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.id === locationId ? " — يبقى في نفس المكان" : ""}</option>)}
                      </select>
                    </label>
                    <button className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-800">إنشاء مسودة إرجاع</button>
                  </div>
                </form>
              </section>
            );
          })}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">سجل سندات الموظف</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[760px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-right">النوع</th><th className="px-3 py-2 text-right">التاريخ</th><th className="px-3 py-2 text-center">عدد المواد</th><th className="px-3 py-2 text-center">الحالة</th><th className="px-3 py-2"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {employee.documents.map((document) => <tr key={document.id}><td className="px-3 py-2 font-medium">{document.documentType === "CUSTODY" ? "سند عهدة" : "إرجاع عهدة"}</td><td className="px-3 py-2">{document.documentDate.toLocaleDateString("ar-JO")}</td><td className="px-3 py-2 text-center">{document._count.lines}</td><td className="px-3 py-2 text-center">{document.status === "POSTED" ? "معتمد" : document.status === "DRAFT" ? "مسودة" : "ملغي"}</td><td className="px-3 py-2 text-left"><Link href={`/documents/${document.id}`} className="text-blue-700 underline">فتح</Link></td></tr>)}
              {employee.documents.length === 0 ? <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">لا توجد سندات للموظف بعد.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
