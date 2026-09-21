import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

function Stat({ title, value, note, primary = false }: { title: string; value: string | number; note?: string; primary?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 shadow-sm ${primary ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
      <p className={`text-sm font-bold ${primary ? "text-blue-50" : "text-slate-500"}`}>{title}</p>
      <p className="mt-2 text-3xl font-extrabold">{value}</p>
      {note ? <p className={`mt-2 text-xs ${primary ? "text-blue-100" : "text-slate-500"}`}>{note}</p> : null}
    </div>
  );
}

export default async function HomePage() {
  const center = await getCurrentCenter();
  if (!center) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">لا يوجد مركز مفعّل بعد.</section>;

  const [itemCount, locationCount, employeeCount, documentCount, draftCount, snapshot, batch, balances] = await Promise.all([
    prisma.item.count({ where: { active: true } }),
    prisma.location.count({ where: { centerId: center.id, active: true } }),
    prisma.employee.count({ where: { centerId: center.id, active: true } }),
    prisma.inventoryDocument.count({ where: { centerId: center.id } }),
    prisma.inventoryDocument.count({ where: { centerId: center.id, status: "DRAFT" } }),
    prisma.openingSnapshot.findFirst({ where: { centerId: center.id }, orderBy: { snapshotDate: "desc" }, include: { lines: true } }),
    prisma.importBatch.findFirst({ where: { centerId: center.id }, orderBy: { importedAt: "desc" } }),
    getCenterInventoryBalances(center.id),
  ]);
  const physicalTotal = snapshot?.lines.reduce((sum, line) => sum + line.physicalQuantity, 0) ?? 0;
  const bookTotal = snapshot?.lines.reduce((sum, line) => sum + line.bookBalance, 0) ?? 0;
  const currentTotal = [...balances.itemTotals.values()].reduce((sum, quantity) => sum + quantity, 0);
  const openingDate = snapshot ? snapshot.snapshotDate.toLocaleDateString("ar-JO", { timeZone: "UTC" }) : "-";

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs text-slate-500">نظرة عامة على حركة العهدة والمخزون</p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-extrabold text-slate-900">الملخص العام - {center.name}</h2>
          <span className="text-sm text-slate-500">الجرد الافتتاحي: {openingDate}</span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat title="الرصيد الحالي" value={currentTotal} note="إجمالي القطع المتاحة حاليًا" primary />
        <Stat title="عدد المواد" value={itemCount} note="مواد فعالة في النظام" />
        <Stat title="الموجود عند الجرد" value={physicalTotal} note="حسب جرد 31/12/2025" />
        <Stat title="الرصيد الدفتري القديم" value={bookTotal} note="للمقارنة والمراجعة" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-bold text-slate-900">تفاصيل النظام</h3></div>
          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-3 xl:grid-cols-6">
            {[['الغرف والمواقع', locationCount], ['الموظفون', employeeCount], ['المستندات', documentCount], ['المسودات', draftCount], ['صفوف Excel', batch?.importedRows ?? 0], ['تحذيرات الاستيراد', batch?.warningRows ?? 0]].map(([label, number]) => (
              <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-extrabold text-slate-900">{number}</p></div>
            ))}
          </div>
        </div>
        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">إجراءات سريعة</h3>
          <div className="mt-4 grid gap-2">
            <Link href="/stocktake" className="rounded-lg bg-blue-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-blue-500">بدء جرد غرفة</Link>
            <Link href="/documents/new?type=receipt" className="rounded-lg bg-emerald-600 px-4 py-3 text-center text-sm font-bold text-white hover:bg-emerald-500">سند إدخال</Link>
            <Link href="/documents/new?type=issue" className="rounded-lg bg-amber-500 px-4 py-3 text-center text-sm font-bold text-white hover:bg-amber-400">سند إخراج</Link>
            <Link href="/custody" className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-800 hover:bg-blue-100">استعراض العُهد</Link>
            <Link href="/documents" className="rounded-lg border border-slate-300 px-4 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">كل المستندات</Link>
          </div>
        </aside>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">الوصول السريع</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {[['/items','المواد'],['/custody','العُهد'],['/stocktake','الجرد'],['/documents','المستندات'],['/reports','التقارير']].map(([href,label]) => (
            <Link key={href} href={href} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50">{label}</Link>
          ))}
        </div>
      </section>
    </div>
  );
}
