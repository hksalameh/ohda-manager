import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { currentCustodyAtRoom } from "@/lib/custody-snapshot";
import RoomCustodyActions from "@/components/room-custody-actions";

export const dynamic = "force-dynamic";

/** Reprint an existing employee's custody without issuing it a second time. */
export default async function PersonalCustodyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const center = await getCurrentCenter();
  if (!center) return <p>لا يوجد مركز مفعّل.</p>;

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
  const locationIds = [...new Set(employees.map((e) => e.locationAssignments[0]?.locationId).filter((x): x is string => !!x))];
  const [balances, movements, pendingAudits] = await Promise.all([
    getCenterInventoryBalances(center.id),
    locationIds.length ? prisma.inventoryMovement.findMany({
      where: { OR: [{ fromLocationId: { in: locationIds } }, { toLocationId: { in: locationIds } }] },
      select: { itemId: true, quantity: true, fromLocationId: true, toLocationId: true, fromEmployeeId: true, toEmployeeId: true },
    }) : Promise.resolve([]),
    locationIds.length ? prisma.inventoryDocument.findMany({
      where: {
        centerId: center.id, status: "DRAFT", documentNo: { startsWith: "JRD-" },
        OR: [{ fromLocationId: { in: locationIds } }, { toLocationId: { in: locationIds } }],
      },
      select: { fromLocationId: true, toLocationId: true },
    }) : Promise.resolve([]),
  ]);

  const totalAssigned = new Map<string, Map<string, number>>();
  const change = (room: string, item: string, amount: number) => {
    const m = totalAssigned.get(room) ?? new Map<string, number>();
    m.set(item, (m.get(item) ?? 0) + amount);
    totalAssigned.set(room, m);
  };
  for (const movement of movements) {
    if (movement.toEmployeeId && movement.toLocationId) change(movement.toLocationId, movement.itemId, movement.quantity);
    if (movement.fromEmployeeId && movement.fromLocationId) change(movement.fromLocationId, movement.itemId, -movement.quantity);
  }
  const waitingRooms = new Set(pendingAudits.flatMap((audit) => [audit.fromLocationId, audit.toLocationId]).filter((id): id is string => !!id));
  const rows = employees.map((employee) => {
    const assignment = employee.locationAssignments[0];
    const roomId = assignment?.locationId;
    const existing = roomId ? currentCustodyAtRoom(employee.id, roomId, movements) : new Map<string, number>();
    const physical = roomId ? balances.itemLocationTotals : new Map<string, Map<string, number>>();
    const assigned = roomId ? totalAssigned.get(roomId) ?? new Map<string, number>() : new Map<string, number>();
    let unassigned = 0;
    if (roomId) for (const [itemId, locs] of physical) {
      unassigned += Math.max(0, (locs.get(roomId) ?? 0) - (assigned.get(itemId) ?? 0));
    }
    return {
      employee,
      assignment,
      pieces: [...existing.values()].reduce((a, b) => a + b, 0),
      types: existing.size,
      unassigned,
      pending: roomId ? waitingRooms.has(roomId) : false,
    };
  });

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
      <p className="text-sm font-bold text-teal-300">بعد جرد الغرفة</p>
      <h1 className="mt-2 text-3xl font-black">سند تسليم خاص بالعهدة الشخصية</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-200">اختر الموظف ثم اطبع سند العهدة المسجلة له حاليًا بالقالب المعتمد. لا حاجة لتسليم المواد نفسها مرة أخرى أو إعادة احتسابها.</p>
      <Link href="/locations" className="mt-5 inline-block rounded-xl bg-teal-500 px-5 py-3 text-sm font-extrabold text-white">فتح الغرف والجرد</Link>
    </header>

    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-2xl border bg-white p-4"><strong className="text-teal-800">1. جرد الغرفة</strong><p className="mt-1 text-sm text-slate-600">سجل الموجود والمفقود.</p></div>
      <div className="rounded-2xl border bg-white p-4"><strong className="text-teal-800">2. اعتمد الفروقات</strong><p className="mt-1 text-sm text-slate-600">انقل المفقود ولا تخصمه من العهدة.</p></div>
      <div className="rounded-2xl border bg-white p-4"><strong className="text-teal-800">3. اطبع السند</strong><p className="mt-1 text-sm text-slate-600">بنموذج سند التسليم الأصلي.</p></div>
    </section>

    {query.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{query.error}</p>}

    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="border-b p-5"><h2 className="text-xl font-extrabold">الموظفون وعهدتهم الحالية</h2><p className="mt-1 text-sm text-slate-500">طباعة العهدة السابقة لا تغيّر الأرصدة؛ أما إضافة المواد الجديدة فتتطلب موافقتك وتُسجل حركة تسليم رسمية قبل طباعة سند شامل.</p></div>
      <div className="divide-y divide-slate-100">
        {rows.map(({ employee, assignment, pieces, types, unassigned, pending }) =>
          <article key={employee.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <strong className="text-lg text-slate-900">{employee.fullName}</strong>
              <p className="mt-1 text-sm text-slate-500">{assignment?.location.name ?? "لم تُربط غرفة"} • {employee.employeeNo ?? "بلا رقم وظيفي"}</p>
              <p className="mt-1 text-sm font-bold text-emerald-800">العهدة الحالية: {types} صنف، {pieces} قطعة</p>
              {pending && <p className="mt-2 text-xs font-bold text-amber-800">توجد حركات جرد معلقة؛ اعتمدها أولًا</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              {assignment && <RoomCustodyActions
                employeeId={employee.id}
                roomId={assignment.locationId}
                heldPieces={pieces}
                unassignedPieces={unassigned}
                blocked={pending}
              />}
              {assignment && <Link href={`/locations/${assignment.locationId}/audit`} className="rounded-xl border border-teal-300 px-4 py-3 text-sm font-bold text-teal-800">جرد الغرفة</Link>}
              {!assignment && <Link href="/employees" className="rounded-xl border px-4 py-3 text-sm font-bold">تحديد الغرفة</Link>}
            </div>
          </article>,
        )}
        {rows.length === 0 && <p className="p-8 text-center text-slate-500">لا يوجد موظفون مسجلون.</p>}
      </div>
    </section>
  </div>;
}
