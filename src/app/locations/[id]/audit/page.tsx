import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getAssignedCustodyTotalsAtLocation } from "@/lib/custody-query";
import AuditForm from "./audit-form";

export const dynamic = "force-dynamic";

export default async function RoomAuditPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ newItemId?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const center = await getCurrentCenter();
  if (!center) notFound();
  const room = await prisma.location.findFirst({ where: { id, centerId: center.id, active: true } });
  if (!room || room.code === "UNLOCATED") notFound();

  const [balances, assigned, items, locations] = await Promise.all([
    getCenterInventoryBalances(center.id),
    getAssignedCustodyTotalsAtLocation(room.id),
    prisma.item.findMany({ select: { id: true, name: true, itemCode: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { centerId: center.id, active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
  ]);
  const known = items.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.itemCode,
    system: balances.itemLocationTotals.get(item.id)?.get(room.id) ?? 0,
    assigned: assigned.get(item.id) ?? 0,
  })).filter((item) => item.system > 0);
  const allItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    code: item.itemCode,
    total: balances.itemTotals.get(item.id) ?? 0,
    locations: [...(balances.itemLocationTotals.get(item.id) ?? new Map<string, number>())].filter(([, n]) => n > 0).map(([id, quantity]) => ({ id, quantity })),
  }));

  return <div className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-bold text-teal-700">الغرف / {room.name}</p>
        <h1 className="mt-1 text-3xl font-black text-slate-900">جرد الغرفة</h1>
        <p className="mt-2 text-sm leading-7 text-slate-500">الجرد لا يحذف المواد المفقودة؛ حدّد وجهتها أو ضعها في «غير محدد الموقع».</p>
      </div>
      <Link href={`/locations/${room.id}`} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">العودة إلى الغرفة</Link>
    </div>
    <AuditForm
      roomId={room.id}
      roomName={room.name}
      known={known}
      allItems={allItems}
      locations={locations}
      newItemId={query.newItemId ?? ""}
    />
  </div>;
}
