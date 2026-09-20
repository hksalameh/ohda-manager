import Link from "next/link";
import { createItem } from "../actions";

export default function NewItemPage() {
  const inputClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">المواد</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">إضافة مادة جديدة</h2>
        <p className="mt-2 text-sm leading-7 text-slate-500">تستخدم للمواد الجديدة التي لم تكن موجودة في ملف الجرد الافتتاحي. إضافة تعريف المادة وحده لا تزيد المخزون؛ الكمية تدخل لاحقاً من خلال مستند إدخال.</p>
      </div>
      <form action={createItem} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">رقم المادة
            <input name="itemCode" className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">اسم المادة <span className="text-red-600">*</span>
            <input name="name" required className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">الوحدة
            <input name="unitName" defaultValue="قطعة" className={inputClass} />
          </label>
          <label className="text-sm font-medium text-slate-700">رقم صفحة الدفتر القديم
            <input name="legacyLedgerPageNo" className={inputClass} />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">ملاحظات
          <textarea name="notes" rows={3} className={inputClass} />
        </label>
        <div className="flex gap-3">
          <button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">حفظ المادة</button>
          <Link href="/items" className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50">إلغاء</Link>
        </div>
      </form>
    </div>
  );
}
