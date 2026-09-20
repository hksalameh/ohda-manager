import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  discardCustodyDraft,
  postCustodyDocument,
  saveCustodyDraft,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await prisma.inventoryDocument.findUnique({
    where: { id },
    include: {
      employee: true,
      center: true,
      fromLocation: true,
      toLocation: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!document) notFound();
  if (document.documentType !== DocumentType.CUSTODY) {
    return <p className="rounded-xl border border-slate-200 bg-white p-5">واجهة مراجعة هذا النوع من المستندات ستضاف لاحقاً.</p>;
  }

  const isDraft = document.status === DocumentStatus.DRAFT;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-slate-500">سند عهدة شخصية</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{document.employee?.fullName ?? "بدون موظف"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {document.toLocation?.name ?? document.fromLocation?.name ?? "الموقع غير محدد"} • {document.documentDate.toLocaleDateString("ar-JO")}
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${isDraft ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
          {isDraft ? "مسودة" : "معتمد"}
        </span>
      </div>

      {isDraft ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          هذه مسودة تم إنشاؤها من المواد غير المعهود بها داخل غرفة الموظف. راجع المواد والكميات، أزل أي مادة لا تخص الموظف، ثم احفظ المسودة قبل اعتمادها.
        </section>
      ) : null}

      <form action={saveCustodyDraft} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <input type="hidden" name="documentId" value={document.id} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                {isDraft ? <th className="px-3 py-3 text-center">ضمن السند</th> : null}
                <th className="px-4 py-3 text-right">رقم المادة</th>
                <th className="min-w-80 px-4 py-3 text-right">المادة</th>
                <th className="px-4 py-3 text-center">الكمية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {document.lines.map((line) => (
                <tr key={line.id}>
                  {isDraft ? (
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" name="includedLine" value={line.id} defaultChecked className="h-4 w-4" />
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{line.itemCodeSnapshot ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{line.itemNameSnapshot}</td>
                  <td className="px-4 py-3 text-center">
                    {isDraft ? (
                      <input
                        type="number"
                        min={1}
                        max={line.quantity}
                        name={`quantity:${line.id}`}
                        defaultValue={line.quantity}
                        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-center"
                      />
                    ) : (
                      <span className="font-bold">{line.quantity}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isDraft ? (
          <div className="border-t border-slate-200 p-4">
            <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold hover:bg-slate-50">
              حفظ تعديلات المسودة
            </button>
          </div>
        ) : null}
      </form>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {isDraft ? (
          <>
            <form action={postCustodyDocument}>
              <input type="hidden" name="documentId" value={document.id} />
              <button className="w-full rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto">
                اعتماد السند وتثبيت العهدة
              </button>
            </form>
            <form action={discardCustodyDraft}>
              <input type="hidden" name="documentId" value={document.id} />
              <button className="w-full rounded-lg border border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 sm:w-auto">
                حذف المسودة
              </button>
            </form>
          </>
        ) : (
          <Link href={`/documents/${document.id}/print`} className="rounded-lg bg-slate-900 px-5 py-2.5 text-center text-sm font-bold text-white hover:bg-slate-800">
            معاينة وطباعة سند العهدة
          </Link>
        )}
        <Link href="/employees" className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium hover:bg-slate-50">
          العودة للموظفين
        </Link>
      </div>
    </div>
  );
}
