import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EmployeesPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">الموظفون</h2>
        <p className="mt-2 text-sm text-slate-500">سيتم ربط كل موظف بغرفته حتى يمكن إنشاء سند العهدة من محتويات الغرفة مباشرة.</p>
      </div>

      {employees.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">لم تتم إضافة الموظفين بعد</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            بيانات Excel الحالية تحدد أماكن المواد، أما أسماء الموظفين فستضاف لاحقاً ثم تربط بالغرف الموجودة دون إعادة إدخال المواد.
          </p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold">الرقم الوظيفي</th>
                  <th className="px-4 py-3 text-right font-semibold">اسم الموظف</th>
                  <th className="px-4 py-3 text-right font-semibold">المسمى الوظيفي</th>
                  <th className="px-4 py-3 text-right font-semibold">الموقع الحالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-4 py-3">{employee.employeeNo ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{employee.fullName}</td>
                    <td className="px-4 py-3">{employee.jobTitle ?? "—"}</td>
                    <td className="px-4 py-3">{employee.locationAssignments[0]?.location.name ?? "غير محدد"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
