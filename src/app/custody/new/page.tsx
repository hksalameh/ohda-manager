import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { createCustodyDraftFromRoom } from "@/app/employees/actions";

export const dynamic = "force-dynamic";

export default async function NewCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const center = await getCurrentCenter();
  if (!center) {
    return <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">لا يوجد مركز مفعّل بعد.</section>;
  }

  const employees = await prisma.employee.findMany({
    where: { centerId: center.id, active: true },
    orderBy: { fullName: "asc" },
    include: {
      locationAssignments: {
        where: { isPrimary: true, endsAt: null },
        take: 1,
        orderBy: { startsAt: "desc" },
        include: { location: true },
      },
    },
  });

  const locationIds = [...new Set(employees.map((employee) => employee.locationAssignments[0]?.locationId).filter((id): id is string => Boolean(id)))];
  const movements = locationIds.length
    ? await prisma.inventoryMovement.findMany({
        where: {
          OR: [
            { toLocationId: { in: locationIds } },
            { fromLocationId: { in: locationIds } },
          ],
        },
        select: {
          itemId: true,
          quantity: true,
          toLocationId: true,
          fromLocationId: true,
          toEmployeeId: true,
          fromEmployeeId: true,
        },
      })
    : [];

  const physical = new Map<string, Map<string, number>>();
  const assigned = new Map<string, Map<string, number>>();

  const add = (target: Map<string, Map<string, number>>, locationId: string, itemId: string, quantity: number) => {
    const items = target.get(locationId) ?? new Map<string, number>();
    items.set(itemId, (items.get(itemId) ?? 0) + quantity);
    target.set(locationId, items);
  };

  for (const movement of movements) {
    if (movement.toLocationId) {
      add(physical, movement.toLocationId, movement.itemId, movement.quantity);
      if (movement.toEmployeeId) add(assigned, movement.toLocationId, movement.itemId, movement.quantity);
    }
    if (movement.fromLocationId) {
      add(physical, movement.fromLocationId, movement.itemId, -movement.quantity);
      if (movement.fromEmployeeId) add(assigned, movement.fromLocationId, movement.itemId, -movement.quantity);
    }
  }

  const availability = new Map<string, { items: number; pieces: number }>();
  for (const locationId of locationIds) {
    const physicalItems = physical.get(locationId) ?? new Map<string, number>();
    const assignedItems = assigned.get(locationId) ?? new Map<string, number>();
    let items = 0;
    let pieces = 0;
    for (const [itemId, physicalQuantity] of physicalItems.entries()) {
      const available = physicalQuantity - (assignedItems.get(itemId) ?? 0);
      if (available > 0) {
        items += 1;
        pieces += available;
      }
    }
    availability.set(locationId, { items, pieces });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-bold text-emerald-700">العهدة الشخصية</p>
        <h2 className="mt-1 text-3xl font-extrabold text-slate-900">تسليم عهدة شخصية</h2>
        <p className="mt-2 text-sm leading-7 text-slate-700">
          اختر الموظف فقط. سيجهز النظام المواد غير المسجلة على أي موظف في غرفته كمسودة، ثم تراجعها قبل الاعتماد والطباعة.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-white p-4"><strong className="text-emerald-700">1. اختر الموظف</strong><p className="mt-1 text-xs leading-6 text-slate-500">يجب أن يكون مرتبطًا بغرفة.</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><strong className="text-slate-900">2. راجع المواد</strong><p className="mt-1 text-xs leading-6 text-slate-500">احذف غير المطلوب وعدّل الكميات.</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-4"><strong className="text-slate-900">3. اعتمد واطبع</strong><p className="mt-1 text-xs leading-6 text-slate-500">بعد الاعتماد تفتح معاينة سند التسليم للطباعة.</p></div>
      </section>

      {query.error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">{query.error}</section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="font-extrabold text-slate-900">اختر الموظف المستلم</h3>
          <p className="mt-1 text-xs text-slate-500">لن يسمح البرنامج بإنشاء سند إذا لم توجد مواد متاحة للتسليم في غرفة الموظف.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right">الموظف</th>
                <th className="px-4 py-3 text-right">الرقم الوظيفي</th>
                <th className="px-4 py-3 text-right">الغرفة</th>
                <th className="px-4 py-3 text-center">المتاح للتسليم</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((employee) => {
                const assignment = employee.locationAssignments[0];
                const stat = assignment ? availability.get(assignment.locationId) : undefined;
                const canCreate = Boolean(assignment && stat && stat.pieces > 0);
                return (
                  <tr key={employee.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900">{employee.fullName}</td>
                    <td className="px-4 py-3">{employee.employeeNo ?? "—"}</td>
                    <td className="px-4 py-3">{assignment?.location.name ?? <span className="font-bold text-red-700">غير محددة</span>}</td>
                    <td className="px-4 py-3 text-center">
                      {assignment ? (
                        stat && stat.pieces > 0
                          ? <span className="font-bold text-emerald-700">{stat.items} صنف • {stat.pieces} قطعة</span>
                          : <span className="text-slate-500">لا توجد مواد غير معهود بها</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-left">
                      {canCreate ? (
                        <form action={createCustodyDraftFromRoom}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input type="hidden" name="returnTo" value="/custody/new" />
                          <button className="rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">إنشاء مسودة التسليم</button>
                        </form>
                      ) : (
                        <Link href="/employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-600">مراجعة بيانات الموظف</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {employees.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">لا يوجد موظفون مسجلون بعد.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/custody?mode=employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">عرض العهد الحالية</Link>
        <Link href="/employees" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">إدارة الموظفين والغرف</Link>
      </div>
    </div>
  );
}
