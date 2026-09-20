import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StocktakeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const ids = (params.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  const documents = ids.length
    ? await prisma.inventoryDocument.findMany({
        where: { id: { in: ids }, documentType: "ADJUSTMENT" },
        include: {
          fromLocation: true,
          toLocation: true,
          _count: { select: { lines: true } },
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">الجرد / نتيجة المقارنة</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">تم إنشاء مسودة التسوية</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          الزيادة والنقص يظهران كمستندين منفصلين لأن كل اتجاه يولد حركة مخزون مختلفة. لم يتم تغيير الرصيد حتى الآن؛ افتح كل مسودة وراجعها ثم اعتمدها.
        </p>
      </div>

      {documents.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">لم يتم العثور على مسودات تسوية مرتبطة بهذه العملية.</section>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {documents.map((document) => {
            const isIncrease = Boolean(document.toLocationId && !document.fromLocationId);
            const location = document.toLocation ?? document.fromLocation;
            return (
              <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-bold ${isIncrease ? "text-emerald-700" : "text-red-700"}`}>{isIncrease ? "تسوية زيادة" : "تسوية نقص"}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{location?.name ?? "الموقع غير محدد"}</h3>
                  </div>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">مسودة</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">المرجع</span><div className="mt-1 font-medium">{document.documentNo ?? "—"}</div></div>
                  <div><span className="text-slate-500">عدد المواد</span><div className="mt-1 font-bold">{document._count.lines}</div></div>
                </div>
                <Link href={`/documents/adjustment/${document.id}`} className="mt-5 block rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800">فتح ومراجعة التسوية</Link>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/stocktake" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">جرد موقع آخر</Link>
        <Link href="/documents" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">كل المستندات</Link>
      </div>
    </div>
  );
}
