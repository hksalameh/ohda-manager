import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getLocationCustodyTotals } from "@/lib/custody-query";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function value(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function LocationInventoryReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const locationId = value(params.locationId);
  const q = value(params.q).toLowerCase();

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const [locations, items, balances] = await Promise.all([
    prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { active: true }, include: { unit: true }, orderBy: [{ itemCode: "asc" }, { name: "asc" }] }),
    getCenterInventoryBalances(center.id),
  ]);

  const selectedLocation = locations.find((location) => location.id === locationId) ?? null;
  const custodyTotals = selectedLocation ? await getLocationCustodyTotals(selectedLocation.id) : new Map<string, number>();
  const locationBalances = selectedLocation
    ? items
        .map((item) => {
          const quantity = balances.itemLocationTotals.get(item.id)?.get(selectedLocation.id) ?? 0;
          const assigned = custodyTotals.get(item.id) ?? 0;
          return { item, quantity, assigned, unassigned: Math.max(0, quantity - assigned) };
        })
        .filter((row) => row.quantity > 0)
        .filter((row) => !q || `${row.item.itemCode ?? ""} ${row.item.name}`.toLowerCase().includes(q))
    : [];

  const totalQuantity = locationBalances.reduce((sum, row) => sum + row.quantity, 0);
  const totalAssigned = locationBalances.reduce((sum, row) => sum + row.assigned, 0);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">التقارير</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">الموجود حسب الغرفة / الموقع</h2>
        </div>
        <div className="flex gap-2">
          {selectedLocation ? <PrintButton label="طباعة التقرير" /> : null}
          <Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">كل التقارير</Link>
        </div>
      </div>

      <form className="no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-700">
          الموقع
          <select name="locationId" defaultValue={locationId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" required>
            <option value="">اختر الغرفة أو الموقع</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          بحث داخل مواد الموقع
          <input name="q" defaultValue={value(params.q)} placeholder="اسم المادة أو رقمها" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
        </label>
        <button className="self-end rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">عرض</button>
      </form>

      {!selectedLocation ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">اختر موقعاً لعرض المواد الموجودة فيه.</section>
      ) : (
        <section className="print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-5 border-b border-slate-200 pb-4 text-center">
            <p className="text-sm font-bold">جمعية المركز الإسلامي الخيرية</p>
            <h3 className="mt-1 text-xl font-bold">تقرير الموجود في {selectedLocation.name}</h3>
            <p className="mt-1 text-sm text-slate-600">مركز الرمثا • تاريخ الطباعة {new Date().toLocaleDateString("ar-JO")}</p>
          </header>

          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">عدد الأصناف</span><div className="mt-1 text-xl font-bold">{locationBalances.length}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">إجمالي القطع</span><div className="mt-1 text-xl font-bold">{totalQuantity}</div></div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">المعهود بها لموظفين</span><div className="mt-1 text-xl font-bold">{totalAssigned}</div></div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse text-sm print:min-w-0">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-300 px-3 py-2 text-center">#</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">رقم المادة</th>
                  <th className="border border-slate-300 px-3 py-2 text-right">المادة</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">الوحدة</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">الموجود</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">في عهدة موظفين</th>
                  <th className="border border-slate-300 px-3 py-2 text-center">غير معهود</th>
                </tr>
              </thead>
              <tbody>
                {locationBalances.map((row, index) => (
                  <tr key={row.item.id}>
                    <td className="border border-slate-300 px-3 py-2 text-center">{index + 1}</td>
                    <td className="border border-slate-300 px-3 py-2 font-mono text-xs">{row.item.itemCode ?? "—"}</td>
                    <td className="border border-slate-300 px-3 py-2 font-medium">{row.item.name}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{row.item.unit?.name ?? "—"}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center font-bold">{row.quantity}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{row.assigned}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{row.unassigned}</td>
                  </tr>
                ))}
                {locationBalances.length === 0 ? <tr><td colSpan={7} className="border border-slate-300 px-4 py-6 text-center text-slate-500">لا توجد مواد مطابقة.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
