import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages.length ? pages : [[]];
}

function money(fils: number | null) {
  return fils === null ? "" : (fils / 1000).toFixed(3);
}

export default async function DocumentPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.inventoryDocument.findUnique({
    where: { id },
    include: {
      employee: true,
      center: true,
      counterparty: true,
      fromLocation: true,
      toLocation: true,
      receiptDetail: true,
      templateVersion: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!document) notFound();
  if (document.status !== DocumentStatus.POSTED) {
    return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">يجب اعتماد المستند قبل طباعته.</section>;
  }

  if (document.documentType === DocumentType.CUSTODY) {
    const rowsPerPage = 23;
    const pages = chunk(document.lines, rowsPerPage);
    const centerName = document.centerNameSnapshot ?? document.center.name;
    const employeeName = document.employeeNameSnapshot ?? document.employee?.fullName ?? "";
    const d = document.documentDate;
    const date = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

    return (
      <div className="custody-print-root -mx-4 -my-6 bg-slate-100 p-4 md:-mx-6 md:-my-8 md:p-8">
        <style>{`
          @page { size: A4 portrait; margin: 0; }
          .custody-sheet { width:210mm; height:297mm; position:relative; overflow:hidden; background:#fff; color:#000; font-family:Arial,Tahoma,sans-serif; }
          .custody-bismillah { position:absolute; top:8.4mm; left:27mm; width:156mm; text-align:center; font-family:"Times New Roman",serif; font-size:12pt; line-height:1; }
          .custody-org { position:absolute; top:15.2mm; right:25.1mm; width:88mm; text-align:center; font-weight:700; line-height:1.22; white-space:nowrap; }
          .custody-org .line1 { font-size:17pt; }
          .custody-org .line2 { font-size:17pt; }
          .custody-org .line3 { font-size:18pt; }
          .custody-logo { position:absolute; top:25.25mm; left:48.6mm; width:15mm; height:16.3mm; object-fit:contain; display:block; }
          .custody-head-rule { position:absolute; top:54.0mm; left:25.1mm; width:159.8mm; border-top:1.2mm double #000; }
          .custody-title { position:absolute; top:61.3mm; left:27mm; width:156mm; text-align:center; font-size:20pt; line-height:1; font-weight:700; }
          .custody-center { position:absolute; top:69.6mm; right:27mm; font-size:14pt; line-height:1; white-space:nowrap; }
          .custody-date { position:absolute; top:69.6mm; left:27mm; font-size:14pt; line-height:1; white-space:nowrap; direction:rtl; }
          .custody-intro { position:absolute; top:76.0mm; right:27mm; width:156mm; text-align:right; font-size:14pt; line-height:1; white-space:nowrap; }
          .custody-table { position:absolute; top:83.0mm; left:20.8mm; width:168.2mm; border-collapse:collapse; table-layout:fixed; direction:rtl; font-family:Arial,Tahoma,sans-serif; font-size:11pt; border:0.7mm double #000; }
          .custody-table col.code { width:36.67mm; } .custody-table col.name { width:111.28mm; } .custody-table col.qty { width:19.91mm; }
          .custody-table thead tr { height:5.79mm; } .custody-table tbody tr { height:6.91mm; }
          .custody-table th { border:0.7mm double #000; padding:0 1mm; text-align:center; vertical-align:middle; font-family:"Simplified Arabic",Arial,Tahoma,sans-serif; font-weight:700; line-height:1; }
          .custody-table td { border:0.2mm solid #000; padding:0 1.2mm; text-align:center; vertical-align:middle; line-height:1.05; overflow-wrap:anywhere; }
          .custody-table td.code { font-family:Arial,sans-serif; font-size:11pt; direction:ltr; }
          .custody-table td.name { direction:rtl; }
          .custody-table td.qty { font-family:Arial,sans-serif; font-size:11pt; direction:ltr; }
          .custody-signatures { position:absolute; top:263.1mm; right:27mm; width:88mm; font-size:14pt; line-height:1.55; text-align:right; }
          .custody-signatures .dots { font-size:5pt; font-weight:400; letter-spacing:0; }
          .custody-form-code { position:absolute; top:279.0mm; left:27mm; font-family:Arial,sans-serif; font-size:14pt; font-weight:700; direction:ltr; }
          @media print {
            html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
            header, aside, .no-print { display:none !important; }
            main { margin:0 !important; padding:0 !important; max-width:none !important; min-height:0 !important; }
            .custody-print-root { margin:0 !important; padding:0 !important; background:#fff !important; }
            .custody-sheet { margin:0 !important; box-shadow:none !important; break-after:page; page-break-after:always; }
            .custody-sheet:last-child { break-after:auto; page-break-after:auto; }
          }
        `}</style>
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
          <Link href={`/documents/${document.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">العودة للسند</Link>
          <PrintButton />
        </div>
        <div className="space-y-5 print:space-y-0">
          {pages.map((lines, pageIndex) => (
            <section key={pageIndex} className="custody-sheet mx-auto shadow-lg">
              <div className="custody-bismillah">بسم الله الرحمن الرحيم</div>
              <div className="custody-org">
                <div className="line1">جمعية المركز الإسلامي الخيرية</div>
                <div className="line2">الإدارة العامة - الدائرة المالية</div>
                <div className="line3">قسم اللوازم والمشتريات</div>
              </div>
              <img src="/custody-official-logo.jpg" alt="شعار جمعية المركز الإسلامي الخيرية" className="custody-logo" />
              <div className="custody-head-rule" />
              <div className="custody-title">سند تسليم خاص بالعهدة الشخصية</div>
              <div className="custody-center">اسم المركز: {centerName}</div>
              <div className="custody-date">التاريخ: {date}</div>
              <div className="custody-intro">تم تسليم المواد المذكورة أدناه للسيد: {employeeName}</div>
              <table className="custody-table">
                <colgroup><col className="code"/><col className="name"/><col className="qty"/></colgroup>
                <thead><tr><th>رقم المادة</th><th>المـــــــادة</th><th>الكمية</th></tr></thead>
                <tbody>
                  {lines.map((line) => <tr key={line.id}><td className="code">{line.itemCodeSnapshot ?? ""}</td><td className="name">{line.itemNameSnapshot}</td><td className="qty">{line.quantity}</td></tr>)}
                  {Array.from({ length: Math.max(0, 24 - lines.length) }).map((_, index) => <tr key={`empty-${index}`}><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>)}
                </tbody>
              </table>
              <div className="custody-signatures">
                <div><strong>اسـم المستلـم:</strong> <span className="dots">..............................................................................................</span></div>
                <div><strong>التـوقيـــع:</strong> <span className="dots">................................................................................................</span></div>
                <div><strong>الرقم الوظيفي:</strong> ( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
              </div>
              <div className="custody-form-code">FIN/3/3/4</div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (document.documentType !== DocumentType.RECEIPT && document.documentType !== DocumentType.ISSUE) notFound();

  const isReceipt = document.documentType === DocumentType.RECEIPT;
  const rowsPerPage = isReceipt ? 14 : 18;
  const pages = chunk(document.lines, rowsPerPage);
  const partyName = document.counterpartyNameSnapshot ?? document.counterparty?.name ?? "";
  const locationName = isReceipt
    ? (document.toLocationNameSnapshot ?? document.toLocation?.name ?? "")
    : (document.fromLocationNameSnapshot ?? document.fromLocation?.name ?? "");
  const totalFils = document.lines.reduce((sum, line) => sum + (line.totalValueFils ?? 0), 0);

  return (
    <div className="print-wrapper -mx-4 -my-6 bg-slate-100 p-4 md:-mx-6 md:-my-8 md:p-8">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          body { background: white !important; }
          header { display: none !important; }
          main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .print-wrapper { padding: 0 !important; margin: 0 !important; background: white !important; }
          .stock-page { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 281mm !important; }
          .stock-page:not(:last-child) { break-after: page; page-break-after: always; }
        }
      `}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href={`/documents/${document.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">العودة للمستند</Link>
        <PrintButton />
      </div>
      <div className="space-y-5 print:space-y-0">
        {pages.map((lines, pageIndex) => (
          <section key={pageIndex} className="stock-page mx-auto flex min-h-[281mm] w-[210mm] max-w-full flex-col bg-white px-[9mm] py-[8mm] text-[11px] text-black shadow-lg">
            <div className="grid grid-cols-3 items-start border-b-2 border-black pb-3">
              <div className="leading-5 font-bold"><div>جمعية المركز الإسلامي الخيرية</div><div>الدائرة المالية</div><div>قسم اللوازم والمشتريات</div></div>
              <div className="text-center"><div className="font-bold">بسم الله الرحمن الرحيم</div><h1 className="mt-3 text-[19px] font-bold">{isReceipt ? "مستند إدخال لوازم" : "مستند إخراج لوازم"}</h1></div>
              <div className="text-left leading-6"><div><strong>رقم المستند:</strong> {document.documentNo ?? "................"}</div><div><strong>التاريخ:</strong> {document.documentDate.toLocaleDateString("ar-JO")}</div><div><strong>المركز:</strong> {document.centerNameSnapshot ?? document.center.name}</div></div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 border border-black p-3 text-[12px]">
              <div><strong>{isReceipt ? "وردت اللوازم من:" : "صرفت اللوازم إلى:"}</strong> {partyName || "................................"}</div>
              <div><strong>{isReceipt ? "مكان الإدخال:" : "مكان الإخراج:"}</strong> {locationName}</div>
              {isReceipt ? <><div><strong>رقم الفاتورة:</strong> {document.receiptDetail?.invoiceNo ?? "................"}</div><div><strong>تاريخ الفاتورة:</strong> {document.receiptDetail?.invoiceDate?.toLocaleDateString("ar-JO") ?? "................"}</div><div><strong>تاريخ لجنة الاستلام:</strong> {document.receiptDetail?.receivingCommitteeDate?.toLocaleDateString("ar-JO") ?? "................"}</div><div><strong>مرجع التقرير:</strong> {document.receiptDetail?.reportReference ?? "................"}</div></> : null}
              <div className="col-span-2"><strong>البيان:</strong> {document.statement ?? ""}</div>
            </div>

            <table className="mt-3 w-full table-fixed border-collapse text-[10px]">
              <thead><tr><th className="w-[5%] border border-black p-1.5">م</th><th className="w-[17%] border border-black p-1.5">رقم المادة</th><th className="border border-black p-1.5">اسم المادة ووصفها</th><th className="w-[10%] border border-black p-1.5">الوحدة</th><th className="w-[9%] border border-black p-1.5">الكمية</th>{isReceipt ? <><th className="w-[13%] border border-black p-1.5">السعر الإفرادي</th><th className="w-[13%] border border-black p-1.5">القيمة</th></> : null}<th className="w-[13%] border border-black p-1.5">ملاحظات</th></tr></thead>
              <tbody>
                {lines.map((line) => <tr key={line.id}><td className="border border-black p-1.5 text-center">{line.lineNo}</td><td className="border border-black p-1.5 font-mono text-[9px]">{line.itemCodeSnapshot ?? ""}</td><td className="border border-black p-1.5">{line.itemNameSnapshot}</td><td className="border border-black p-1.5 text-center">{line.unitNameSnapshot ?? ""}</td><td className="border border-black p-1.5 text-center font-bold">{line.quantity}</td>{isReceipt ? <><td className="border border-black p-1.5 text-center">{money(line.unitPriceFils)}</td><td className="border border-black p-1.5 text-center">{money(line.totalValueFils)}</td></> : null}<td className="border border-black p-1.5">{line.notes ?? ""}</td></tr>)}
                {Array.from({ length: Math.max(0, rowsPerPage - lines.length) }).map((_, index) => <tr key={`empty-${index}`}><td className="h-7 border border-black">&nbsp;</td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td>{isReceipt ? <><td className="border border-black"></td><td className="border border-black"></td></> : null}<td className="border border-black"></td></tr>)}
              </tbody>
              {isReceipt && pageIndex === pages.length - 1 ? <tfoot><tr className="font-bold"><td colSpan={6} className="border border-black p-2 text-left">الإجمالي بالدينار الأردني</td><td className="border border-black p-2 text-center">{money(totalFils)}</td><td className="border border-black"></td></tr></tfoot> : null}
            </table>

            <div className="mt-auto grid grid-cols-2 gap-8 border-t border-black pt-4 text-[12px] leading-7">
              <div><div><strong>{isReceipt ? "مستلم اللوازم:" : "اسم المستلم:"}</strong> ........................................................</div><div><strong>التوقيع:</strong> ........................................................</div></div>
              <div><div><strong>مسؤول اللوازم:</strong> ........................................................</div><div><strong>التوقيع:</strong> ........................................................</div></div>
            </div>
            <div className="mt-3 flex justify-between text-[9px]"><span>{isReceipt ? "سند إدخال لوازم" : "سند إخراج لوازم"}</span><span>صفحة {pageIndex + 1} من {pages.length}</span></div>
          </section>
        ))}
      </div>
    </div>
  );
}
