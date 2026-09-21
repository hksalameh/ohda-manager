import Link from "next/link";
import { MovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const movementLabels: Record<MovementType, string> = {
  OPENING: "رصيد افتتاحي",
  RECEIPT: "إدخال",
  ISSUE: "إخراج",
  CUSTODY_ASSIGN: "تسليم عهدة",
  CUSTODY_RETURN: "إرجاع عهدة",
  TRANSFER: "نقل",
  ADJUST_IN: "تسوية زيادة",
  ADJUST_OUT: "تسوية نقص",
};

function value(input: string | string[] | undefined) {
  return typeof input === "string" ? input.trim() : "";
}

function startDate(input: string) {
  return input ? new Date(`${input}T00:00:00`) : null;
}

function endDate(input: string) {
  return input ? new Date(`${input}T23:59:59.999`) : null;
}

export default async function MovementsReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const fromText = value(params.from);
  const toText = value(params.to);
  const typeText = value(params.type);
  const locationId = value(params.locationId);
  const q = value(params.q).toLowerCase();
  const from = startDate(fromText);
  const to = endDate(toText);
  const movementType = (Object.values(MovementType) as string[]).includes(typeText) ? typeText as MovementType : null;

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;

  const locations = await prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } });

  const where: Prisma.InventoryMovementWhereInput = {
    AND: [
      {
        OR: [
          { document: { centerId: center.id } },
          { fromLocation: { centerId: center.id } },
          { toLocation: { centerId: center.id } },
        ],
      },
      movementType ? { movementType } : {},
      locationId ? { OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] } : {},
      from || to ? { movementDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {},
    ],
  };

  const movements = await prisma.inventoryMovement.findMany({
    where,
    include: {
      item: { include: { unit: true } },
      document: true,
      fromLocation: true,
      toLocation: true,
      fromEmployee: true,
      toEmployee: true,
    },
    orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });

  const filtered = movements.filter((movement) => {
    if (!q) return true;
    const haystack = [
      movement.item.itemCode,
      movement.item.name,
      movement.document?.documentNo,
      movement.document?.statement,
      movement.fromLocation?.name,
      movement.toLocation?.name,
      movement.fromEmployee?.fullName,
      movement.toEmployee?.fullName,
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const totalIn = filtered.reduce((sum, movement) => sum + ([MovementType.OPENING, MovementType.RECEIPT, MovementType.ADJUST_IN].includes(movement.movementType) ? movement.quantity : 0), 0);
  const totalOut = filtered.reduce((sum, movement) => sum + ([MovementType.ISSUE, MovementType.ADJUST_OUT].includes(movement.movementType) ? movement.quantity : 0), 0);

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm text-slate-500">التقارير</p><h2 className="mt-1 text-2xl font-bold text-slate-900">سجل الحركات والبحث</h2></div>
        <div className="flex gap-2"><PrintButton label="طباعة النتائج" /><Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">كل التقارير</Link></div>
      </div>

      <form className="no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700">من تاريخ<input type="date" name="from" defaultValue={fromText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">إلى تاريخ<input type="date" name="to" defaultValue={toText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">نوع الحركة<select name="type" defaultValue={movementType ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">كل الحركات</option>{Object.values(MovementType).map((type) => <option key={type} value={type}>{movementLabels[type]}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">الموقع<select name="locationId" defaultValue={locationId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">كل المواقع</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">بحث<input name="q" defaultValue={value(params.q)} placeholder="مادة، سند، موظف..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="lg:col-span-5"><button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">تطبيق البحث</button></div>
      </form>

      <section className="print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <header className="mb-5 border-b border-slate-200 pb-4 text-center">
          <p className="text-sm font-bold">جمعية المركز الإسلامي الخيرية</p>
          <h3 className="mt-1 text-xl font-bold">سجل حركات اللوازم</h3>
          <p className="mt-1 text-sm text-slate-600">مركز الرمثا • تاريخ الطباعة {new Date().toLocaleDateString("ar-JO")}</p>
        </header>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">عدد الحركات</span><div className="mt-1 text-xl font-bold">{filtered.length}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">إجمالي الإدخال الخارجي/الزيادة</span><div className="mt-1 text-xl font-bold text-emerald-800">{totalIn}</div></div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">إجمالي الإخراج الخارجي/النقص</span><div className="mt-1 text-xl font-bold text-amber-800">{totalOut}</div></div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1050px] w-full border-collapse text-xs print:min-w-0">
            <thead><tr className="bg-slate-100"><th className="border border-slate-300 px-2 py-2">التاريخ</th><th className="border border-slate-300 px-2 py-2">الحركة</th><th className="border border-slate-300 px-2 py-2 text-right">رقم المادة</th><th className="border border-slate-300 px-2 py-2 text-right">المادة</th><th className="border border-slate-300 px-2 py-2">الكمية</th><th className="border border-slate-300 px-2 py-2 text-right">من</th><th className="border border-slate-300 px-2 py-2 text-right">إلى</th><th className="border border-slate-300 px-2 py-2">رقم المستند</th></tr></thead>
            <tbody>
              {filtered.map((movement) => <tr key={movement.id}><td className="border border-slate-300 px-2 py-2 whitespace-nowrap text-center">{movement.movementDate.toLocaleDateString("ar-JO")}</td><td className="border border-slate-300 px-2 py-2 font-medium">{movementLabels[movement.movementType]}</td><td className="border border-slate-300 px-2 py-2 font-mono">{movement.item.itemCode ?? "—"}</td><td className="border border-slate-300 px-2 py-2 font-medium">{movement.item.name}</td><td className="border border-slate-300 px-2 py-2 text-center font-bold">{movement.quantity}</td><td className="border border-slate-300 px-2 py-2">{movement.fromEmployee?.fullName ?? movement.fromLocation?.name ?? "—"}</td><td className="border border-slate-300 px-2 py-2">{movement.toEmployee?.fullName ?? movement.toLocation?.name ?? "—"}</td><td className="border border-slate-300 px-2 py-2 text-center">{movement.document?.documentNo ?? (movement.movementType === MovementType.OPENING ? "افتتاحي" : "—")}</td></tr>)}
              {filtered.length === 0 ? <tr><td colSpan={8} className="border border-slate-300 px-4 py-6 text-center text-slate-500">لا توجد حركات مطابقة للبحث.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
