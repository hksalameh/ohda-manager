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
    const employeeNo = document.employeeNoSnapshot ?? document.employee?.employeeNo ?? "";
    const date = document.documentDate.toLocaleDateString("ar-JO");

    return (
      <div className="print-wrapper -mx-4 -my-6 bg-slate-100 p-4 md:-mx-6 md:-my-8 md:p-8">
        <style>{`
          @page { size: A4 portrait; margin: 8mm 20mm; }
          .official-table { border: 3px double #000; }
          .official-table th { border: 3px double #000; }
          .official-table td { border: 1px solid #000; }
          .official-table tbody tr:last-child td { border-bottom: 3px double #000; }
          @media print {
            body { background: white !important; }
            header, aside { display: none !important; }
            main { padding: 0 !important; margin: 0 !important; }
            .print-wrapper { padding: 0 !important; margin: 0 !important; background: white !important; }
            .custody-official { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 282mm !important; }
            .custody-official:not(:last-child) { break-after: page; page-break-after: always; }
          }
        `}</style>
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
          <Link href={`/documents/${document.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">العودة للسند</Link>
          <PrintButton />
        </div>
        <div className="space-y-5 print:space-y-0">
          {pages.map((lines, pageIndex) => (
            <section key={pageIndex} className="custody-official mx-auto flex min-h-[282mm] w-[210mm] max-w-full flex-col bg-white px-[20mm] py-[8mm] text-[12px] text-black shadow-lg">
              <div className="text-center text-[12pt] font-bold">بسم الله الرحمن الرحيم</div>
              <div className="mt-1 grid grid-cols-[1fr_90px_1fr] items-end border-b-[3px] border-double border-black pb-2">
                <div className="text-center text-[16pt] leading-7 font-bold">
                  <div>جمعية المركز الإسلامي الخيرية</div>
                  <div>الإدارة العامة – الدائرة المالية</div>
                  <div className="text-[18pt]">قسم اللوازم والمشتريات</div>
                </div>
                <div></div>
                <div className="flex justify-center"><img src="/official-logo.svg" alt="شعار جمعية المركز الإسلامي الخيرية" className="h-[62px] w-auto" /></div>
              </div>

              <h1 className="mt-3 text-center text-[20pt] font-bold">سند تسليم خاص بالعهدة الشخصية</h1>
              <div className="mt-3 flex items-center justify-between text-[14pt] font-bold">
                <div>اسم المركز: <span className="font-normal">{centerName}</span></div>
                <div>التاريخ: <span className="font-normal">{date}</span></div>
              </div>
              <p className="mt-3 text-[14pt] font-bold">تم تسليم المواد المذكورة أدناه للسيد: <span className="font-normal">{employeeName}</span></p>

              <table className="official-table mt-3 w-full table-fixed border-collapse text-[11pt]">
                <thead>
                  <tr>
                    <th className="w-[23%] border border-black px-2 py-1.5">رقم المادة</th>
                    <th className="border border-black px-2 py-1.5">المـــــــادة</th>
                    <th className="w-[12%] border border-black px-2 py-1.5">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="border border-black px-2 py-1 font-mono text-[10px]">{line.itemCodeSnapshot ?? ""}</td>
                      <td className="border border-black px-2 py-1 leading-5">{line.itemNameSnapshot}</td>
                      <td className="border border-black px-2 py-1 text-center font-bold">{line.quantity}</td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, rowsPerPage - lines.length + 1) }).map((_, index) => (
                    <tr key={`empty-${index}`}><td className="h-6 border border-black">&nbsp;</td><td className="border border-black">&nbsp;</td><td className="border border-black">&nbsp;</td></tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-5 ml-auto w-[58%] text-[14pt] leading-7">
                <div className="flex"><strong className="whitespace-nowrap">اسـم المستلـم:</strong><span className="mx-2 flex-1 border-b border-dotted border-black">""</span></div>
                <div className="flex"><strong className="whitespace-nowrap">التـوقيـــع:</strong><span className="mx-2 flex-1 border-b border-dotted border-black">&nbsp;</span></div>
                <div><strong>الرقم الوظيفي:</strong> ( <span className="inline-block min-w-28 text-center">{employeeNo}</span> )</div>
              </div>
              <div className="mt-2 text-left text-[14pt] font-bold" dir="ltr">FIN/3/3/4</div>
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
