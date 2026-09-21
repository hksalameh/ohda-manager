import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { StocktakeForm } from "./stocktake-form";

export const dynamic = "force-dynamic";

function isoDate(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function StocktakePage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string; matched?: string }>;
}) {
  const params = await searchParams;
  const center = await getCurrentCenter();
  if (!center) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;
  }

  const locations = await prisma.location.findMany({
    where: { centerId: center.id, active: true },
    orderBy: { name: "asc" },
  });

  const selectedLocation = params.locationId
    ? locations.find((location) => location.id === params.locationId) ?? null
    : null;

  let expectedItems: Array<{
    id: string;
    itemCode: string | null;
    name: string;
    unitName: string | null;
    systemQuantity: number;
  }> = [];
  let allItems: Array<{ id: string; itemCode: string | null; name: string; unitName: string | null }> = [];
  let employees: Array<{
    id: string;
    fullName: string;
    employeeNo: string | null;
    locationName: string | null;
  }> = [];

  if (selectedLocation) {
    const [balances, items, centerEmployees] = await Promise.all([
      getCenterInventoryBalances(center.id),
      prisma.item.findMany({
        where: { active: true },
        include: { unit: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.employee.findMany({
        where: { centerId: center.id, active: true },
        orderBy: { fullName: "asc" },
        include: {
          locationAssignments: {
            where: { isPrimary: true, endsAt: null },
            orderBy: { startsAt: "desc" },
            take: 1,
            include: { location: true },
          },
        },
      }),
    ]);

    allItems = items.map((item) => ({
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      unitName: item.unit?.name ?? null,
    }));

    expectedItems = items
      .map((item) => ({
        id: item.id,
        itemCode: item.itemCode,
        name: item.name,
        unitName: item.unit?.name ?? null,
        systemQuantity: balances.itemLocationTotals.get(item.id)?.get(selectedLocation.id) ?? 0,
      }))
      .filter((item) => item.systemQuantity > 0);

    employees = centerEmployees.map((employee) => ({
      id: employee.id,
      fullName: employee.fullName,
      employeeNo: employee.employeeNo,
      locationName: employee.locationAssignments[0]?.location.name ?? null,
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-slate-500">المخزون / الجرد</p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">جرد الغرفة وتجهيز العهدة</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
            اختر الغرفة، ابحث عن المواد الموجودة فيها وأدخل الكميات الفعلية. ويمكنك في نفس العملية تحديد الشخص المستلم لتجهيز مسودة سند عهدة قابلة للمراجعة ثم الطباعة.
          </p>
        </div>
        <Link href="/documents" className="rounded-lg border border-slate-300 px-4 py-2 text-center text-sm font-medium hover:bg-slate-50">المستندات</Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="text-sm font-medium text-slate-700">
            الغرفة / الموقع المراد جرده
            <select name="locationId" required defaultValue={selectedLocation?.id ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base">
              <option value="" disabled>اختر الغرفة / الموقع</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <button className="rounded-lg bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800">فتح الغرفة وبدء الجرد</button>
        </form>
      </section>

      {params.matched === "1" && selectedLocation ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-7 text-emerald-950">
          الكميات التي أدخلتها مطابقة لرصيد النظام في {selectedLocation.name}، لذلك لم يلزم إنشاء تسوية مخزون.
        </section>
      ) : null}

      {selectedLocation ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            المركز: <strong>{center.name}</strong> • الغرفة الحالية: <strong>{selectedLocation.name}</strong> • الأصناف المسجلة فيها: <strong>{expectedItems.length}</strong>
          </section>
          <StocktakeForm
            locationId={selectedLocation.id}
            locationName={selectedLocation.name}
            expectedItems={expectedItems}
            allItems={allItems}
            employees={employees}
            today={isoDate()}
          />
        </>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          اختر غرفة أو موقعاً أولاً لعرض المواد وبدء الجرد.
        </section>
      )}
    </div>
  );
}
