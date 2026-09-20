import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function StatCard({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
      {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

export default async function HomePage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });

  if (!center) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-bold text-amber-950">قاعدة البيانات جاهزة، لكن بيانات الرمثا لم تُستورد بعد</h2>
        <p className="mt-2 text-sm leading-7 text-amber-900">
          بعد استيراد ملف عهدة الرمثا سيظهر هنا ملخص المواد والمواقع والجرد الافتتاحي بتاريخ 31/12/2025.
        </p>
      </section>
    );
  }

  const [itemCount, locationCount, employeeCount, latestSnapshot, latestBatch] = await Promise.all([
    prisma.item.count({ where: { active: true } }),
    prisma.location.count({ where: { centerId: center.id, active: true } }),
    prisma.employee.count({ where: { centerId: center.id, active: true } }),
    prisma.openingSnapshot.findFirst({
      where: { centerId: center.id },
      orderBy: { snapshotDate: "desc" },
      include: { lines: true },
    }),
    prisma.importBatch.findFirst({
      where: { centerId: center.id },
      orderBy: { importedAt: "desc" },
    }),
  ]);

  const physicalTotal = latestSnapshot?.lines.reduce((sum, line) => sum + line.physicalQuantity, 0) ?? 0;
  const bookTotal = latestSnapshot?.lines.reduce((sum, line) => sum + line.bookBalance, 0) ?? 0;
  const openingDate = latestSnapshot
    ? latestSnapshot.snapshotDate.toLocaleDateString("ar-JO", { timeZone: "UTC" })
    : "-";

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-slate-900">لوحة المتابعة</h2>
        <p className="mt-2 text-sm text-slate-500">ملخص أولي لمركز {center.name}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="عدد المواد" value={itemCount} />
        <StatCard title="المواقع والغرف" value={locationCount} />
        <StatCard title="الموجود عند الجرد" value={physicalTotal} note={`تاريخ الجرد: ${openingDate}`} />
        <StatCard title="الرصيد الدفتري القديم" value={bookTotal} note="محفوظ منفصلاً عن الموجود الفعلي" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">حالة الاستيراد</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">الصفوف</p>
              <p className="mt-1 text-lg font-bold">{latestBatch?.totalRows ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">المستورد</p>
              <p className="mt-1 text-lg font-bold">{latestBatch?.importedRows ?? 0}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <p className="text-amber-700">تحذيرات</p>
              <p className="mt-1 text-lg font-bold text-amber-950">{latestBatch?.warningRows ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-slate-500">الموظفون</p>
              <p className="mt-1 text-lg font-bold">{employeeCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">الوصول السريع</h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Link href="/items" className="rounded-xl border border-slate-200 p-4 text-center font-medium hover:bg-slate-50">
              عرض المواد
            </Link>
            <Link href="/locations" className="rounded-xl border border-slate-200 p-4 text-center font-medium hover:bg-slate-50">
              عرض الغرف
            </Link>
            <Link href="/employees" className="rounded-xl border border-slate-200 p-4 text-center font-medium hover:bg-slate-50">
              الموظفون
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
