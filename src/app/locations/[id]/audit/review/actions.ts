"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentCenter } from "@/lib/current-center";
import { prisma } from "@/lib/prisma";
import { postRoomAuditBatch } from "@/lib/inventory-posting";

function parseRequest(data: FormData) {
  const roomId = String(data.get("roomId") ?? "");
  const ids = String(data.get("ids") ?? "").split(",").filter(Boolean);
  if (!/^[a-zA-Z0-9_-]+$/.test(roomId) || ids.length < 1 || ids.length > 30 ||
      ids.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id)) || new Set(ids).size !== ids.length) {
    throw new Error("طلب الجرد غير صالح");
  }
  return { roomId, ids };
}

export async function approveRoomAudit(data: FormData) {
  const { roomId, ids } = parseRequest(data);
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز فعال");
  const room = await prisma.location.findFirst({ where: { id: roomId, centerId: center.id, active: true } });
  if (!room || room.code === "UNLOCATED") throw new Error("الغرفة غير صالحة");
  try {
    await postRoomAuditBatch(ids, center.id, room.id);
  } catch (error) {
    console.error("Room-audit batch was rolled back:", error);
    const query = new URLSearchParams({ ids: ids.join(","), error: "post_failed" });
    redirect(`/locations/${roomId}/audit/review?${query.toString()}`);
  }
  revalidatePath("/locations");
  revalidatePath(`/locations/${roomId}`);
  revalidatePath("/items");
  revalidatePath("/documents");
  redirect(`/locations/${roomId}?audit=approved`);
}

/** Cancel a complete unposted audit without ever touching inventory balances. */
export async function cancelRoomAudit(data: FormData) {
  const { roomId, ids } = parseRequest(data);
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز فعال");
  await prisma.$transaction(async (tx) => {
    const room = await tx.location.findFirst({ where: { id: roomId, centerId: center.id } });
    if (!room || room.code === "UNLOCATED") throw new Error("الغرفة غير صالحة");
    const docs = await tx.inventoryDocument.findMany({
      where: { id: { in: ids }, centerId: center.id },
      select: { id: true, documentNo: true, status: true, fromLocationId: true, toLocationId: true },
    });
    if (docs.length !== ids.length || docs.some((doc) => doc.status !== "DRAFT" ||
       (doc.fromLocationId !== roomId && doc.toLocationId !== roomId) ||
       !/^JRD-\d{8}-[a-f0-9]{8}-\d+$/.test(doc.documentNo ?? ""))) {
      throw new Error("تعذر إلغاء المسودات؛ يجب أن يكون الجرد كاملاً وغير معتمد");
    }
    const refs = new Set(docs.map((doc) => doc.documentNo!.replace(/-\d+$/, "")));
    if (refs.size !== 1) throw new Error("المسودات من جرود مختلفة");
    const total = await tx.inventoryDocument.count({
      where: { centerId: center.id, documentNo: { startsWith: [...refs][0] + "-" } },
    });
    if (total !== ids.length) throw new Error("لا يمكن إلغاء بعض حركات الجرد فقط");
    await tx.inventoryDocument.updateMany({ where: { id: { in: ids }, status: "DRAFT" }, data: { status: "CANCELLED" } });
  });
  revalidatePath("/locations");
  revalidatePath("/documents");
  redirect(`/locations/${roomId}/audit`);
}
