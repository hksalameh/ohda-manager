import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { addHistoricalReceiptSource, updateItem } from "../actions";

export const dynamic = "force-dynamic";

const movementLabels: Record<string, string> = {
  OPENING: "رصيد افتتاحي",
  RECEIPT: "إدخال",
  ISSUE: "إخراج",
  CUSTODY_ASSIGN: "تسليم عهدة",
  CUSTODY_RETURN: "إرجاع عهدة",
  TRANSFER: "نقل",
  ADJUST_IN: "تسوية زيادة",
  ADJUST_OUT: "تسوية نقص",
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) notFound();

  const [item, locations, balances] = await Promise.all([
    prisma.item.findUnique({
      where: { id },
      include: {
        unit: true,
        openingLines: {
          where: { snapshot: { centerId: center.id } },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            snapshot: true,
            sourceLinks: {
              orderBy: { createdAt: "asc" },
              include: {
                historicalDocumentLine: {
                  include: {
                    document: { include: { counterparty: true } },
                  },
                },
              },
            },
          },
        },
        movements: {
          orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
          take: 100,
          include: {
            fromLocation: true,
            toLocation: true,
            fromEmployee: true,
            toEmployee: true,
            document: true,
          },
        },
      },
    }),
    prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } }),
    getCenterInventoryBalances(center.id),
  ]);

  if (!item) notFound();
  const opening = item.openingLines[0];
  const current = balances.itemTotals.get(item.id) ?? 0;
  const byLocation = balances.itemLocationTotals.get(item.id) ?? new Map<string, number>();
  const linkedOpening = opening?.sourceLinks.reduce((sum, link) => sum + link.quantity, 0) ?? 0;
  const unlinkedOpening = Math.max(0, (opening?.physicalQuantity ?? 0) - linkedOpening);
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-sm text-slate-500">{item.itemCode ?? "بدون رقم مادة"}</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{item.name}</h2>
        </div>
        <Link href="/items" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">العودة للمواد</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">الرصيد الحالي</p><p className="mt-2 text-3xl font-bold text-emerald-800">{current}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">الموجود في الجرد الافتتاحي</p><p className="mt-2 text-3xl font-bold">{opening?.physicalQuantity ?? "—"}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">موثق بمصادر تاريخية</p><p className="mt-2 text-3xl font-bold text-blue-800">{linkedOpening}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">مصدره غير موثق بعد</p><p className="mt-2 text-3xl font-bold text-amber-700">{unlinkedOpening}</p></article>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">أماكن وجود المادة حالياً</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map((location) => {
            const quantity = byLocation.get(location.id) ?? 0;
            if (quantity <= 0) return null;
            return <div key={location.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><span className="font-medium">{location.name}</span><span className="rounded-full bg-slate-100 px-3 py-1 font-bold">{quantity}</span></div>;
          })}
          {[...byLocation.values()].every((quantity) => quantity <= 0) ? <p className="text-sm text-slate-500">لا توجد كمية حالية في أي موقع.</p> : null}
        </div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-bold text-slate-900">تعديل تعريف المادة</summary>
        <form action={updateItem} className="mt-5 grid gap-4 md:grid-cols-2">
          <input type="hidden" name="itemId" value={item.id} />
          <label className="text-sm font-medium text-slate-700">رقم المادة<input name="itemCode" defaultValue={item.itemCode ?? ""} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">اسم المادة<input name="name" required defaultValue={item.name} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">الوحدة<input name="unitName" defaultValue={item.unit?.name ?? "قطعة"} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700">صفحة الدفتر<input name="legacyLedgerPageNo" defaultValue={item.legacyLedgerPageNo ?? ""} className={inputClass} /></label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">ملاحظات<textarea name="notes" rows={3} defaultValue={item.notes ?? ""} className={inputClass} /></label>
          <div className="md:col-span-2"><button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white">حفظ التعديلات</button></div>
        </form>
      </details>

      {opening ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="font-bold text-slate-900">مصادر الرصيد القديم من الدفتر اليدوي</h3>
            <p className="mt-2 text-sm leading-7 text-slate-500">يمكن إضافة سند إدخال قديم وربط جزء من رصيد 31/12/2025 به من دون زيادة الرصيد الحالي مرة ثانية.</p>
          </div>

          {opening.sourceLinks.length > 0 ? (
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[750px] w-full text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-right">رقم السند</th><th className="px-3 py-2 text-right">التاريخ</th><th className="px-3 py-2 text-right">المصدر</th><th className="px-3 py-2 text-center">كمية السند الأصلية</th><th className="px-3 py-2 text-center">المرتبط برصيد البداية</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {opening.sourceLinks.map((link) => {
                    const line = link.historicalDocumentLine;
                    const doc = line.document;
                    return <tr key={link.id}><td className="px-3 py-2">{doc.documentNo ?? "—"}</td><td className="px-3 py-2">{doc.documentDate.toLocaleDateString("ar-JO")}</td><td className="px-3 py-2">{doc.counterparty?.name ?? "—"}</td><td className="px-3 py-2 text-center">{line.quantity}</td><td className="px-3 py-2 text-center font-bold">{link.quantity}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">لم يتم ربط أي سند تاريخي بهذه المادة بعد.</p>}

          {unlinkedOpening > 0 ? (
            <details className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <summary className="cursor-pointer font-bold text-amber-950">+ إضافة سند إدخال تاريخي من الدفتر</summary>
              <form action={addHistoricalReceiptSource} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <input type="hidden" name="itemId" value={item.id} />
                <label className="text-sm font-medium text-slate-700">رقم سند الإدخال<input name="documentNo" className={inputClass} /></label>
                <label className="text-sm font-medium text-slate-700">تاريخ السند<input name="documentDate" type="date" max="2025-12-31" required className={inputClass} /></label>
                <label className="text-sm font-medium text-slate-700">المورد / الجهة التي أحضرت منها<input name="sourceName" className={inputClass} /></label>
                <label className="text-sm font-medium text-slate-700">الكمية الأصلية في السند<input name="originalQuantity" type="number" min={1} required className={inputClass} /></label>
                <label className="text-sm font-medium text-slate-700">كمية من رصيد البداية مرتبطة بهذا السند<input name="linkedQuantity" type="number" min={1} max={unlinkedOpening} defaultValue={Math.min(unlinkedOpening, 1)} required className={inputClass} /><span className="mt-1 block text-xs text-slate-500">المتبقي غير الموثق: {unlinkedOpening}</span></label>
                <label className="text-sm font-medium text-slate-700">سعر الوحدة بالدينار (إن وجد)<input name="unitPriceJod" inputMode="decimal" placeholder="0.000" className={inputClass} /></label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2 lg:col-span-3">ملاحظات<textarea name="notes" rows={2} className={inputClass} /></label>
                <div className="md:col-span-2 lg:col-span-3"><button className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-800">حفظ السند التاريخي وربطه برصيد البداية</button></div>
              </form>
            </details>
          ) : <p className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">تم توثيق مصدر كامل رصيد البداية لهذه المادة.</p>}
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">سجل حركة المادة</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2 text-right">التاريخ</th><th className="px-3 py-2 text-right">الحركة</th><th className="px-3 py-2 text-center">الكمية</th><th className="px-3 py-2 text-right">من</th><th className="px-3 py-2 text-right">إلى</th><th className="px-3 py-2 text-right">المستند</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {item.movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{movement.movementDate.toLocaleDateString("ar-JO")}</td>
                  <td className="px-3 py-2 font-medium">{movementLabels[movement.movementType] ?? movement.movementType}</td>
                  <td className="px-3 py-2 text-center font-bold">{movement.quantity}</td>
                  <td className="px-3 py-2">{movement.fromEmployee?.fullName ?? movement.fromLocation?.name ?? "—"}</td>
                  <td className="px-3 py-2">{movement.toEmployee?.fullName ?? movement.toLocation?.name ?? "—"}</td>
                  <td className="px-3 py-2">{movement.document ? <Link href={`/documents/${movement.document.id}`} className="text-blue-700 underline">{movement.document.documentNo ?? "فتح المستند"}</Link> : "جرد افتتاحي"}</td>
                </tr>
              ))}
              {item.movements.length === 0 ? <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">لا توجد حركات لهذه المادة.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
