import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEmployeeCustodyBalances } from "@/lib/custody-query";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function value(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export default async function EmployeeCustodyReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const employeeId = value(params.employeeId);
  const q = value(params.q).toLowerCase();

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;

  const employees = await prisma.employee.findMany({
    where: { centerId: center.id, active: true },
    orderBy: { fullName: "asc" },
    include: {
      locationAssignments: {
        where: { endsAt: null, isPrimary: true },
        orderBy: { startsAt: "desc" },
        take: 1,
        include: { location: true },
      },
    },
  });

  const employee = employees.find((candidate) => candidate.id === employeeId) ?? null;
  let rows: Array<{
    itemId: string;
    itemCode: string | null;
    itemName: string;
    unitName: string | null;
    locationName: string;
    quantity: number;
  }> = [];

  if (employee) {
    const balances = await getEmployeeCustodyBalances(employee.id);
    const itemIds = [...new Set(balances.map((balance) => balance.itemId))];
    const locationIds = [...new Set(balances.map((balance) => balance.locationId))];
    const [items, locations] = await Promise.all([
      prisma.item.findMany({ where: { id: { in: itemIds } }, include: { unit: true } }),
      prisma.location.findMany({ where: { id: { in: locationIds } } }),
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const locationMap = new Map(locations.map((location) => [location.id, location.name]));
    rows = balances
      .map((balance) => {
        const item = itemMap.get(balance.itemId);
        if (!item) return null;
        return {
          itemId: item.id,
          itemCode: item.itemCode,
          itemName: item.name,
          unitName: item.unit?.name ?? null,
          locationName: locationMap.get(balance.locationId) ?? "موقع غير معروف",
          quantity: balance.quantity,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .filter((row) => !q || `${row.itemCode ?? ""} ${row.itemName} ${row.locationName}`.toLowerCase().includes(q))
      .sort((a, b) => a.locationName.localeCompare(b.locationName, "ar") || a.itemName.localeCompare(b.itemName, "ar"));
  }

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const currentRoom = employee?.locationAssignments[0]?.location.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm text-slate-500">التقارير</p><h2 className="mt-1 text-2xl font-bold text-slate-900">عهدة الموظفين</h2></div>
        <div className="flex gap-2">{employee ? <PrintButton label="طباعة العهدة" /> : null}<Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">كل التقارير</Link></div>
      </div>

      <form className="no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-slate-700">الموظف<select name="employeeId" defaultValue={employeeId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" required><option value="">اختر الموظف</option>{employees.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.fullName}{candidate.employeeNo ? ` — ${candidate.employeeNo}` : ""}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">بحث داخل العهدة<input name="q" defaultValue={value(params.q)} placeholder="المادة أو الموقع" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <button className="self-end rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">عرض</button>
      </form>

      {!employee ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">اختر موظفاً لعرض عهدته الحالية.</section>
      ) : (
        <section className="print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-5 border-b border-slate-200 pb-4 text-center">
            <p className="text-sm font-bold">جمعية المركز الإسلامي الخيرية</p>
            <h3 className="mt-1 text-xl font-bold">تقرير العهدة الشخصية الحالية</h3>
            <p className="mt-1 text-sm text-slate-600">مركز الرمثا • تاريخ الطباعة {new Date().toLocaleDateString("ar-JO")}</p>
          </header>

          <div className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">الموظف</span><div className="mt-1 font-bold">{employee.fullName}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">الرقم الوظيفي</span><div className="mt-1 font-bold">{employee.employeeNo ?? "—"}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">الغرفة الحالية</span><div className="mt-1 font-bold">{currentRoom}</div></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="text-slate-500">إجمالي القطع في العهدة</span><div className="mt-1 text-xl font-bold">{totalQuantity}</div></div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full border-collapse text-sm print:min-w-0">
              <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-3 py-2 text-center">#</th><th className="border border-slate-300 px-3 py-2 text-right">رقم المادة</th><th className="border border-slate-300 px-3 py-2 text-right">المادة</th><th className="border border-slate-300 px-3 py-2 text-center">الوحدة</th><th className="border border-slate-300 px-3 py-2 text-right">الموقع</th><th className="border border-slate-300 px-3 py-2 text-center">الكمية</th></tr></thead>
              <tbody>
                {rows.map((row, index) => <tr key={`${row.itemId}-${row.locationName}`}><td className="border border-slate-300 px-3 py-2 text-center">{index + 1}</td><td className="border border-slate-300 px-3 py-2 font-mono text-xs">{row.itemCode ?? "—"}</td><td className="border border-slate-300 px-3 py-2 font-medium">{row.itemName}</td><td className="border border-slate-300 px-3 py-2 text-center">{row.unitName ?? "—"}</td><td className="border border-slate-300 px-3 py-2">{row.locationName}</td><td className="border border-slate-300 px-3 py-2 text-center font-bold">{row.quantity}</td></tr>)}
                {rows.length === 0 ? <tr><td colSpan={6} className="border border-slate-300 px-4 py-6 text-center text-slate-500">لا توجد عهدة حالية مطابقة.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
