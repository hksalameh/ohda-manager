import Link from "next/link";

const reports = [
  {
    href: "/reports/locations",
    title: "الموجود حسب الغرفة / الموقع",
    description: "عرض وطباعة المواد والكميات الموجودة فعلياً في كل غرفة أو مستودع مع بيان الكمية المعهود بها.",
  },
  {
    href: "/reports/employees",
    title: "عهدة الموظفين",
    description: "عرض وطباعة العهدة الحالية لأي موظف موزعة حسب المواقع والغرف.",
  },
  {
    href: "/reports/item-card",
    title: "بطاقة حركة الصنف",
    description: "بطاقة إلكترونية شبيهة بدفتر اللوازم: رقم المستند، التاريخ، الإدخال، الإخراج، الرصيد والقيمة.",
  },
  {
    href: "/reports/movements",
    title: "سجل الحركات",
    description: "بحث وطباعة جميع حركات المواد حسب الفترة والنوع والموقع واسم أو رقم المادة.",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">التقارير والبحث</h2>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          تقارير مباشرة من سجل الحركات الحالي. الطباعة تستخدم نفس البيانات الظاهرة على الشاشة ولا تعدّل أي رصيد.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {reports.map((report) => (
          <Link
            key={report.href}
            href={report.href}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md"
          >
            <h3 className="text-lg font-bold text-slate-900">{report.title}</h3>
            <p className="mt-2 text-sm leading-7 text-slate-600">{report.description}</p>
            <span className="mt-4 inline-block text-sm font-bold text-blue-700">فتح التقرير ←</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
