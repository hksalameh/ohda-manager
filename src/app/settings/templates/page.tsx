import { getCustodyTemplateHistory } from "@/lib/print-templates";

export const dynamic = "force-dynamic";

export default async function TemplateSettingsPage() {
  const template = await getCustodyTemplateHistory();
  if (!template) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4">تعذر تحميل بيانات نموذج الطباعة.</p>;
  }

  const current = template.versions.find((version) => version.status === "PUBLISHED") ?? template.versions[0];

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold text-blue-700">نموذج رسمي معتمد</p>
        <h2 className="mt-1 text-2xl font-extrabold text-slate-900">سند تسليم خاص بالعهدة الشخصية</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
          هذا النموذج مقفول ولا يمكن تعديل نصوصه أو ترتيبه أو رمز النموذج من البرنامج. عند الطباعة يملأ النظام فقط بيانات المركز والتاريخ والمستلم والمواد والكميات والرقم الوظيفي.
        </p>
      </section>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
        <h3 className="font-bold text-emerald-950">النسخة المعتمدة</h3>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-white p-4"><span className="text-slate-500">اسم النموذج</span><div className="mt-1 font-bold">سند تسليم خاص بالعهدة الشخصية</div></div>
          <div className="rounded-lg bg-white p-4"><span className="text-slate-500">رمز النموذج</span><div className="mt-1 font-bold" dir="ltr">FIN/3/3/4</div></div>
          <div className="rounded-lg bg-white p-4"><span className="text-slate-500">حجم الصفحة</span><div className="mt-1 font-bold">A4 عمودي</div></div>
          <div className="rounded-lg bg-white p-4"><span className="text-slate-500">الحالة</span><div className="mt-1 font-bold text-emerald-800">مقفل / معتمد</div></div>
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">سجل الإصدارات السابق</h3>
        <p className="mt-1 text-xs leading-6 text-slate-500">السجل محفوظ لأغراض التتبع فقط، لكنه لم يعد يغيّر شكل النموذج الرسمي.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="px-3 py-2 text-right">الإصدار</th><th className="px-3 py-2 text-right">الحالة</th><th className="px-3 py-2 text-right">تاريخ الإنشاء</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {template.versions.map((version) => (
                <tr key={version.id}>
                  <td className="px-3 py-2 font-bold">{version.version}{version.id === current?.id ? " (الحالي)" : ""}</td>
                  <td className="px-3 py-2">{version.status === "PUBLISHED" ? "منشور" : version.status === "ARCHIVED" ? "مؤرشف" : "مسودة"}</td>
                  <td className="px-3 py-2">{version.createdAt.toLocaleString("ar-JO")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
