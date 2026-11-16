import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { approveRoomAudit, cancelRoomAudit } from "./actions";
import ClearAuditDraft from "./clear-audit-draft";

export const dynamic = "force-dynamic";

export default async function AuditReviewPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string; error?: string; posted?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const center = await getCurrentCenter();
  if (!center) notFound();
  const room = await prisma.location.findFirst({ where: { id, centerId: center.id } });
  if (!room) notFound();
  const ids = (query.ids ?? "").split(",").filter((x) => /^[a-zA-Z0-9_-]+$/.test(x)).slice(0, 30);
  const documents = await prisma.inventoryDocument.findMany({
    where: { id: { in: ids }, centerId: center.id },
    include: { employee: true, fromLocation: true, toLocation: true, lines: { include: { item: true } } },
    orderBy: { createdAt: "asc" },
  });

  const allPosted = documents.length > 0 && documents.every((doc) => doc.status === "POSTED");

  return <div className="mx-auto max-w-4xl space-y-5">
    {allPosted ? <ClearAuditDraft roomId={room.id}/> : null}
    <div className="rounded-3xl bg-teal-950 p-6 text-white">
      <p className="text-xs font-bold text-teal-200">جرد {room.name}</p>
      <h1 className="mt-2 text-3xl font-black">{allPosted ? "تم اعتماد الجرد وتحديث الغرف والعهد" : "تم حفظ نتيجة الجرد للمراجعة"}</h1>
      <p className="mt-3 text-sm leading-7 text-teal-100">{allPosted ? "تم حفظ حركات النقل وتسوية العهد القديمة دون فقد أي قطعة. تستطيع الآن طباعة سند النقل للغرفة المستلمة ومحاضر التسوية المرافقة." : "راجع حركات نقل المواد وتسويات عهد الموظفين ثم اعتمد الجرد بالكامل بضغطة واحدة. ستظهر سندات الطباعة بعد الاعتماد."}</p>
    </div>
    {query.error === "post_failed" && <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-bold text-red-800">تعذر اعتماد جميع الحركات؛ لم يجرِ ترحيل أي منها في هذه المحاولة. راجع رصيد المصدر وعهدة الموظفين ثم أعد المحاولة.</p>}
    {documents.length > 0 && documents.every((doc) => doc.status === "DRAFT") && <form action={approveRoomAudit} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <input type="hidden" name="roomId" value={room.id}/>
      <input type="hidden" name="ids" value={documents.map((doc) => doc.id).join(",")}/>
      <h2 className="text-lg font-extrabold text-emerald-950">اعتماد الجرد بالكامل بضغطة واحدة</h2>
      <p className="mt-2 text-sm leading-7 text-emerald-900">سيُعتمد نقل المواد والإضافات معًا في معاملة واحدة. إذا تعذرت حركة واحدة فلن تُعتمد أي حركة، وسيبقى المخزون دون تغيير.</p>
      <button className="mt-4 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-extrabold text-white hover:bg-emerald-800">اعتماد جميع حركات هذا الجرد</button>
    </form>}
    {documents.length > 0 && documents.every((doc) => doc.status === "DRAFT") && <form action={cancelRoomAudit} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="roomId" value={room.id}/>
      <input type="hidden" name="ids" value={documents.map((doc) => doc.id).join(",")}/>
      <p className="text-sm text-slate-600">للتعديل: ألغِ جميع المسودات وارجع إلى الجرد المحفوظ على الجهاز، دون أي تعديل في الأرصدة.</p>
      <button className="rounded-xl border border-amber-300 px-4 py-2.5 text-sm font-bold text-amber-900">إلغاء المسودات وتعديل الجرد</button>
    </form>}
    <div className="space-y-3">
      {documents.map((doc, index) => <article key={doc.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold text-slate-500">حركة {index + 1} • {doc.documentNo}</p>
            <h2 className="mt-1 text-lg font-extrabold text-slate-900">{doc.documentType === "TRANSFER" ? "سند نقل مواد للغرفة المستلمة" : doc.documentType === "RETURN" ? "محضر تسوية العهدة القديمة" : "إضافة مواد جديدة"}</h2>
            <p className="mt-1 text-sm text-slate-600">{doc.documentType === "RETURN" ? `الموظف: ${doc.employee?.fullName ?? "—"} • ${doc.fromLocation?.name ?? "—"}` : `${doc.fromLocation?.name || "جديد"} ← ${doc.toLocation?.name ?? "—"}`}</p>
          </div>
          <span className={`rounded-lg px-3 py-2 text-xs font-bold ${doc.status === "POSTED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>{doc.status === "POSTED" ? "معتمد" : "يحتاج اعتمادًا"}</span>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {doc.lines.map((line) => <p key={line.id} className="flex justify-between gap-3 py-2 text-sm"><span>{line.itemNameSnapshot}</span><strong>{line.quantity} قطعة</strong></p>)}
        </div>
        {doc.status === "POSTED" && (doc.documentType === "TRANSFER" || doc.documentType === "RETURN") ? <Link href={`/documents/${doc.id}/print`} className="mt-4 inline-block rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white">معاينة وطباعة {doc.documentType === "TRANSFER" ? "سند النقل" : "محضر تسوية العهدة"}</Link> : <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">يمكنك مراجعة هذه الحركة هنا. الاعتماد يتم لكل الجرد من الزر الواحد في أعلى الصفحة.</p>}
      </article>)}
      {!documents.length && <p className="rounded-xl border bg-white p-5 text-slate-600">لم يتم العثور على مستندات لهذا الجرد.</p>}
    </div>
    <div className="flex flex-wrap gap-3">
      <Link href={`/locations/${room.id}`} className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800">العودة للغرفة وسند العهدة</Link>
      <Link href="/locations" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800">الغرف الأخرى</Link>
    </div>
  </div>;
}
