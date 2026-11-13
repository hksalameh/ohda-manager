import Link from "next/link";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { authEnabled, isDesktopSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

export const dynamic = "force-dynamic";

function Stat({ title, value, note }: { title: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-900">{value}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

function TaskCard({
  href,
  number,
  title,
  description,
  action,
  tone = "blue",
}: {
  href: string;
  number: string;
  title: string;
  description: string;
  action: string;
  tone?: "blue" | "emerald" | "amber" | "slate";
}) {
  const tones = {
    blue: "border-blue-200 bg-blue-50/70 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50/70 text-emerald-900",
    amber: "border-amber-200 bg-amber-50/70 text-amber-950",
    slate: "border-slate-200 bg-white text-slate-900",
  };
  const buttons = {
    blue: "bg-blue-700 text-white",
    emerald: "bg-emerald-700 text-white",
    amber: "bg-amber-700 text-white",
    slate: "bg-slate-900 text-white",
  };

  return (
    <Link href={href} className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${tones[tone]}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-lg font-black shadow-sm">{number}</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-extrabold">{title}</h3>
          <p className="mt-2 text-sm leading-7 opacity-80">{description}</p>
          <span className={`mt-4 inline-block rounded-lg px-4 py-2 text-sm font-bold ${buttons[tone]}`}>{action}</span>
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const center = await getCurrentCenter();
  if (!center) return <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">لا يوجد مركز مفعّل بعد.</section>;

  const [itemCount, locationCount, employeeCount, documentCount, draftCount, balances] = await Promise.all([
    prisma.item.count({ where: { active: true } }),
    prisma.location.count({ where: { centerId: center.id, active: true } }),
    prisma.employee.count({ where: { centerId: center.id, active: true } }),
    prisma.inventoryDocument.count({ where: { centerId: center.id } }),
    prisma.inventoryDocument.count({ where: { centerId: center.id, status: "DRAFT" } }),
    getCenterInventoryBalances(center.id),
  ]);

  const currentTotal = [...balances.itemTotals.values()].reduce((sum, quantity) => sum + quantity, 0);

  // بطاقة ربط الهاتف تظهر فقط داخل برنامج ويندوز على الكمبيوتر نفسه، لأنها تعرض رمز الدخول.
  const lanUrl = process.env.OHDA_LAN_URL?.trim() ?? "";
  const showPhoneAccess = Boolean(lanUrl) && isDesktopSession(await cookies());
  const lanQrSvg = showPhoneAccess ? await QRCode.toString(lanUrl, { type: "svg", margin: 1 }) : "";
  const accessPin = authEnabled() ? process.env.OHDA_PASSWORD?.trim() ?? "" : "";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <p className="text-xs font-bold text-blue-700">مركز العمل</p>
        <h2 className="mt-1 text-3xl font-extrabold text-slate-900">ماذا تريد أن تعمل الآن؟</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          اختر المهمة مباشرة. لا تحتاج للدخول إلى قوائم المستندات أو معرفة اسم العملية داخل النظام.
        </p>
      </section>

      {!authEnabled() ? (
        <section className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm leading-7 text-red-950">
          <strong>تنبيه أمني:</strong> النظام مفتوح لأي جهاز على نفس الشبكة دون رمز دخول. أضف <code className="rounded bg-white px-1">OHDA_PASSWORD</code> إلى ملف <code className="rounded bg-white px-1">.env</code> ثم أعد التشغيل.
        </section>
      ) : null}

      {showPhoneAccess ? (
        <section className="flex flex-col gap-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <div className="mx-auto w-36 shrink-0 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: lanQrSvg }} />
          <div className="min-w-0">
            <h3 className="text-lg font-extrabold text-slate-900">الجرد من الهاتف</h3>
            <p className="mt-1 text-sm leading-7 text-slate-600">وصّل الهاتف بنفس شبكة الواي فاي، ثم امسح هذا الرمز بكاميرا الهاتف أو افتح العنوان:</p>
            <p dir="ltr" className="mt-1 break-all text-right font-mono text-base font-bold text-blue-800">{lanUrl}</p>
            {accessPin ? <p className="mt-2 text-sm text-slate-700">رمز الدخول: <strong dir="ltr" className="font-mono text-xl tracking-widest text-slate-900">{accessPin}</strong></p> : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <TaskCard
          href="/stocktake"
          number="1"
          title="جرد غرفة"
          description="اختر الغرفة، شاهد المواد المسجلة فيها، أدخل الموجود فعليًا ثم راجع الفروقات قبل الاعتماد."
          action="ابدأ الجرد"
          tone="blue"
        />
        <TaskCard
          href="/custody/new"
          number="2"
          title="تسليم عهدة شخصية"
          description="اختر الموظف، راجع المواد المتاحة في غرفته، اعتمد السند ثم انتقل مباشرة إلى الطباعة."
          action="إنشاء سند تسليم"
          tone="emerald"
        />
        <TaskCard
          href="/custody?mode=employees"
          number="3"
          title="عرض أو إرجاع عهدة موظف"
          description="اعرف ما هو مسجل على كل موظف، ثم أرجع جزءًا من العهدة أو كلها عند الحاجة."
          action="فتح العهد الحالية"
          tone="amber"
        />
        <TaskCard
          href="/items"
          number="4"
          title="البحث عن مادة"
          description="ابحث برقم المادة أو اسمها واعرف رصيدها ومكانها وكل ما يتعلق بها من حركة."
          action="فتح سجل المواد"
          tone="slate"
        />
      </section>

      <section>
        <div className="mb-3">
          <h3 className="text-lg font-extrabold text-slate-900">ملخص سريع</h3>
          <p className="mt-1 text-xs text-slate-500">للمراجعة فقط؛ لا تحتاج هذه الأرقام لتنفيذ المهام الرئيسية.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat title="إجمالي القطع الحالية" value={currentTotal} />
          <Stat title="المواد" value={itemCount} />
          <Stat title="الغرف والمواقع" value={locationCount} />
          <Stat title="الموظفون" value={employeeCount} />
          <Stat title="المسودات غير المكتملة" value={draftCount} note={`من أصل ${documentCount} سندًا`} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-extrabold text-slate-900">إدارة وسجلات</h3>
        <p className="mt-1 text-xs text-slate-500">هذه الخيارات أقل استخدامًا في العمل اليومي.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Link href="/employees" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">الموظفون</Link>
          <Link href="/locations" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">الغرف والمواقع</Link>
          <Link href="/documents/new?type=receipt" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">سند إدخال</Link>
          <Link href="/documents/new?type=issue" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">سند إخراج</Link>
          <Link href="/documents" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">كل السندات</Link>
          <Link href="/reports" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-bold text-slate-700 hover:bg-slate-100">التقارير</Link>
        </div>
      </section>
    </div>
  );
}
