import {
  getCustodyTemplateHistory,
  parseCustodyTemplateConfig,
} from "@/lib/print-templates";
import { publishCustodyTemplate } from "./actions";

export const dynamic = "force-dynamic";

export default async function TemplateSettingsPage() {
  const template = await getCustodyTemplateHistory();
  if (!template) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4">تعذر تحميل قالب الطباعة.</p>;
  }

  const current = template.versions.find((version) => version.status === "PUBLISHED") ?? template.versions[0];
  const config = parseCustodyTemplateConfig(current?.layoutJsonText);

  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">إعدادات نماذج الطباعة</h2>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          يمكنك تعديل نصوص وشكل سند العهدة. عند الحفظ ينشئ النظام إصداراً جديداً، وتبقى السندات القديمة مرتبطة بالإصدار الذي استُخدم عند إنشائها.
        </p>
      </div>

      <form action={publishCustodyTemplate} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-bold text-slate-900">سند تسليم خاص بالعهدة الشخصية</h3>
            <p className="mt-1 text-xs text-slate-500">الإصدار الحالي: {current?.version ?? 1}</p>
          </div>
          <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
            حفظ ونشر إصدار جديد
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">اسم الجمعية/الجهة
            <input name="organizationName" defaultValue={config.organizationName} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">السطر الإداري
            <input name="administrationLine" defaultValue={config.administrationLine} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">القسم
            <input name="departmentLine" defaultValue={config.departmentLine} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">العبارة أعلى النموذج
            <input name="religiousPhrase" defaultValue={config.religiousPhrase} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">عنوان السند
            <input name="title" defaultValue={config.title} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">عبارة التسليم
            <input name="introText" defaultValue={config.introText} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">تسمية المركز
            <input name="centerLabel" defaultValue={config.centerLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">تسمية التاريخ
            <input name="dateLabel" defaultValue={config.dateLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">عنوان عمود رقم المادة
            <input name="itemCodeLabel" defaultValue={config.itemCodeLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">عنوان عمود المادة
            <input name="itemNameLabel" defaultValue={config.itemNameLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">عنوان عمود الكمية
            <input name="quantityLabel" defaultValue={config.quantityLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">تسمية اسم المستلم
            <input name="receiverNameLabel" defaultValue={config.receiverNameLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">تسمية التوقيع
            <input name="signatureLabel" defaultValue={config.signatureLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">تسمية الرقم الوظيفي
            <input name="employeeNoLabel" defaultValue={config.employeeNoLabel} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">رمز النموذج
            <input name="formCode" defaultValue={config.formCode} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">نص الشعار المؤقت
            <textarea name="logoText" defaultValue={config.logoText} rows={3} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">عدد المواد في الصفحة
            <input name="rowsPerPage" type="number" min={5} max={40} defaultValue={current?.rowsPerPage ?? 20} className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">اتجاه الصفحة
            <select name="orientation" defaultValue={current?.orientation ?? "portrait"} className={inputClass}>
              <option value="portrait">عمودي</option>
              <option value="landscape">أفقي</option>
            </select>
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="showPageNumber" defaultChecked={config.showPageNumber} className="h-4 w-4" />
          إظهار رقم الصفحة (مثال: صفحة 1 من 2)
        </label>

        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-7 text-blue-950">
          تعديل القالب هنا يؤثر على السندات الجديدة فقط. السندات السابقة تحتفظ بإصدارها القديم، وهذا يمنع تغير المستندات التاريخية بعد طباعتها أو توقيعها.
        </div>
      </form>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-bold text-slate-900">سجل الإصدارات</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-right">الإصدار</th>
                <th className="px-3 py-2 text-right">الحالة</th>
                <th className="px-3 py-2 text-right">عدد الصفوف</th>
                <th className="px-3 py-2 text-right">تاريخ الإنشاء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {template.versions.map((version) => (
                <tr key={version.id}>
                  <td className="px-3 py-2 font-bold">{version.version}</td>
                  <td className="px-3 py-2">{version.status === "PUBLISHED" ? "الحالي" : version.status === "ARCHIVED" ? "مؤرشف" : "مسودة"}</td>
                  <td className="px-3 py-2">{version.rowsPerPage}</td>
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
