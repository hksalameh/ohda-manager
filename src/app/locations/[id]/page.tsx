import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

export default async function RoomDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const center = await getCurrentCenter();
  if (!center) notFound();

  const location = await prisma.location.findFirst({
    where: { id, centerId: center.id, active: true },
  });
  if (!location) notFound();

  const [balances, assignments] = await Promise.all([
    getCenterInventoryBalances(center.id),
    prisma.employeeLocationAssignment.findMany({
      where: {
        locationId: location.id,
        endsAt: null,
        employee: { centerId: center.id, active: true },
      },
      include: { employee: true },
      orderBy: { startsAt: "desc" },
    }),
  ]);

  const roomItems = [...balances.itemLocationTotals.entries()]
    .map(([itemId, quantities]) => ({
      id: itemId,
      quantity: quantities.get(location.id) ?? 0,
    }))
    .filter((row) => row.quantity > 0);

  const records = roomItems.length
    ? await prisma.item.findMany({
        where: { id: { in: roomItems.map((row) => row.id) } },
        include: { unit: true },
        orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      })
    : [];
  const qtyById = new Map(roomItems.map((row) => [row.id, row.quantity]));
  const totalQuantity = roomItems.reduce((total, row) => total + row.quantity, 0);
  const stocktakeUrl = `/stocktake?locationId=${encodeURIComponent(location.id)}`;
  const transferUrl = `/documents/transfer?fromLocationId=${encodeURIComponent(location.id)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-blue-700">الغرف والمواقع / تفاصيل الغرفة</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">{location.name}</h2>
          <p className="mt-2 text-sm text-slate-500">
            هذه هي المواد المسجلة فعلياً في الغرفة. يمكنك جردها أو إضافة مواد أو نقلها إلى غرفة أخرى.
          </p>
        </div>
        <Link href="/locations" className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold">العودة إلى الغرف</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">أنواع المواد</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{roomItems.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">إجمالي القطع</p>
          <p className="mt-2 text-2xl font-bold text-emerald-800">{totalQuantity}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 md:col-span-1">
          <p className="text-sm text-slate-500">الموظفون المرتبطون بالغرفة</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{assignments.length}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={stocktakeUrl} className="rounded-xl bg-blue-700 px-5 py-4 text-center text-sm font-bold text-white hover:bg-blue-800">جرد الغرفة وتعديل الكميات</Link>
        <Link href={`${stocktakeUrl}#add-room-items`} className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-center text-sm font-bold text-blue-900 hover:bg-blue-100">إضافة أثاث أو مادة إلى الغرفة</Link>
        <Link href={transferUrl} className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-center text-sm font-bold text-amber-900 hover:bg-amber-100">نقل مادة لغرفة ثانية</Link>
        <Link href="/items/new" className="rounded-xl border border-slate-300 bg-white px-5 py-4 text-center text-sm font-bold text-slate-800 hover:bg-slate-50">تسجيل مادة جديدة في الدليل</Link>
      </section>
      <p className="text-xs leading-6 text-slate-600">
        عند الجرد يمكنك اختيار مادة موجودة من الدليل أو إنشاء مادة جديدة. أي فرق في الكمية يُنشأ كمسودة تسوية للمراجعة؛ لا يُعتمد تلقائياً.
      </p>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <h3 className="font-bold text-slate-900">محتويات {location.name}</h3>
          <Link href={stocktakeUrl} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">مطابقة الموجود فعلياً</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-right">رقم المادة</th>
                <th className="px-4 py-3 text-right">اسم المادة</th>
                <th className="px-4 py-3 text-right">الوحدة</th>
                <th className="px-4 py-3 text-center">العدد</th>
                <th className="px-4 py-3 text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-xs text-slate-500">{item.itemCode ?? "—"}</td>
                  <td className="px-4 py-3 font-bold">
                    <Link href={`/items/${item.id}`} className="text-blue-800 hover:underline">{item.name}</Link>
                  </td>
                  <td className="px-4 py-3">{item.unit?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-bold text-emerald-800">{qtyById.get(item.id)}</td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      href={`${transferUrl}&itemId=${encodeURIComponent(item.id)}`}
                      className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-50"
                    >نقل</Link>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">لا توجد مواد مسجلة لهذه الغرفة. ابدأ الجرد لإضافتها.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-3">
          <h3 className="font-bold text-slate-900">الموظفون المرتبطون بالغرفة</h3>
          <Link href="/employees" className="text-sm font-bold text-blue-800 hover:underline">إدارة الموظفين</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {assignments.map((assignment) => (
            <Link key={assignment.id} href={`/employees/${assignment.employeeId}`}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium hover:bg-blue-50">
              {assignment.employee.fullName}
            </Link>
          ))}
          {assignments.length === 0 && <p className="text-sm text-slate-500">لا يوجد موظف مرتبط بالغرفة حالياً.</p>}
        </div>
      </section>
    </div>
  );
}
