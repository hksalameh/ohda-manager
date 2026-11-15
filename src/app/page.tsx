import Link from "next/link";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { authEnabled, isDesktopSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

const routes = [
  { href: "/items", title: "جميع المواد", text: "كل مادة، رصيدها، والغرف التي توجد فيها مع عدد القطع بكل غرفة.", action: "عرض المواد وأماكنها", number: "01", color: "bg-teal-700" },
  { href: "/locations", title: "الغرف والجرد", text: "افتح أي غرفة وحدّد الموجود والمفقود، وانقل القطع أو ضعها في غير محدد الموقع.", action: "فتح الغرف والجرد", number: "02", color: "bg-blue-700" },
  { href: "/locations/unlocated", title: "غير محدد الموقع", text: "قائمة القطع التي لم تحدد مكانها بعد؛ أعد توزيعها بعد معرفة غرفتها.", action: "متابعة المواد", number: "03", color: "bg-amber-700" },
];

export default async function HomePage() {
  const center = await getCurrentCenter();
  if (!center) return <p>لا يوجد مركز مفعّل بعد.</p>;
  const [itemsCount, roomsCount, employeesCount, balances, unlocated] = await Promise.all([
    prisma.item.count({ where: { active: true } }),
    prisma.location.count({ where: { centerId: center.id, active: true, NOT: { code: "UNLOCATED" } } }),
    prisma.employee.count({ where: { centerId: center.id, active: true } }),
    getCenterInventoryBalances(center.id),
    prisma.location.findFirst({ where: { centerId: center.id, code: "UNLOCATED" } }),
  ]);
  const total = [...balances.itemTotals.values()].reduce((n, qty) => n + qty, 0);
  const unknown = unlocated ? balances.locationTotals.get(unlocated.id) ?? 0 : 0;
  const lanUrl = process.env.OHDA_LAN_URL?.trim() ?? "";
  const showPhoneAccess = Boolean(lanUrl) && isDesktopSession(await cookies());
  const lanQr = showPhoneAccess ? await QRCode.toString(lanUrl, { type: "svg", margin: 1 }) : "";

  return <div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-3xl bg-slate-950 p-7 text-white shadow-lg md:p-10">
      <p className="text-sm font-bold text-teal-300">نظام إدارة العهدة • {center.name}</p>
      <h1 className="mt-3 text-3xl font-black md:text-4xl">أين موجود كل غرض؟</h1>
      <p className="mt-3 max-w-3xl text-sm leading-8 text-slate-200">من هنا تستطيع معرفة كل مادة وغرفتها، جرد كل غرفة، تحديد مكان المفقود، ثم إنشاء سند عهدة الموظف من المواد التي تم اعتمادها.</p>
      <Link href="/locations" className="mt-6 inline-block rounded-xl bg-teal-500 px-7 py-3.5 font-extrabold text-white hover:bg-teal-600">فتح الغرف والبدء بالجرد</Link>
    </section>
    {!authEnabled() && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950">تنبيه: اضبط رمز دخول قبل تمكين أجهزة أخرى على الشبكة أو عبر الإنترنت.</section>}
    <section className="grid gap-3 sm:grid-cols-4">
      {[["المواد", itemsCount], ["الغرف", roomsCount], ["إجمالي القطع", total], ["بانتظار تحديد موقعها", unknown]].map(([label, count]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><strong className="mt-2 block text-3xl font-black text-slate-900">{count}</strong></div>)}
    </section>
    <section className="grid gap-4 lg:grid-cols-3">
      {routes.map((route) => <Link href={route.href} key={route.href} className="group flex min-h-56 flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-400 hover:shadow-lg">
        <span className="text-sm font-black text-teal-700">{route.number}</span>
        <h2 className="mt-3 text-2xl font-extrabold text-slate-950">{route.title}</h2>
        <p className="mt-3 flex-1 text-sm leading-7 text-slate-600">{route.text}</p>
        <span className={`mt-5 rounded-xl ${route.color} px-4 py-3 text-center text-sm font-bold text-white`}>{route.action}</span>
      </Link>)}
    </section>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div><p className="text-xs font-bold text-emerald-700">الخطوة بعد انتهاء الجرد</p><h2 className="mt-1 text-xl font-black text-slate-950">طباعة سند عهدة الموظف</h2>
        <p className="mt-2 text-sm text-slate-600">اختر الموظف بعد اعتماد حركات الجرد، واطبع سند التسليم بالقالب نفسه الذي تم الاتفاق عليه.</p></div>
      <Link href="/custody/new" className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-extrabold text-white">إنشاء سند عهدة</Link>
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-extrabold text-slate-800">الإدارة والإعدادات والسندات القديمة</summary>
      <div className="mt-4 flex flex-wrap gap-2">
        {[["الموظفون", "/employees"], ["تعديل الغرف", "/locations/manage"], ["سندات الإدخال والإخراج", "/documents"], ["العهد الحالية", "/custody?mode=employees"], ["التقارير", "/reports"], ["ملصقات QR", "/labels"]].map(([label, href]) => <Link key={href} href={href} className="rounded-lg border bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700">{label}</Link>)}
      </div>
      <p className="mt-3 text-xs text-slate-500">الموظفون المسجلون: {employeesCount}</p>
    </details>
    {showPhoneAccess && <details className="rounded-2xl border bg-white p-5">
      <summary className="cursor-pointer text-sm font-extrabold">الوصول من الهاتف على شبكة المكتب</summary>
      <div className="mt-4 flex flex-wrap items-center gap-4"><div className="w-36 [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: lanQr }}/><div><p dir="ltr" className="font-mono text-sm">{lanUrl}</p><p className="text-xs">رمز الدخول يظهر في برنامج ويندوز فقط.</p></div></div>
    </details>}
  </div>;
}
