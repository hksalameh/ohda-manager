import Link from "next/link";
import { DocumentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.trim() : "";
}

function parseStocktakeNote(note: string | null) {
  if (!note) return null;
  const match = note.match(/\[STOCKTAKE system=(\d+) actual=(\d+)\]/);
  if (!match) return null;
  return { system: Number(match[1]), actual: Number(match[2]) };
}

function startDate(input: string) {
  return input ? new Date(`${input}T00:00:00`) : null;
}

function endDate(input: string) {
  return input ? new Date(`${input}T23:59:59.999`) : null;
}

export default async function AdjustmentsReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fromText = value(params.from);
  const toText = value(params.to);
  const locationId = value(params.locationId);
  const statusText = value(params.status);
  const q = value(params.q).toLowerCase();
  const status = (Object.values(DocumentStatus) as string[]).includes(statusText) ? statusText as DocumentStatus : null;
  const from = startDate(fromText);
  const to = endDate(toText);

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;

  const locations = await prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } });
  const where: Prisma.InventoryDocumentWhereInput = {
    centerId: center.id,
    documentType: "ADJUSTMENT",
    ...(status ? { status } : {}),
    ...(locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {}),
    ...(from || to ? { documentDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const documents = await prisma.inventoryDocument.findMany({
    where,
    include: {
      fromLocation: true,
      toLocation: true,
      lines: { include: { item: true }, orderBy: { lineNo: "asc" } },
    },
    orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
  });

  const rows = documents.flatMap((document) => document.lines.map((line) => {
    const stocktake = parseStocktakeNote(line.notes);
    const isIncrease = Boolean(document.toLocationId && !document.fromLocationId);
    const location = document.toLocation?.name ?? document.fromLocation?.name ?? "—";
    return {
      id: line.id,
      documentId: document.id,
      documentNo: document.documentNo ?? "—",
      date: document.documentDate,
      status: document.status,
      location,
      isIncrease,
      itemCode: line.itemCodeSnapshot ?? line.item.itemCode,
      itemName: line.itemNameSnapshot,
      system: stocktake?.system ?? null,
      actual: stocktake?.actual ?? null,
      difference: isIncrease ? line.quantity : -line.quantity,
    };
  })).filter((row) => !q || `${row.itemCode ?? ""} ${row.itemName} ${row.location} ${row.documentNo}`.toLowerCase().includes(q));

  const totalIncrease = rows.reduce((sum, row) => sum + (row.difference > 0 ? row.difference : 0), 0);
  const totalDecrease = rows.reduce((sum, row) => sum + (row.difference < 0 ? Math.abs(row.difference) : 0), 0);
  const statusLabels: Record<DocumentStatus, string> = { DRAFT: "مسودة", POSTED: "معتمد", CANCELLED: "ملغي" };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm text-slate-500">التقارير</p><h2 className="mt-1 text-2xl font-bold text-slate-900">فروقات الجرد والتسويات</h2></div>
        <div className="flex gap-2"><PrintButton label="طباعة الفروقات" /><Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">كل التقارير</Link></div>
      </div>

      <form className="no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">من تاريخ<input name="from" type="date" defaultValue={fromText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">إلى تاريخ<input name="to" type="date" defaultValue={toText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">الموقع<select name="locationId" defaultValue={locationId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">كل المواقع</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">الحالة<select name="status" defaultValue={status ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">كل الحالات</option>{Object.values(DocumentStatus).map((candidate) => <option key={candidate} value={candidate}>{statusLabels[candidate]}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">بحث<input name="q" defaultValue={value(params.q)} placeholder="مادة، موقع، رقم مرجع" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="lg:col-span-5"><button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">تطبيق البحث</button></div>
      </form>

      <section className="print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-5 border-b border-slate-200 pb-4 text-center"><p className="text-sm font-bold">جمعية المركز الإسلامي الخيرية</p><h3 className="mt-1 text-xl font-bold">تقرير فروقات الجرد والتسويات</h3><p className="mt-1 text-sm text-slate-600">مركز الرمثا • تاريخ الطباعة {new Date().toLocaleDateString("ar-JO")}</p></header>
        <div className="mb-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">عدد الفروقات</span><div className="mt-1 text-xl font-bold">{rows.length}</div></div><div className="rounded-xl bg-emerald-50 p-3 text-sm"><span className="text-emerald-700">إجمالي الزيادة</span><div className="mt-1 text-xl font-bold text-emerald-900">+{totalIncrease}</div></div><div className="rounded-xl bg-amber-50 p-3 text-sm"><span className="text-amber-700">إجمالي النقص</span><div className="mt-1 text-xl font-bold text-amber-900">-{totalDecrease}</div></div></div>
        <div className="overflow-x-auto"><table className="min-w-[950px] w-full border-collapse text-xs print:min-w-0"><thead><tr className="bg-slate-100"><th className="border border-slate-300 px-2 py-2">التاريخ</th><th className="border border-slate-300 px-2 py-2">مرجع الجرد</th><th className="border border-slate-300 px-2 py-2 text-right">الموقع</th><th className="border border-slate-300 px-2 py-2 text-right">رقم المادة</th><th className="border border-slate-300 px-2 py-2 text-right">المادة</th><th className="border border-slate-300 px-2 py-2">المسجل قبل الجرد</th><th className="border border-slate-300 px-2 py-2">الموجود فعلياً</th><th className="border border-slate-300 px-2 py-2">الفرق</th><th className="border border-slate-300 px-2 py-2">الحالة</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className="border border-slate-300 px-2 py-2 whitespace-nowrap text-center">{row.date.toLocaleDateString("ar-JO")}</td><td className="border border-slate-300 px-2 py-2 text-center">{row.documentNo}</td><td className="border border-slate-300 px-2 py-2">{row.location}</td><td className="border border-slate-300 px-2 py-2 font-mono">{row.itemCode ?? "—"}</td><td className="border border-slate-300 px-2 py-2 font-medium">{row.itemName}</td><td className="border border-slate-300 px-2 py-2 text-center">{row.system ?? "—"}</td><td className="border border-slate-300 px-2 py-2 text-center">{row.actual ?? "—"}</td><td className={`border border-slate-300 px-2 py-2 text-center font-bold ${row.difference > 0 ? "text-emerald-800" : "text-amber-800"}`}>{row.difference > 0 ? `+${row.difference}` : row.difference}</td><td className="border border-slate-300 px-2 py-2 text-center">{statusLabels[row.status]}</td></tr>)}{rows.length === 0 ? <tr><td colSpan={9} className="border border-slate-300 px-4 py-6 text-center text-slate-500">لا توجد فروقات مطابقة.</td></tr> : null}</tbody></table></div>
      </section>
    </div>
  );
}
