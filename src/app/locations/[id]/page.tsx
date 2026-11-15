import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getAssignedCustodyTotalsAtLocation, getEmployeeCustodyBalances } from "@/lib/custody-query";
import { printCurrentEmployeeCustody } from "./custody-actions";
import { createCustodyDraftFromRoom } from "@/app/employees/actions";
import ClearAuditDraft from "./audit/review/clear-audit-draft";

export const dynamic = "force-dynamic";

export default async function RoomDetailsPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ audit?: string; error?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const center = await getCurrentCenter();
  if (!center) notFound();
  const room = await prisma.location.findFirst({ where: { id, centerId: center.id, active: true } });
  if (!room) notFound();
  if (room.code === "UNLOCATED") return <div><Link href="/locations/unlocated">فتح قائمة المواد غير محددة الموقع</Link></div>;

  const [balances, assigned, employees, pending] = await Promise.all([
    getCenterInventoryBalances(center.id),
    getAssignedCustodyTotalsAtLocation(room.id),
    prisma.employeeLocationAssignment.findMany({
      where: { locationId: room.id, endsAt: null, isPrimary: true, employee: { centerId: center.id, active: true } },
      include: { employee: true }, orderBy: { startsAt: "desc" },
    }),
    prisma.inventoryDocument.findMany({
      where: { centerId: center.id, status: "DRAFT", documentNo: { startsWith: "JRD-" }, OR: [{ fromLocationId: room.id }, { toLocationId: room.id }] },
      select: { id: true, documentNo: true, documentType: true }, take: 20,
    }),
  ]);
  const stock = [...balances.itemLocationTotals.entries()].map(([itemId, quantities]) => ({
    id: itemId, quantity: quantities.get(room.id) ?? 0,
  })).filter((row) => row.quantity > 0);
  const items = stock.length ? await prisma.item.findMany({
    where: { id: { in: stock.map((entry) => entry.id) } }, include: { unit: true }, orderBy: { name: "asc" },
  }) : [];
  const qty = new Map(stock.map((row) => [row.id, row.quantity]));
  const total = stock.reduce((sum, row) => sum + row.quantity, 0);
  const auditUrl = `/locations/${room.id}/audit`;
  const employeeCustody = await Promise.all(employees.map(async (assignment) => ({
    employeeId: assignment.employeeId,
    rows: (await getEmployeeCustodyBalances(assignment.employeeId)).filter((row) => row.locationId === room.id),
  })));
  const custodyByEmployee = new Map(employeeCustody.map(({ employeeId, rows }) => [
    employeeId, { types: rows.length, pieces: rows.reduce((sum, row) => sum + row.quantity, 0) },
  ]));
  const assignedPieces = [...assigned.values()].reduce((sum, quantity) => sum + quantity, 0);
  const availablePieces = Math.max(0, total - assignedPieces);

  return <div className="mx-auto max-w-6xl space-y-5">
    {(query.audit === "approved" || query.audit === "matched") && <ClearAuditDraft roomId={room.id}/>}
    <header className="rounded-3xl bg-slate-950 p-6 text-white md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-bold text-teal-300">الغرف والمواقع</p>
          <h1 className="mt-2 text-3xl font-black">{room.name}</h1>
          <p className="mt-2 text-sm text-slate-200">ابدأ بجرد الموجود والمفقود. بعد اعتماد الفروقات تستطيع طباعة سند الموظف من عهدته المسجلة، حتى إن لم توجد مواد جديدة للتسليم.</p>
        </div>
        <Link href="/locations" className="rounded-xl border border-white/30 px-4 py-2 text-sm font-bold text-white">كل الغرف</Link>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={auditUrl} className="rounded-xl bg-teal-500 px-6 py-3 text-base font-extrabold text-white hover:bg-teal-600">بدء جرد الغرفة</Link>
        <a href="#personal-custody" className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-slate-950 hover:bg-slate-100">طباعة سند عهدة الموظف</a>
        <Link href={`/documents/transfer?fromLocationId=${room.id}`} className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white">نقل مادة</Link>
        <Link href="/items" className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white">جميع المواد</Link>
      </div>
    </header>

    <section className="grid gap-3 md:grid-cols-3" aria-label="خطوات إكمال جرد الغرفة وطباعة العهدة">
      <Link href={auditUrl} className="rounded-2xl border border-teal-200 bg-teal-50 p-5 hover:border-teal-500"><strong className="block text-lg text-teal-950">1. جرد الموجود والمفقود</strong><p className="mt-2 text-sm leading-6 text-teal-900">افحص كل مادة، وأدخل العدد الموجود فعليًا في الغرفة.</p><span className="mt-3 inline-block font-extrabold text-teal-800">فتح الجرد</span></Link>
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5"><strong className="block text-lg text-blue-950">2. معالجة الفروقات</strong><p className="mt-2 text-sm leading-6 text-blue-900">انقل المفقود إلى غرفة أخرى أو إلى غير محدد الموقع، ثم اعتمد الحركات معًا.</p></div>
      <a href="#personal-custody" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 hover:border-emerald-500"><strong className="block text-lg text-emerald-950">3. طباعة سند العهدة</strong><p className="mt-2 text-sm leading-6 text-emerald-900">اطبع عهدة الموظف المسجلة دون إضافة تسليم ثانٍ أو تكرار الكميات.</p><span className="mt-3 inline-block font-extrabold text-emerald-800">الانتقال إلى الطباعة</span></a>
    </section>

    {query.audit === "matched" && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">الجرد مطابق لرصيد هذه الغرفة. لا تحتاج إلى نقل أو تسوية.</p>}
    {query.audit === "approved" && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">اعتمد الجرد بالكامل. أصبحت الكميات والمواقع محدثة، ويمكنك الآن إعداد سند تسليم الموظف.</p>}
    {query.error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">{query.error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">أنواع المواد</p><p className="mt-1 text-3xl font-black">{stock.length}</p></div>
      <div className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">القطع الحالية</p><p className="mt-1 text-3xl font-black">{total}</p></div>
      <div className="rounded-2xl border bg-white p-4"><p className="text-sm text-slate-500">الموظفون المرتبطون</p><p className="mt-1 text-3xl font-black">{employees.length}</p></div>
    </div>

    {pending.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <h2 className="font-extrabold text-amber-950">يوجد {pending.length} مستند جرد لم يُعتمد بعد</h2>
      <p className="mt-1 text-sm text-amber-900">اعتمد حركات النقل أولًا حتى تكون عهدة الموظف مبنية على الأرصدة الصحيحة.</p>
      <div className="mt-3 flex flex-wrap gap-2">{pending.map((doc) => <Link key={doc.id} href={doc.documentType === "TRANSFER" ? `/documents/transfer/${doc.id}` : `/documents/adjustment/${doc.id}`} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900">{doc.documentNo} • مراجعة</Link>)}</div>
    </section>}

    <section id="personal-custody" className="scroll-mt-4 rounded-2xl border-2 border-emerald-400 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-bold text-emerald-700">الخطوة الثالثة • بعد جرد الغرفة</p><h2 className="mt-1 text-2xl font-black text-slate-900">سند تسليم خاص بالعهدة الشخصية</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">إذا كانت المواد مسجلة بالفعل بعهدة الموظف، اطبع سندًا مطابقًا لعهدته الحالية. <strong>لا تحتاج إلى إنشاء عهدة جديدة</strong> ولا تتغير أي كمية بالطباعة.</p></div>
        <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-900">بعهدة الموظفين: {assignedPieces} قطعة • غير المعهود: {availablePieces}</span>
      </div>
      {pending.length > 0 && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">يجب اعتماد أو إلغاء مسودات الجرد قبل طباعة السند الحالي.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {employees.map((assignment) => {
          const held = custodyByEmployee.get(assignment.employeeId) ?? { types: 0, pieces: 0 };
          return <article key={assignment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <strong className="text-base text-slate-950">{assignment.employee.fullName}</strong>
            <p className="mt-1 text-xs text-slate-500">{assignment.employee.employeeNo || "بدون رقم وظيفي"} • عهدته الحالية: {held.types} صنف، {held.pieces} قطعة</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <form action={printCurrentEmployeeCustody}>
                <input type="hidden" name="employeeId" value={assignment.employeeId}/>
                <input type="hidden" name="roomId" value={room.id}/>
                <button disabled={pending.length > 0 || held.pieces === 0} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:opacity-40">طباعة سند العهدة الحالية</button>
              </form>
              {availablePieces > 0 && <form action={createCustodyDraftFromRoom}>
                <input type="hidden" name="employeeId" value={assignment.employeeId}/>
                <input type="hidden" name="returnTo" value={`/locations/${room.id}`}/>
                <button disabled={pending.length > 0} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700 disabled:opacity-40">تسليم مواد جديدة</button>
              </form>}
            </div>
            {held.pieces === 0 && <p className="mt-2 text-xs text-slate-500">لا توجد عهدة شخصية مسجلة لهذا الموظف هنا حاليًا.</p>}
          </article>;
        })}
      </div>
      {employees.length === 0 && <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">لا يوجد موظف مرتبط بالغرفة. <Link href="/employees" className="font-bold text-blue-700 underline">اربط موظفًا بالغرفة</Link>.</p>}
    </section>

    <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div><h2 className="text-xl font-extrabold text-slate-900">محتويات {room.name}</h2><p className="mt-1 text-xs text-slate-500">هذه الكميات من سجل الحركات المعتمدة، وليست تقديرًا يدويًا.</p></div>
        <Link href={auditUrl} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-bold text-white">جرد الموجود والمفقود</Link>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
        <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-right">المادة</th><th className="px-4 py-3 text-center">الموجود المسجل</th><th className="px-4 py-3 text-center">بعهدة موظفين</th><th className="px-4 py-3 text-center">إجراء</th></tr></thead>
        <tbody className="divide-y">{items.map((item) => <tr key={item.id}>
          <td className="px-4 py-4"><Link href={`/items/${item.id}`} className="font-extrabold text-slate-950 hover:text-teal-800">{item.name}</Link><p className="text-xs text-slate-500">{item.itemCode || "—"} • {item.unit?.name || "قطعة"}</p></td>
          <td className="px-4 py-4 text-center text-lg font-black text-teal-800">{qty.get(item.id)}</td>
          <td className="px-4 py-4 text-center">{assigned.get(item.id) ?? 0}</td>
          <td className="px-4 py-4 text-center"><Link href={auditUrl} className="text-sm font-bold text-teal-800 hover:underline">فحص هذه الغرفة</Link></td>
        </tr>)}
        {!items.length && <tr><td colSpan={4} className="p-8 text-center text-slate-500">لا توجد مواد مسجلة هنا. ابدأ الجرد لإضافة ما وجدته.</td></tr>}
        </tbody>
      </table></div>
      <Link href={auditUrl} className="block border-t bg-teal-50 p-4 text-center text-sm font-extrabold text-teal-900">+ إضافة مادة أثناء الجرد</Link>
    </section>

  </div>;
}
