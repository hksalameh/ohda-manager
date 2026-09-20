import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const typeLabels: Record<string, string> = {
  RECEIPT: "إدخال لوازم",
  ISSUE: "إخراج لوازم",
  CUSTODY: "عهدة شخصية",
  RETURN: "إرجاع عهدة",
  TRANSFER: "نقل",
  ADJUSTMENT: "تسوية",
  HISTORICAL_RECEIPT: "إدخال تاريخي",
  HISTORICAL_ISSUE: "إخراج تاريخي",
  OPENING_INVENTORY: "جرد افتتاحي",
};

export default async function DocumentsPage() {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const documents = await prisma.inventoryDocument.findMany({
    where: { centerId: center.id },
    orderBy: [{ documentDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      employee: true,
      fromLocation: true,
      toLocation: true,
      counterparty: true,
      _count: { select: { lines: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">المستندات</h2>
          <p className="mt-2 text-sm text-slate-500">سندات الإدخال والإخراج والعهدة وباقي حركات اللوازم.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/documents/new?type=receipt" className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">+ سند إدخال</Link>
          <Link href="/documents/new?type=issue" className="rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-800">+ سند إخراج</Link>
          <Link href="/documents/transfer" className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800">+ نقل بين المواقع</Link>
          <Link href="/documents/historical" className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-800 hover:bg-blue-100">+ مستند قديم من الدفتر</Link>
        </div>
      </div>

      {documents.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="font-bold text-slate-900">لا توجد مستندات بعد</h3>
          <p className="mt-2 text-sm text-slate-600">ابدأ بسند إدخال أو إخراج، أو أنشئ سند عهدة من شاشة الموظفين.</p>
        </section>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-[1000px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-right">النوع</th>
                  <th className="px-4 py-3 text-right">رقم المستند</th>
                  <th className="px-4 py-3 text-right">التاريخ</th>
                  <th className="px-4 py-3 text-right">الموقع / الجهة</th>
                  <th className="px-4 py-3 text-center">المواد</th>
                  <th className="px-4 py-3 text-center">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((document) => {
                  const related = document.employee?.fullName
                    ?? document.counterparty?.name
                    ?? document.toLocation?.name
                    ?? document.fromLocation?.name
                    ?? "—";
                  const isDraft = document.status === "DRAFT";
                  const detailHref = document.documentType === "TRANSFER"
                    ? `/documents/transfer/${document.id}`
                    : document.documentType === "RETURN"
                      ? `/documents/return/${document.id}`
                      : `/documents/${document.id}`;
                  return (
                    <tr key={document.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{typeLabels[document.documentType] ?? document.documentType}</td>
                      <td className="px-4 py-3">{document.documentNo ?? "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{document.documentDate.toLocaleDateString("ar-JO")}</td>
                      <td className="px-4 py-3">{related}</td>
                      <td className="px-4 py-3 text-center font-bold">{document._count.lines}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isDraft ? "bg-amber-100 text-amber-900" : document.status === "POSTED" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
                          {isDraft ? "مسودة" : document.status === "POSTED" ? "معتمد" : "ملغي"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-left">
                        <Link href={detailHref} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-50">فتح</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
