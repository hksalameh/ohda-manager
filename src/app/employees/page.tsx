import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  changeEmployeePrimaryLocation,
  createCustodyDraftFromRoom,
  createEmployee,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">الموظفون</h2>
        <p className="mt-2 text-sm text-slate-500">أضف الموظف واربطه بالغرفة، ثم يمكن إنشاء مسودة عهدته من المواد الموجودة فيها.</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">إضافة موظف</h3>
        <form action={createEmployee} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium text-slate-700">
            اسم الموظف
            <input name="fullName" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" placeholder="الاسم الكامل" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            الرقم الوظيفي
            <input name="employeeNo" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" placeholder="اختياري" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            المسمى الوظيفي
            <input name="jobTitle" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-500" placeholder="اختياري" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            الغرفة / الموقع
            <select name="locationId" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              <option value="">غير محدد الآن</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <div className="md:col-span-2 xl:col-span-4">
            <button type="submit" className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">حفظ الموظف</button>
          </div>
        </form>
      </section>

      {employees.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">لم تتم إضافة الموظفين بعد</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">بيانات Excel تحدد أماكن المواد، ويمكن الآن إضافة الموظفين وربطهم بهذه المواقع دون إعادة إدخال أي مادة.</p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {employees.map((employee) => {
            const currentLocation = employee.locationAssignments[0]?.location;
            return (
              <article key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{employee.fullName}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {employee.employeeNo ? `رقم وظيفي: ${employee.employeeNo}` : "لا يوجد رقم وظيفي"}
                      {employee.jobTitle ? ` • ${employee.jobTitle}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{currentLocation?.name ?? "غير مرتبط بموقع"}</span>
                </div>

                <form action={changeEmployeePrimaryLocation} className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <select name="locationId" required defaultValue={currentLocation?.id ?? ""} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="" disabled>اختر الغرفة / الموقع</option>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                  <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">تحديث الموقع</button>
                </form>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <form action={createCustodyDraftFromRoom}>
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <button disabled={!currentLocation} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white enabled:hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">إنشاء مسودة عهدة من الغرفة</button>
                  </form>
                  <Link href={`/employees/${employee.id}`} className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-center text-sm font-bold text-blue-800 hover:bg-blue-100">تفاصيل العهدة والإرجاع</Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
