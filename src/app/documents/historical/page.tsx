import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { HistoricalDocumentForm } from "./historical-form";

export const dynamic = "force-dynamic";

export default async function HistoricalDocumentsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const query = await searchParams;
  const type = query.type === "issue" ? "HISTORICAL_ISSUE" : "HISTORICAL_RECEIPT";
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;

  const snapshot = await prisma.openingSnapshot.findFirst({
    where: { centerId: center.id, status: "POSTED" },
    orderBy: { snapshotDate: "desc" },
    include: {
      lines: {
        include: { sourceLinks: true },
      },
    },
  });

  const items = await prisma.item.findMany({ where: { active: true }, orderBy: [{ itemCode: "asc" }, { name: "asc" }] });
  const openingMap = new Map((snapshot?.lines ?? []).map((line) => [line.itemId, {
    remaining: Math.max(0, line.physicalQuantity - line.sourceLinks.reduce((sum, link) => sum + link.quantity, 0)),
  }]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">استكمال معلومات الدفتر القديم</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{type === "HISTORICAL_RECEIPT" ? "تسجيل سند إدخال تاريخي" : "تسجيل سند إخراج تاريخي"}</h2>
          <p className="mt-2 text-sm leading-7 text-slate-500">للمستندات القديمة بتاريخ 31/12/2025 أو قبله. تحفظ للتوثيق ولا تغيّر المخزون الحالي.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/documents/historical?type=receipt" className={`rounded-lg px-4 py-2 text-sm font-bold ${type === "HISTORICAL_RECEIPT" ? "bg-blue-700 text-white" : "border border-slate-300 bg-white"}`}>إدخال تاريخي</Link>
          <Link href="/documents/historical?type=issue" className={`rounded-lg px-4 py-2 text-sm font-bold ${type === "HISTORICAL_ISSUE" ? "bg-blue-700 text-white" : "border border-slate-300 bg-white"}`}>إخراج تاريخي</Link>
        </div>
      </div>

      <HistoricalDocumentForm
        type={type}
        items={items.map((item) => ({
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          remainingOpening: openingMap.get(item.id)?.remaining ?? 0,
        }))}
      />
    </div>
  );
}
