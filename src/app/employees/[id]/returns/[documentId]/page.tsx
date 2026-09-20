import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { discardReturnDraft, postReturnDocument } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReturnDocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id: employeeId, documentId } = await params;
  const document = await prisma.inventoryDocument.findUnique({
    where: { id: documentId },
    include: {
      employee: true,
      center: true,
      fromLocation: true,
      toLocation: true,
      lines: { orderBy: { lineNo: "asc" } },
    },
  });

  if (!document || document.documentType !== DocumentType.RETURN || document.employeeId !== employeeId) notFound();
  const isDraft = document.status === DocumentStatus.DRAFT;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">إرجاع عهدة شخصية</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">{document.employee?.fullName ?? "الموظف"}</h2>
          <p className="mt-2 text-sm text-slate-500">{document.documentDate.toLocaleDateString("ar-JO")} • مركز {document.center.name}</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${isDraft ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
          {isDraft ? "مسودة للمراجعة" : "معتمد"}
        </span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div><span className="text-slate-500">من الموقع</span><div className="mt-1 font-bold">{document.fromLocation?.name ?? "—"}</div></div>
          <div><span className="text-slate-500">بعد الإرجاع إلى</span><div className="mt-1 font-bold">{document.toLocation?.name ?? document.fromLocation?.name ?? "—"}</div></div>
          <div><span className="text-slate-500">البيان</span><div className="mt-1 font-bold">{document.statement ?? "—"}</div></div>
        </div>
      </section>

      {isDraft ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          راجع المواد قبل الاعتماد. عند الاعتماد تُخصم الكميات من عهدة الموظف، وإذا كان موقع الإرجاع مختلفاً تنتقل المواد إليه في نفس العملية.
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
          تم اعتماد الإرجاع وتحديث عهدة الموظف ومكان المواد في المخزون.
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="px-3 py-3 text-center">#</th><th className="px-4 py-3 text-right">رقم المادة</th><th className="min-w-72 px-4 py-3 text-right">المادة</th><th className="px-4 py-3 text-center">الوحدة</th><th className="px-4 py-3 text-center">الكمية</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {document.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-3 py-3 text-center">{line.lineNo}</td>
                  <td className="px-4 py-3 font-mono text-xs">{line.itemCodeSnapshot ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{line.itemNameSnapshot}</td>
                  <td className="px-4 py-3 text-center">{line.unitNameSnapshot ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-bold">{line.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {isDraft ? (
          <>
            <form action={postReturnDocument}>
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="employeeId" value={employeeId} />
              <button className="w-full rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 sm:w-auto">اعتماد الإرجاع</button>
            </form>
            <form action={discardReturnDraft}>
              <input type="hidden" name="documentId" value={document.id} />
              <input type="hidden" name="employeeId" value={employeeId} />
              <button className="w-full rounded-lg border border-red-200 px-5 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 sm:w-auto">حذف المسودة</button>
            </form>
          </>
        ) : null}
        <Link href={`/employees/${employeeId}`} className="rounded-lg border border-slate-300 px-5 py-2.5 text-center text-sm font-medium hover:bg-slate-50">العودة لعهدة الموظف</Link>
      </div>
    </div>
  );
}
