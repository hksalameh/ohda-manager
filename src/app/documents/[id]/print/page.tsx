import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const ROWS_PER_PAGE = 20;

function chunk<T>(items: T[], size: number) {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

export default async function CustodyPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.inventoryDocument.findUnique({
    where: { id },
    include: {
      employee: true,
      center: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!document) notFound();
  if (document.documentType !== DocumentType.CUSTODY) notFound();
  if (document.status !== DocumentStatus.POSTED) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        يجب اعتماد سند العهدة قبل طباعته.
      </section>
    );
  }

  const pages = chunk(document.lines, ROWS_PER_PAGE);
  const centerName = document.centerNameSnapshot ?? document.center.name;
  const employeeName = document.employeeNameSnapshot ?? document.employee?.fullName ?? "";
  const employeeNo = document.employeeNoSnapshot ?? document.employee?.employeeNo ?? "";
  const date = document.documentDate.toLocaleDateString("ar-JO");

  return (
    <div className="print-wrapper -mx-4 -my-6 bg-slate-100 p-4 md:-mx-6 md:-my-8 md:p-8">
      <style>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          body { background: white !important; }
          header { display: none !important; }
          main { max-width: none !important; padding: 0 !important; margin: 0 !important; }
          .print-wrapper { padding: 0 !important; margin: 0 !important; background: white !important; }
          .custody-page { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 281mm !important; }
          .custody-page:not(:last-child) { break-after: page; page-break-after: always; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link href={`/documents/${document.id}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium">
          العودة للسند
        </Link>
        <PrintButton />
      </div>

      <div className="space-y-5 print:space-y-0">
        {pages.map((lines, pageIndex) => (
          <section
            key={pageIndex}
            className="custody-page mx-auto flex min-h-[281mm] w-[210mm] max-w-full flex-col bg-white px-[11mm] py-[9mm] text-[12px] text-black shadow-lg"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
              <div className="text-right leading-6 font-bold">
                <div>جمعية المركز الإسلامي الخيرية</div>
                <div>الإدارة العامة – الدائرة المالية</div>
                <div>قسم اللوازم والمشتريات</div>
              </div>
              <div className="pt-1 text-center text-[13px] font-bold">بسم الله الرحمن الرحيم</div>
              <div className="flex justify-end">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-black text-center text-[9px] font-bold leading-4">
                  جمعية<br />المركز<br />الإسلامي
                </div>
              </div>
            </div>

            <h1 className="mt-3 border-y-2 border-black py-2 text-center text-[18px] font-bold">
              سند تسليم خاص بالعهدة الشخصية
            </h1>

            <div className="mt-3 grid grid-cols-2 gap-4 text-[13px] font-bold">
              <div>اسم المركز: <span className="font-normal">{centerName}</span></div>
              <div className="text-left">التاريخ: <span className="font-normal">{date}</span></div>
            </div>

            <p className="mt-4 text-[13px] font-bold">
              تم تسليم المواد المذكورة أدناه للسيد: <span className="font-normal">{employeeName}</span>
            </p>

            <table className="mt-3 w-full table-fixed border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-[24%] border border-black px-2 py-2">رقم المادة</th>
                  <th className="border border-black px-2 py-2">المـــــــادة</th>
                  <th className="w-[12%] border border-black px-2 py-2">الكمية</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="align-top">
                    <td className="border border-black px-2 py-1.5 font-mono text-[10px]">{line.itemCodeSnapshot ?? ""}</td>
                    <td className="border border-black px-2 py-1.5 leading-5">{line.itemNameSnapshot}</td>
                    <td className="border border-black px-2 py-1.5 text-center font-bold">{line.quantity}</td>
                  </tr>
                ))}
                {Array.from({ length: Math.max(0, ROWS_PER_PAGE - lines.length) }).map((_, index) => (
                  <tr key={`empty-${index}`}>
                    <td className="h-7 border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                    <td className="border border-black">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-auto pt-5 text-[13px] leading-8">
              <div><strong>اسـم المستلـم:</strong> {employeeName}</div>
              <div><strong>التـوقيـــع:</strong> ................................................................................................</div>
              <div><strong>الرقم الوظيفي:</strong> ( {employeeNo} )</div>
            </div>

            <div className="mt-4 flex items-end justify-between border-t border-black pt-2 text-[10px]">
              <div className="font-bold">FIN/3/3/4</div>
              <div>صفحة {pageIndex + 1} من {pages.length}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
