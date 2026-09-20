import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  discardCustodyDraft,
  discardStockDraft,
  postCustodyDocument,
  postStockDocument,
  saveCustodyDraft,
} from "./actions";

export const dynamic = "force-dynamic";

function money(fils: number | null) {
  return fils === null ? "—" : (fils / 1000).toFixed(3);
}

function statusBadge(status: DocumentStatus) {
  if (status === DocumentStatus.DRAFT) return "bg-amber-100 text-amber-900";
  if (status === DocumentStatus.POSTED) return "bg-emerald-100 text-emerald-900";
  return "bg-slate-100 text-slate-700";
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.inventoryDocument.findUnique({
    where: { id },
    include: {
      employee: true,
      center: true,
      fromLocation: true,
      toLocation: true,
      counterparty: true,
      receiptDetail: true,
      lines: { orderBy: { lineNo: "asc" }, include: { openingSourceLinks: true } },
    },
  });

  if (!document) notFound();

  if (document.documentType === DocumentType.CUSTODY) {
    const isDraft = document.status === DocumentStatus.DRAFT;
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm text-slate-500">سند عهدة شخصية</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-900">{document.employee?.fullName ?? "بدون موظف"}</h2>
            <p className="mt-2 text-sm text-slate-500">{document.toLocation?.name ?? document.fromLocation?.name ?? "الموقع غير محدد"} • {document.documentDate.toLocaleDateString("ar-JO")}</p>
          </div>
          <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusBadge(document.status)}`}>{isDraft ? "مسودة" : document.status === DocumentStatus.POSTED ? "معتمد" : "ملغي"}</span>
        </div>

        {isDraft ? <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">هذه مسودة تم إنشاؤها من المواد غير المعهود بها داخل غرفة الموظف. راجع المواد والكميات، أزل أي مادة لا تخص الموظف، ثم احفظ المسودة قبل اعتمادها.</section> : null}

        <form action={saveCustodyDraft} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <input type="hidden" name="documentId" value={document.id} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{isDraft ? <th className="px-3 py-3 text-center">ضمن السند</th> : null}<th className="px-4 py-3 text-right">رقم المادة</th><th className="min-w-80 px-4 py-3 text-right">المادة</th><th className="px-4 py-3 text-center">الكمية</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {document.lines.map((line) => <tr key={line.id}>{isDraft ? <td className="px-3 py-3 text-center"><input type="checkbox" name="includedLine" value={line.id} defaultChecked className="h-4 w-4" /></td> : null}<td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{line.itemCodeSnapshot ?? "—"}</td><td className="px-4 py-3 font-medium text-slate-900">{line.itemNameSnapshot}</td><td className="px-4 py-3 text-center">{isDraft ? <input type="number" min={1} max={line.quantity} name={`quantity:${line.id}`} defaultValue={line.quantity} className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-center" /> : <span className="font-bold">{line.quantity}</span>}</td></tr>)}
              </tbody>
            </table>
          </div>
          {isDraft ? <div className="border-t border-slate-200 p-4"><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50">حفظ تعديلات المسودة</button></div> : null}
        </form>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {isDraft ? <><form action={postCustodyDocument}><input type="hidden" name="documentId" value={document.id} /><button className="w-full rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto">اعتماد السند وتثبيت العهدة</button></form><form action={discardCustodyDraft}><input type="hidden" name="documentId" value={document.id} /><button className="w-full rounded-lg border border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 sm:w-auto">حذف المسودة</button></form></> : <Link href={`/documents/${document.id}/print`} className="rounded-lg bg-slate-900 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800">معاينة وطباعة سند العهدة</Link>}
          <Link href="/documents" className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium hover:bg-slate-50">العودة للمستندات</Link>
        </div>
      </div>
    );
  }

  const isHistorical = document.documentType === DocumentType.HISTORICAL_RECEIPT || document.documentType === DocumentType.HISTORICAL_ISSUE;
  if (isHistorical) {
    const isReceipt = document.documentType === DocumentType.HISTORICAL_RECEIPT;
    const totalFils = document.lines.reduce((sum, line) => sum + (line.totalValueFils ?? 0), 0);
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div><p className="text-sm text-blue-700">{isReceipt ? "سند إدخال تاريخي" : "سند إخراج تاريخي"}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{document.documentNo ? `رقم ${document.documentNo}` : "بدون رقم مستند"}</h2><p className="mt-2 text-sm text-slate-500">{document.documentDate.toLocaleDateString("ar-JO")} • {document.counterparty?.name ?? "الجهة غير محددة"}</p></div>
          <span className="w-fit rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900">تاريخي مرجعي</span>
        </div>
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-7 text-blue-950">هذا المستند محفوظ من الدفتر القديم بوضع مرجعي، لذلك لا يزيد ولا ينقص الرصيد الحالي. {isReceipt ? "الكميات في عمود «مرتبط برصيد البداية» توضح الجزء من موجود 31/12/2025 الذي تم توثيق مصدره بهذا السند." : "يستخدم لتوثيق الإخراج التاريخي فقط."}</section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 text-sm md:grid-cols-3"><div><span className="text-slate-500">المركز</span><div className="mt-1 font-bold">{document.center.name}</div></div><div><span className="text-slate-500">{isReceipt ? "المورد / المصدر" : "الجهة المصروف لها"}</span><div className="mt-1 font-bold">{document.counterparty?.name ?? "—"}</div></div><div><span className="text-slate-500">البيان</span><div className="mt-1 font-bold">{document.statement ?? "—"}</div></div></div></section>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-3 text-center">#</th><th className="px-4 py-3 text-right">رقم المادة</th><th className="px-4 py-3 text-right">المادة</th><th className="px-4 py-3 text-center">كمية السند الأصلية</th>{isReceipt ? <><th className="px-4 py-3 text-center">مرتبط برصيد البداية</th><th className="px-4 py-3 text-center">سعر الوحدة</th><th className="px-4 py-3 text-center">القيمة</th></> : null}</tr></thead><tbody className="divide-y divide-slate-100">{document.lines.map((line) => { const linked = line.openingSourceLinks.reduce((sum, link) => sum + link.quantity, 0); return <tr key={line.id}><td className="px-3 py-3 text-center">{line.lineNo}</td><td className="px-4 py-3 font-mono text-xs">{line.itemCodeSnapshot ?? "—"}</td><td className="px-4 py-3 font-medium">{line.itemNameSnapshot}</td><td className="px-4 py-3 text-center font-bold">{line.quantity}</td>{isReceipt ? <><td className="px-4 py-3 text-center font-bold text-blue-800">{linked}</td><td className="px-4 py-3 text-center">{money(line.unitPriceFils)}</td><td className="px-4 py-3 text-center">{money(line.totalValueFils)}</td></> : null}</tr>; })}</tbody>{isReceipt ? <tfoot className="bg-slate-50 font-bold"><tr><td colSpan={6} className="px-4 py-3 text-left">الإجمالي (د.أ)</td><td className="px-4 py-3 text-center">{money(totalFils)}</td></tr></tfoot> : null}</table></div></section>
        {document.notes ? <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><strong>ملاحظات:</strong> {document.notes}</section> : null}
        <div className="flex gap-3"><Link href="/documents" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">العودة للمستندات</Link><Link href="/documents/historical" className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white">إضافة مستند تاريخي آخر</Link></div>
      </div>
    );
  }

  const isStockForm = document.documentType === DocumentType.RECEIPT || document.documentType === DocumentType.ISSUE;
  if (!isStockForm) return <p className="rounded-xl border border-slate-200 bg-white p-5">واجهة مراجعة هذا النوع من المستندات ستضاف لاحقاً.</p>;

  const isReceipt = document.documentType === DocumentType.RECEIPT;
  const isDraft = document.status === DocumentStatus.DRAFT;
  const totalFils = document.lines.reduce((sum, line) => sum + (line.totalValueFils ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-sm text-slate-500">{isReceipt ? "مستند إدخال لوازم" : "مستند إخراج لوازم"}</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{document.documentNo ? `رقم ${document.documentNo}` : "بدون رقم مستند"}</h2><p className="mt-2 text-sm text-slate-500">{document.documentDate.toLocaleDateString("ar-JO")} • مركز {document.center.name}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusBadge(document.status)}`}>{isDraft ? "مسودة" : document.status === DocumentStatus.POSTED ? "معتمد" : "ملغي"}</span></div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4"><div><span className="text-slate-500">{isReceipt ? "موقع الاستلام" : "موقع الإخراج"}</span><div className="mt-1 font-bold text-slate-900">{isReceipt ? document.toLocation?.name : document.fromLocation?.name}</div></div><div><span className="text-slate-500">{isReceipt ? "المورد / الجهة" : "الجهة / الشخص المصروف له"}</span><div className="mt-1 font-bold text-slate-900">{document.counterparty?.name ?? "—"}</div></div><div><span className="text-slate-500">البيان</span><div className="mt-1 font-bold text-slate-900">{document.statement ?? "—"}</div></div><div><span className="text-slate-500">عدد المواد</span><div className="mt-1 font-bold text-slate-900">{document.lines.length}</div></div></div>{isReceipt && document.receiptDetail ? <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 text-sm md:grid-cols-2 lg:grid-cols-5"><div><span className="text-slate-500">رقم الفاتورة</span><div className="mt-1 font-medium">{document.receiptDetail.invoiceNo ?? "—"}</div></div><div><span className="text-slate-500">تاريخ الفاتورة</span><div className="mt-1 font-medium">{document.receiptDetail.invoiceDate?.toLocaleDateString("ar-JO") ?? "—"}</div></div><div><span className="text-slate-500">لجنة الاستلام</span><div className="mt-1 font-medium">{document.receiptDetail.receivingCommitteeDate?.toLocaleDateString("ar-JO") ?? "—"}</div></div><div><span className="text-slate-500">مرجع التقرير</span><div className="mt-1 font-medium">{document.receiptDetail.reportReference ?? "—"}</div></div><div><span className="text-slate-500">أمر الشراء</span><div className="mt-1 font-medium">{document.receiptDetail.purchaseOrderNo ?? "—"}</div></div></div> : null}</section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-3 text-center">#</th><th className="px-4 py-3 text-right">رقم المادة</th><th className="min-w-72 px-4 py-3 text-right">المادة</th><th className="px-4 py-3 text-center">الوحدة</th><th className="px-4 py-3 text-center">الكمية</th>{isReceipt ? <><th className="px-4 py-3 text-center">سعر الوحدة</th><th className="px-4 py-3 text-center">القيمة</th></> : null}</tr></thead><tbody className="divide-y divide-slate-100">{document.lines.map((line) => <tr key={line.id}><td className="px-3 py-3 text-center">{line.lineNo}</td><td className="px-4 py-3 font-mono text-xs">{line.itemCodeSnapshot ?? "—"}</td><td className="px-4 py-3 font-medium text-slate-900">{line.itemNameSnapshot}</td><td className="px-4 py-3 text-center">{line.unitNameSnapshot ?? "—"}</td><td className="px-4 py-3 text-center font-bold">{line.quantity}</td>{isReceipt ? <><td className="px-4 py-3 text-center">{money(line.unitPriceFils)}</td><td className="px-4 py-3 text-center font-bold">{money(line.totalValueFils)}</td></> : null}</tr>)}</tbody>{isReceipt ? <tfoot className="bg-slate-50 font-bold"><tr><td colSpan={6} className="px-4 py-3 text-left">الإجمالي (د.أ)</td><td className="px-4 py-3 text-center">{money(totalFils)}</td></tr></tfoot> : null}</table></div></section>
      {document.notes ? <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm"><strong>ملاحظات:</strong> {document.notes}</section> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">{isDraft ? <><form action={postStockDocument}><input type="hidden" name="documentId" value={document.id} /><button className="w-full rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto">{isReceipt ? "اعتماد المستند وإضافة الكميات للمخزون" : "اعتماد المستند وخصم الكميات من المخزون"}</button></form><form action={discardStockDraft}><input type="hidden" name="documentId" value={document.id} /><button className="w-full rounded-lg border border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 sm:w-auto">حذف المسودة</button></form></> : <Link href={`/documents/${document.id}/print`} className="rounded-lg bg-slate-900 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800">معاينة وطباعة المستند</Link>}<Link href="/documents" className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium hover:bg-slate-50">العودة للمستندات</Link></div>
    </div>
  );
}
