import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StocktakeReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; custodyId?: string; matched?: string }>;
}) {
  const params = await searchParams;
  const ids = (params.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  const [documents, custody] = await Promise.all([
    ids.length
      ? prisma.inventoryDocument.findMany({
          where: { id: { in: ids }, documentType: "ADJUSTMENT" },
          include: {
            fromLocation: true,
            toLocation: true,
            _count: { select: { lines: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [],
    params.custodyId
      ? prisma.inventoryDocument.findFirst({
          where: { id: params.custodyId, documentType: "CUSTODY" },
          include: {
            employee: true,
            fromLocation: true,
            toLocation: true,
            _count: { select: { lines: true } },
          },
        })
      : null,
  ]);

  const hasAdjustments = documents.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">الجرد / نتيجة الغرفة</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">تم حفظ نتيجة الجرد</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          {hasAdjustments
            ? "وجد النظام فرقاً بين الرصيد والجرد الفعلي، لذلك أنشأ مسودة تسوية للمراجعة. لم يتغير الرصيد حتى تعتمد التسوية."
            : "الكميات التي أدخلتها لا تحتاج إلى تسوية مخزون."}
        </p>
      </div>

      {hasAdjustments ? (
        <section className="space-y-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">مسودات التسوية</h3>
            <p className="mt-1 text-sm text-slate-500">راجع الزيادة أو النقص واعتمدها أولاً، خصوصاً قبل اعتماد سند عهدة يحتوي على كميات جديدة.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {documents.map((document) => {
              const isIncrease = Boolean(document.toLocationId && !document.fromLocationId);
              const location = document.toLocation ?? document.fromLocation;
              return (
                <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={`text-sm font-bold ${isIncrease ? "text-emerald-700" : "text-red-700"}`}>{isIncrease ? "تسوية زيادة" : "تسوية نقص"}</p>
                      <h4 className="mt-1 text-lg font-bold text-slate-900">{location?.name ?? "الموقع غير محدد"}</h4>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">مسودة</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-500">المرجع</span><div className="mt-1 font-medium">{document.documentNo ?? "—"}</div></div>
                    <div><span className="text-slate-500">عدد المواد</span><div className="mt-1 font-bold">{document._count.lines}</div></div>
                  </div>
                  <Link href={`/documents/adjustment/${document.id}`} className="mt-5 block rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white hover:bg-slate-800">فتح ومراجعة التسوية</Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {custody ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-bold text-blue-700">مسودة سند عهدة جاهزة للمراجعة</p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">{custody.employee?.fullName ?? "المستلم"}</h3>
              <p className="mt-2 text-sm text-slate-600">
                الغرفة: <strong>{custody.toLocation?.name ?? custody.fromLocation?.name ?? "—"}</strong> • عدد المواد: <strong>{custody._count.lines}</strong>
              </p>
            </div>
            <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">مسودة</span>
          </div>
          {hasAdjustments ? (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-7 text-amber-950">
              اعتمد تسويات الجرد أولاً، ثم افتح سند العهدة واعتمده. بعد الاعتماد يظهر زر الطباعة مباشرة.
            </p>
          ) : (
            <p className="mt-4 text-sm leading-7 text-blue-950">يمكنك الآن فتح السند، مراجعة المواد والكميات، ثم اعتماده وطباعته.</p>
          )}
          <Link href={`/documents/${custody.id}`} className="mt-4 block w-full rounded-xl bg-blue-700 px-5 py-3 text-center text-sm font-bold text-white hover:bg-blue-800 sm:w-fit">فتح سند العهدة</Link>
        </section>
      ) : params.custodyId ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">تعذر العثور على مسودة العهدة المرتبطة بهذا الجرد.</section>
      ) : null}

      {!hasAdjustments && !custody ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-7 text-emerald-950">
          لا توجد تسوية ولا سند عهدة جديد لهذه العملية. قد تكون الكميات مطابقة وكل الموجود معهوداً به مسبقاً، أو أنك تركت اسم المستلم فارغاً.
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link href="/stocktake" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">جرد غرفة أخرى</Link>
        <Link href="/documents" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">كل المستندات</Link>
      </div>
    </div>
  );
}
