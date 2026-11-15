import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const center = await getCurrentCenter();
  if (!center) return <p>لا يوجد مركز مفعّل.</p>;

  const [locations, balances, employees] = await Promise.all([
    prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } }),
    getCenterInventoryBalances(center.id),
    prisma.employeeLocationAssignment.findMany({
      where: { endsAt: null, employee: { centerId: center.id, active: true } },
      include: { employee: { select: { id: true, fullName: true } } },
    }),
  ]);

  const unlocated = locations.find((location) => location.code === "UNLOCATED");
  const rooms = locations.filter((location) => location.code !== "UNLOCATED");
  const counts = new Map<string, { pieces: number; types: number }>();
  for (const location of locations) counts.set(location.id, { pieces: 0, types: 0 });
  for (const quantities of balances.itemLocationTotals.values()) {
    for (const [id, quantity] of quantities) {
      if (quantity <= 0) continue;
      const row = counts.get(id);
      if (row) { row.types += 1; row.pieces += quantity; }
    }
  }
  const names = new Map<string, string[]>();
  for (const a of employees) names.set(a.locationId, [...(names.get(a.locationId) ?? []), a.employee.fullName]);
  const pieces = rooms.reduce((total, room) => total + (counts.get(room.id)?.pieces ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg md:p-8">
        <p className="text-sm font-bold text-teal-300">إدارة العهدة • الغرف والمواقع</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">افتح الغرفة وابدأ الجرد</h1>
        <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-200">
          كل غرفة لها قائمة موادها. حدّد الموجود والمفقود، وانقل المفقود لغرفة أخرى أو إلى «غير محدد الموقع»، ثم جهّز سند العهدة من الموجود بعد اعتماد الحركات.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/items" className="rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-slate-900 hover:bg-slate-100">جميع المواد وأماكنها</Link>
          <Link href="/locations/manage" className="rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10">إضافة أو تعديل غرفة</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">الغرف والمواقع</p><strong className="mt-1 block text-3xl">{rooms.length}</strong></div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">القطع المسجلة في الغرف</p><strong className="mt-1 block text-3xl">{pieces}</strong></div>
        <Link href={unlocated ? `/locations/${unlocated.id}` : "/locations/unlocated"} className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm hover:bg-amber-100">
          <p className="text-sm font-bold text-amber-900">مواد بانتظار تحديد موقعها</p>
          <strong className="mt-1 block text-3xl text-amber-950">{unlocated ? counts.get(unlocated.id)?.pieces ?? 0 : 0}</strong>
          <span className="mt-1 block text-xs text-amber-800">فتح المواد غير محددة الموقع</span>
        </Link>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-slate-900">الغرف المسجلة</h2>
          <span className="text-xs text-slate-500">اضغط على الغرفة لعرض موادها</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rooms.map((room) => {
            const quantity = counts.get(room.id);
            const people = names.get(room.id) ?? [];
            return <article key={room.id} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-400 hover:shadow-md">
              <Link href={`/locations/${room.id}`} className="block">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-xl font-black text-slate-900 group-hover:text-teal-800">{room.name}</h3>
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">{room.code || "غرفة"}</span>
                </div>
                <p className="mt-3 line-clamp-1 text-xs text-slate-500">{people.length ? people.join("، ") : "لا يوجد موظف مرتبط بهذه الغرفة"}</p>
                <div className="mt-5 flex items-center gap-6 border-t pt-4 text-sm">
                  <span><strong className="text-lg text-slate-950">{quantity?.types ?? 0}</strong> نوع مادة</span>
                  <span><strong className="text-lg text-slate-950">{quantity?.pieces ?? 0}</strong> قطعة</span>
                </div>
              </Link>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/locations/${room.id}/audit`} className="rounded-xl bg-teal-700 px-3 py-3 text-center text-sm font-extrabold text-white hover:bg-teal-800">جرد الغرفة</Link>
                <Link href={`/locations/${room.id}`} className="rounded-xl border border-slate-300 px-3 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">عرض المواد</Link>
              </div>
            </article>;
          })}
        </div>
        {rooms.length === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-slate-500">لا توجد غرف. أضف غرفة أولاً من زر «إضافة أو تعديل غرفة».</p> : null}
      </section>
    </div>
  );
}
