import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const movementLabels: Record<string, string> = {
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

function dateStart(input: string) {
  return input ? new Date(`${input}T00:00:00`) : null;
}

function dateEnd(input: string) {
  return input ? new Date(`${input}T23:59:59.999`) : null;
}

function money(fils: number | null | undefined) {
  return fils == null ? "—" : (fils / 1000).toFixed(3);
}

export default async function ItemCardReport({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const itemId = value(params.itemId);
  const locationId = value(params.locationId);
  const fromText = value(params.from);
  const toText = value(params.to);
  const fromDate = dateStart(fromText);
  const toDate = dateEnd(toText);

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">يجب استيراد بيانات مركز الرمثا أولاً.</p>;

  const [items, locations] = await Promise.all([
    prisma.item.findMany({ where: { active: true }, orderBy: [{ itemCode: "asc" }, { name: "asc" }], include: { unit: true } }),
    prisma.location.findMany({ where: { centerId: center.id, active: true }, orderBy: { name: "asc" } }),
  ]);
  const item = items.find((candidate) => candidate.id === itemId) ?? null;
  const selectedLocation = locations.find((location) => location.id === locationId) ?? null;

  let rows: Array<{
    id: string;
    date: Date;
    documentNo: string;
    statement: string;
    inbound: number | null;
    outbound: number | null;
    balance: number;
    valueFils: number | null;
    notes: string;
  }> = [];
  let openingBalance = 0;

  if (item) {
    const movements = await prisma.inventoryMovement.findMany({
      where: {
        itemId: item.id,
        OR: [
          { document: { centerId: center.id } },
          { fromLocation: { centerId: center.id } },
          { toLocation: { centerId: center.id } },
        ],
      },
      include: {
        document: true,
        documentLine: true,
        fromLocation: true,
        toLocation: true,
        fromEmployee: true,
        toEmployee: true,
      },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }],
    });

    function delta(movement: (typeof movements)[number]) {
      let result = 0;
      if (selectedLocation) {
        if (movement.toLocationId === selectedLocation.id) result += movement.quantity;
        if (movement.fromLocationId === selectedLocation.id) result -= movement.quantity;
      } else {
        if (movement.toLocation?.centerId === center.id) result += movement.quantity;
        if (movement.fromLocation?.centerId === center.id) result -= movement.quantity;
      }
      return result;
    }

    if (fromDate) {
      openingBalance = movements
        .filter((movement) => movement.movementDate < fromDate)
        .reduce((sum, movement) => sum + delta(movement), 0);
    }

    let running = openingBalance;
    rows = movements
      .filter((movement) => (!fromDate || movement.movementDate >= fromDate) && (!toDate || movement.movementDate <= toDate))
      .map((movement) => {
        const change = delta(movement);
        running += change;
        const parties = [
          movement.fromEmployee?.fullName ?? movement.fromLocation?.name,
          movement.toEmployee?.fullName ?? movement.toLocation?.name,
        ].filter(Boolean).join(" ← ");
        return {
          id: movement.id,
          date: movement.movementDate,
          documentNo: movement.document?.documentNo ?? (movement.movementType === "OPENING" ? "افتتاحي" : "—"),
          statement: movement.document?.statement ?? `${movementLabels[movement.movementType] ?? movement.movementType}${parties ? ` — ${parties}` : ""}`,
          inbound: change > 0 ? change : null,
          outbound: change < 0 ? Math.abs(change) : null,
          balance: running,
          valueFils: movement.documentLine?.totalValueFils ?? null,
          notes: movement.notes ?? movement.documentLine?.notes ?? movement.document?.notes ?? "",
        };
      });
  }

  const finalBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-sm text-slate-500">التقارير</p><h2 className="mt-1 text-2xl font-bold text-slate-900">بطاقة حركة الصنف</h2></div>
        <div className="flex gap-2">{item ? <PrintButton label="طباعة البطاقة" /> : null}<Link href="/reports" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">كل التقارير</Link></div>
      </div>

      <form className="no-print grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium text-slate-700 lg:col-span-2">المادة<select name="itemId" defaultValue={itemId} required className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">اختر المادة</option>{items.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.itemCode ? `${candidate.itemCode} — ` : ""}{candidate.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">الموقع<select name="locationId" defaultValue={locationId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="">كل المركز</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">من تاريخ<input type="date" name="from" defaultValue={fromText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">إلى تاريخ<input type="date" name="to" defaultValue={toText} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <div className="lg:col-span-5"><button className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800">عرض البطاقة</button></div>
      </form>

      {!item ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">اختر مادة لعرض بطاقة حركتها.</section>
      ) : (
        <section className="print-sheet rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="mb-4 border-b border-slate-300 pb-4">
            <div className="text-center"><p className="text-sm font-bold">جمعية المركز الإسلامي الخيرية</p><p className="text-sm">قسم اللوازم والمشتريات — مركز الرمثا</p><h3 className="mt-2 text-xl font-bold">بطاقة حركة مادة</h3></div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4"><div><span className="text-slate-500">المادة:</span> <strong>{item.name}</strong></div><div><span className="text-slate-500">الرمز:</span> <strong>{item.itemCode ?? "—"}</strong></div><div><span className="text-slate-500">الوحدة:</span> <strong>{item.unit?.name ?? "—"}</strong></div><div><span className="text-slate-500">الموقع:</span> <strong>{selectedLocation?.name ?? "كل المركز"}</strong></div></div>
          </header>

          {fromDate ? <p className="mb-3 text-sm"><strong>الرصيد قبل الفترة:</strong> {openingBalance}</p> : null}
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-collapse text-xs print:min-w-0">
              <thead><tr className="bg-slate-100"><th className="border border-slate-400 px-2 py-2">رقم المستند</th><th className="border border-slate-400 px-2 py-2">التاريخ</th><th className="border border-slate-400 px-2 py-2 text-right">البيان</th><th className="border border-slate-400 px-2 py-2">الإدخالات</th><th className="border border-slate-400 px-2 py-2">الإخراجات</th><th className="border border-slate-400 px-2 py-2">الرصيد</th><th className="border border-slate-400 px-2 py-2">القيمة الإجمالية د.أ</th><th className="border border-slate-400 px-2 py-2 text-right">ملاحظات</th></tr></thead>
              <tbody>
                {rows.map((row) => <tr key={row.id}><td className="border border-slate-400 px-2 py-2 text-center">{row.documentNo}</td><td className="border border-slate-400 px-2 py-2 whitespace-nowrap text-center">{row.date.toLocaleDateString("ar-JO")}</td><td className="border border-slate-400 px-2 py-2">{row.statement}</td><td className="border border-slate-400 px-2 py-2 text-center font-bold">{row.inbound ?? "—"}</td><td className="border border-slate-400 px-2 py-2 text-center font-bold">{row.outbound ?? "—"}</td><td className="border border-slate-400 px-2 py-2 text-center font-bold">{row.balance}</td><td className="border border-slate-400 px-2 py-2 text-center">{money(row.valueFils)}</td><td className="border border-slate-400 px-2 py-2">{row.notes || "—"}</td></tr>)}
                {rows.length === 0 ? <tr><td colSpan={8} className="border border-slate-400 px-4 py-6 text-center text-slate-500">لا توجد حركات ضمن الفترة المحددة.</td></tr> : null}
              </tbody>
              <tfoot><tr className="font-bold"><td colSpan={5} className="border border-slate-400 px-2 py-2 text-left">الرصيد في نهاية التقرير</td><td className="border border-slate-400 px-2 py-2 text-center">{finalBalance}</td><td colSpan={2} className="border border-slate-400"></td></tr></tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
