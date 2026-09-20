import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { StockDocumentForm } from "./document-form";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const query = await searchParams;
  const documentType = query.type === "issue" ? "ISSUE" : "RECEIPT";
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });

  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;
  }

  const [items, locations] = await Promise.all([
    prisma.item.findMany({
      where: { active: true },
      orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      include: { unit: true },
    }),
    prisma.location.findMany({
      where: { centerId: center.id, active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">المستندات المخزنية</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {documentType === "RECEIPT" ? "إنشاء مستند إدخال لوازم" : "إنشاء مستند إخراج لوازم"}
          </h2>
        </div>
        <div className="flex gap-2">
          <Link href="/documents/new?type=receipt" className={`rounded-lg px-4 py-2 text-sm font-bold ${documentType === "RECEIPT" ? "bg-emerald-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            سند إدخال
          </Link>
          <Link href="/documents/new?type=issue" className={`rounded-lg px-4 py-2 text-sm font-bold ${documentType === "ISSUE" ? "bg-amber-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>
            سند إخراج
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
          لا توجد مواد مسجلة بعد. استورد ملف الجرد الافتتاحي أو أضف المواد أولاً.
        </section>
      ) : (
        <StockDocumentForm
          documentType={documentType}
          today={today}
          items={items.map((item) => ({
            id: item.id,
            itemCode: item.itemCode,
            name: item.name,
            unitName: item.unit?.name ?? null,
          }))}
          locations={locations.map((location) => ({ id: location.id, name: location.name }))}
        />
      )}
    </div>
  );
}
