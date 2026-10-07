import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { createLocation, updateLocation } from "./actions";

export const dynamic = "force-dynamic";

const typeLabels = {
  ROOM: "غرفة",
  OFFICE: "مكتب",
  DEPARTMENT: "قسم",
  STORE: "مستودع",
  HALL: "قاعة",
  OTHER: "أخرى",
} as const;

export default async function LocationsPage() {
  const center = await getCurrentCenter();
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;
  }

  const [locations, assignments, balances] = await Promise.all([
    prisma.location.findMany({
      where: { centerId: center.id, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.employeeLocationAssignment.findMany({
      where: {
        endsAt: null,
        isPrimary: true,
        location: { centerId: center.id, active: true },
        employee: { active: true },
      },
      select: { locationId: true },
    }),
    getCenterInventoryBalances(center.id),
  ]);

  const employeeCounts = new Map<string, number>();
  for (const assignment of assignments) {
    employeeCounts.set(assignment.locationId, (employeeCounts.get(assignment.locationId) ?? 0) + 1);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold text-blue-700">البيانات الأساسية</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">الغرف والمواقع</h2>
          <p className="mt-2 text-sm text-slate-500">جدول واحد لتعديل اسم الغرفة ورمزها ونوعها ومراجعة عدد الموظفين والقطع الموجودة فيها.</p>
        </div>
        <Link href="/items" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-center text-sm font-bold text-blue-800 hover:bg-blue-100">فتح مركز المواد</Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h3 className="font-bold text-slate-900">إضافة غرفة أو موقع</h3>
          <p className="mt-1 text-xs text-slate-500">أدخل الاسم فقط إن لم تكن بحاجة إلى رمز أو نوع مختلف.</p>
        </div>
        <form action={createLocation} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_180px_180px_auto]">
          <input name="name" required placeholder="اسم الغرفة أو الموقع" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <input name="code" placeholder="الرمز - اختياري" className="rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500" />
          <select name="type" defaultValue="ROOM" className="rounded-lg border border-slate-300 px-3 py-2.5">
            {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">إضافة</button>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
          <h3 className="font-bold text-slate-900">جدول الغرف والمواقع</h3>
          <p className="mt-1 text-xs text-slate-500">تعديل الاسم هنا يغيّر الاسم الظاهر في النظام بدون المساس بحركات المخزون السابقة.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="w-12 px-3 py-3 text-center font-semibold">#</th>
                <th className="min-w-64 px-3 py-3 text-right font-semibold">اسم الغرفة / الموقع</th>
                <th className="min-w-36 px-3 py-3 text-right font-semibold">الرمز</th>
                <th className="min-w-40 px-3 py-3 text-right font-semibold">النوع</th>
                <th className="px-3 py-3 text-center font-semibold">الموظفون</th>
                <th className="px-3 py-3 text-center font-semibold">القطع الحالية</th>
                <th className="w-28 px-3 py-3 text-center font-semibold">حفظ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {locations.map((location, index) => {
                const formId = `location-${location.id}`;
                return (
                  <tr key={location.id} className="hover:bg-blue-50/40">
                    <td className="px-3 py-3 text-center text-xs font-bold text-slate-400">{index + 1}</td>
                    <td className="px-3 py-3">
                      <form id={formId} action={updateLocation}>
                        <input type="hidden" name="locationId" value={location.id} />
                        <input name="name" required defaultValue={location.name} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
                      </form>
                    </td>
                    <td className="px-3 py-3">
                      <input form={formId} name="code" defaultValue={location.code ?? ""} placeholder="—" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                    </td>
                    <td className="px-3 py-3">
                      <select form={formId} name="type" defaultValue={location.type} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                        {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-700">{employeeCounts.get(location.id) ?? 0}</td>
                    <td className="px-3 py-3 text-center text-base font-extrabold text-emerald-800">{balances.locationTotals.get(location.id) ?? 0}</td>
                    <td className="px-3 py-3 text-center">
                      <button form={formId} className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">حفظ</button>
                    </td>
                  </tr>
                );
              })}
              {locations.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">لا توجد غرف أو مواقع بعد.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
