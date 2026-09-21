import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { renameEmployee, renameLocation } from "./actions";

export const dynamic = "force-dynamic";

type BalanceRow = {
  employeeId: string;
  locationId: string;
  itemId: string;
  quantity: number;
};

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.trim() : "";
}

export default async function CustodyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const mode = value(params.mode) === "rooms" ? "rooms" : "employees";
  const q = value(params.q);
  const selectedEmployeeId = value(params.employeeId);
  const selectedLocationId = value(params.locationId);
  const center = await getCurrentCenter();
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;
  const [employees, locations] = await Promise.all([
    prisma.employee.findMany({
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
    }),
    prisma.location.findMany({
      where: { centerId: center.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const employeeIds = employees.map((employee) => employee.id);
  const movements = employeeIds.length
    ? await prisma.inventoryMovement.findMany({
        where: {
          OR: [
            { toEmployeeId: { in: employeeIds } },
            { fromEmployeeId: { in: employeeIds } },
          ],
        },
        select: {
          itemId: true,
          quantity: true,
          toEmployeeId: true,
          fromEmployeeId: true,
          toLocationId: true,
          fromLocationId: true,
        },
      })
    : [];
  const balanceMap = new Map<string, BalanceRow>();
  for (const movement of movements) {
    if (movement.toEmployeeId && movement.toLocationId) {
      const key = `${movement.toEmployeeId}|${movement.toLocationId}|${movement.itemId}`;
      const current = balanceMap.get(key) ?? {
        employeeId: movement.toEmployeeId,
        locationId: movement.toLocationId,
        itemId: movement.itemId,
        quantity: 0,
      };
      current.quantity += movement.quantity;
      balanceMap.set(key, current);
    }
    if (movement.fromEmployeeId && movement.fromLocationId) {
      const key = `${movement.fromEmployeeId}|${movement.fromLocationId}|${movement.itemId}`;
      const current = balanceMap.get(key) ?? {
        employeeId: movement.fromEmployeeId,
        locationId: movement.fromLocationId,
        itemId: movement.itemId,
        quantity: 0,
      };
      current.quantity -= movement.quantity;
      balanceMap.set(key, current);
    }
  }

  const balances = [...balanceMap.values()].filter((row) => row.quantity > 0);
  const itemIds = [...new Set(balances.map((row) => row.itemId))];
  const items = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds } }, orderBy: { name: "asc" } })
    : [];
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const locationMap = new Map(locations.map((location) => [location.id, location]));
  const employeeStats = new Map<string, { pieces: number; items: Set<string> }>();
  const locationStats = new Map<string, { pieces: number; items: Set<string>; employees: Set<string> }>();
  for (const row of balances) {
    const e = employeeStats.get(row.employeeId) ?? { pieces: 0, items: new Set<string>() };
    e.pieces += row.quantity;
    e.items.add(row.itemId);
    employeeStats.set(row.employeeId, e);

    const l = locationStats.get(row.locationId) ?? { pieces: 0, items: new Set<string>(), employees: new Set<string>() };
    l.pieces += row.quantity;
    l.items.add(row.itemId);
    l.employees.add(row.employeeId);
    locationStats.set(row.locationId, l);
  }

  const filteredEmployees = employees.filter((employee) => {
    if (!q) return true;
    return `${employee.fullName} ${employee.employeeNo ?? ""}`.toLocaleLowerCase("ar").includes(q.toLocaleLowerCase("ar"));
  });
  const filteredLocations = locations.filter((location) => {
    if (!q) return true;
    return `${location.name} ${location.code ?? ""}`.toLocaleLowerCase("ar").includes(q.toLocaleLowerCase("ar"));
  });

  const selectedEmployee = selectedEmployeeId ? employeeMap.get(selectedEmployeeId) ?? null : null;
  const selectedLocation = selectedLocationId ? locationMap.get(selectedLocationId) ?? null : null;
  const selectedRows = selectedEmployee
    ? balances.filter((row) => row.employeeId === selectedEmployee.id)
    : selectedLocation
      ? balances.filter((row) => row.locationId === selectedLocation.id)
      : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-slate-500">العُهد / المركز الحالي</p>
          <h2 className="mt-1 text-3xl font-bold text-slate-900">العُهد</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            استعرض العهدة بالطريقة التي تناسبك: حسب الموظف أو حسب الغرفة، وعدّل الأسماء وافتح التفاصيل من نفس المكان.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/stocktake" className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">بدء جرد غرفة</Link>
          <Link href="/employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">إضافة موظف</Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">موظفون لديهم عهدة</p>
          <p className="mt-2 text-3xl font-bold">{[...employeeStats.values()].filter((stat) => stat.pieces > 0).length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">غرف فيها عهدة شخصية</p>
          <p className="mt-2 text-3xl font-bold">{[...locationStats.values()].filter((stat) => stat.pieces > 0).length}</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">إجمالي قطع العهدة الحالية</p>
          <p className="mt-2 text-3xl font-bold">{balances.reduce((sum, row) => sum + row.quantity, 0)}</p>
        </article>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <Link href="/custody?mode=employees" className={`rounded-lg px-5 py-2.5 text-sm font-bold ${mode === "employees" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>حسب الموظف</Link>
            <Link href="/custody?mode=rooms" className={`rounded-lg px-5 py-2.5 text-sm font-bold ${mode === "rooms" ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>حسب الغرفة</Link>
          </div>
          <form className="flex min-w-0 flex-1 gap-2 md:max-w-xl">
            <input type="hidden" name="mode" value={mode} />
            <input name="q" defaultValue={q} placeholder={mode === "employees" ? "ابحث باسم الموظف أو رقمه" : "ابحث باسم الغرفة"} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5" />
            <button className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white">بحث</button>
          </form>
        </div>
      </section>

      {mode === "employees" ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((employee) => {
            const stat = employeeStats.get(employee.id);
            const location = employee.locationAssignments[0]?.location;
            return (
              <article key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{employee.fullName}</h3>
                    <p className="mt-1 text-sm text-slate-500">{employee.employeeNo ? `رقم وظيفي: ${employee.employeeNo}` : "بدون رقم وظيفي"}</p>
                    <p className="mt-1 text-sm text-slate-500">{location?.name ?? "غير مرتبط بغرفة"}</p>
                  </div>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800">{stat?.pieces ?? 0} قطعة</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm">
                  <div><span className="block text-slate-500">الأصناف</span><strong className="text-lg">{stat?.items.size ?? 0}</strong></div>
                  <div><span className="block text-slate-500">القطع</span><strong className="text-lg">{stat?.pieces ?? 0}</strong></div>
                </div>
                <form action={renameEmployee} className="mt-4 flex gap-2">
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <input name="fullName" defaultValue={employee.fullName} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">تعديل الاسم</button>
                </form>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href={`/custody?mode=employees&employeeId=${employee.id}`} className="rounded-lg bg-blue-700 px-3 py-2.5 text-center text-sm font-bold text-white">عرض العهدة</Link>
                  <Link href={`/employees/${employee.id}`} className="rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-bold">إدارة / إرجاع</Link>
                </div>
              </article>
            );
          })}
          {filteredEmployees.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">لا يوجد موظفون مطابقون للبحث.</p> : null}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredLocations.map((location) => {
            const stat = locationStats.get(location.id);
            return (
              <article key={location.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-xs text-slate-500">{location.type}</p><h3 className="mt-1 text-lg font-bold text-slate-900">{location.name}</h3></div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{stat?.pieces ?? 0} قطعة عهدة</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center text-sm">
                  <div><span className="block text-slate-500">الموظفون</span><strong className="text-lg">{stat?.employees.size ?? 0}</strong></div>
                  <div><span className="block text-slate-500">الأصناف</span><strong className="text-lg">{stat?.items.size ?? 0}</strong></div>
                  <div><span className="block text-slate-500">القطع</span><strong className="text-lg">{stat?.pieces ?? 0}</strong></div>
                </div>
                <form action={renameLocation} className="mt-4 flex gap-2">
                  <input type="hidden" name="locationId" value={location.id} />
                  <input name="name" defaultValue={location.name} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold">تعديل الاسم</button>
                </form>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Link href={`/custody?mode=rooms&locationId=${location.id}`} className="rounded-lg bg-blue-700 px-3 py-2.5 text-center text-sm font-bold text-white">عرض عهد الغرفة</Link>
                  <Link href={`/stocktake?locationId=${location.id}`} className="rounded-lg border border-slate-300 px-3 py-2.5 text-center text-sm font-bold">جرد الغرفة</Link>
                </div>
              </article>
            );
          })}
          {filteredLocations.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">لا توجد غرف مطابقة للبحث.</p> : null}
        </div>
      )}
      {(selectedEmployee || selectedLocation) ? (
        <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-blue-100 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold text-blue-700">تفاصيل العهدة الحالية</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{selectedEmployee ? selectedEmployee.fullName : selectedLocation?.name}</h3>
            </div>
            <Link href={`/custody?mode=${mode}`} className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-center text-sm font-bold text-blue-800">إغلاق التفاصيل</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {selectedLocation ? <th className="px-4 py-3 text-right">الموظف</th> : <th className="px-4 py-3 text-right">الغرفة</th>}
                  <th className="px-4 py-3 text-right">رقم المادة</th>
                  <th className="min-w-72 px-4 py-3 text-right">المادة</th>
                  <th className="px-4 py-3 text-center">الكمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedRows.map((row) => {
                  const item = itemMap.get(row.itemId);
                  const employee = employeeMap.get(row.employeeId);
                  const location = locationMap.get(row.locationId);
                  return (
                    <tr key={`${row.employeeId}-${row.locationId}-${row.itemId}`}>
                      <td className="px-4 py-3 font-medium">{selectedLocation ? employee?.fullName ?? "—" : location?.name ?? "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item?.itemCode ?? "—"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{item?.name ?? "مادة غير معروفة"}</td>
                      <td className="px-4 py-3 text-center text-base font-bold">{row.quantity}</td>
                    </tr>
                  );
                })}
                {selectedRows.length === 0 ? <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">لا توجد عهدة حالية مسجلة هنا.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
