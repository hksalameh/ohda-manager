import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import {
  createCustodyDraftFromRoom,
  createEmployee,
  updateEmployee,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const center = await getCurrentCenter();
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;
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

  const linkedEmployees = employees.filter((employee) => employee.locationAssignments.length > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold text-blue-700">البيانات الأساسية</p>
          <h2 className="mt-1 text-2xl font-extrabold text-slate-900">الموظفون والعهد الشخصية</h2>
          <p className="mt-2 text-sm text-slate-500">اختر الموظف من الجدول وعدّل الاسم أو الرقم الوظيفي أو الوظيفة أو الغرفة مباشرة، ثم احفظ السطر.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700">الموظفون: {employees.length}</span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 font-bold text-emerald-800">مرتبطون بغرف: {linkedEmployees}</span>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">إضافة موظف جديد</h3>
            <p className="mt-1 text-xs text-slate-500">يمكن ترك الرقم الوظيفي والغرفة فارغين وإكمالهما لاحقًا من الجدول.</p>
          </div>
        </div>
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
          <div className="md:col-span-2 xl:col-span-4 flex justify-end">
            <button type="submit" className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">إضافة الموظف</button>
          </div>
        </form>
      </section>

      {employees.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">لم تتم إضافة الموظفين بعد</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">يمكن إضافة موظفي المركز الحالي وربطهم بالمواقع دون إعادة إدخال أي مادة.</p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <h3 className="font-bold text-slate-900">جدول الموظفين</h3>
            <p className="mt-1 text-xs text-slate-500">كل سطر مستقل؛ عدّل البيانات ثم اضغط حفظ في نفس السطر.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="w-12 px-3 py-3 text-center font-semibold">#</th>
                  <th className="min-w-64 px-3 py-3 text-right font-semibold">اسم الموظف</th>
                  <th className="min-w-36 px-3 py-3 text-right font-semibold">الرقم الوظيفي</th>
                  <th className="min-w-52 px-3 py-3 text-right font-semibold">الوظيفة</th>
                  <th className="min-w-56 px-3 py-3 text-right font-semibold">الغرفة / الموقع</th>
                  <th className="min-w-80 px-3 py-3 text-center font-semibold">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee, index) => {
                  const currentLocation = employee.locationAssignments[0]?.location;
                  const formId = `employee-${employee.id}`;
                  return (
                    <tr key={employee.id} className="align-middle hover:bg-blue-50/40">
                      <td className="px-3 py-3 text-center text-xs font-bold text-slate-400">{index + 1}</td>
                      <td className="px-3 py-3">
                        <form id={formId} action={updateEmployee}>
                          <input type="hidden" name="employeeId" value={employee.id} />
                          <input
                            name="fullName"
                            required
                            defaultValue={employee.fullName}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </form>
                      </td>
                      <td className="px-3 py-3">
                        <input form={formId} name="employeeNo" defaultValue={employee.employeeNo ?? ""} placeholder="بدون رقم" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-3 py-3">
                        <input form={formId} name="jobTitle" defaultValue={employee.jobTitle ?? ""} placeholder="المسمى الوظيفي" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-blue-500" />
                      </td>
                      <td className="px-3 py-3">
                        <select form={formId} name="locationId" defaultValue={currentLocation?.id ?? ""} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                          <option value="">بدون غرفة محددة</option>
                          {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button form={formId} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">حفظ</button>
                          <Link href={`/employees/${employee.id}`} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100">فتح العهدة</Link>
                          <form action={createCustodyDraftFromRoom}>
                            <input type="hidden" name="employeeId" value={employee.id} />
                            <button disabled={!currentLocation} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300">إنشاء سند</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
