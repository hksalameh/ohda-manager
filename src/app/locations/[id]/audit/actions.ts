"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getAssignedCustodyTotalsAtLocation, getCustodyHoldersForAudit } from "@/lib/custody-query";
import { NEW_STOCK, UNLOCATED, planRoomAudit, type AuditFound, type AuditKnown } from "@/lib/room-audit-plan";
import { planAuditCustodyReturns } from "@/lib/room-audit-custody";

function strings(data: FormData, key: string) {
  return data.getAll(key).map((value) => typeof value === "string" ? value.trim() : "");
}
function string(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function parseQuantity(s: string) {
  if (!/^\d+$/.test(s)) throw new Error("يجب جرد كل مادة وإدخال عدد صحيح، ويمكن إدخال صفر للمفقود");
  return Number(s);
}

export async function saveRoomAudit(data: FormData) {
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز فعال");
  const roomId = string(data, "roomId");
  const room = await prisma.location.findFirst({ where: { id: roomId, centerId: center.id, active: true } });
  if (!room || room.code === UNLOCATED) throw new Error("اختر غرفة صالحة للجرد");

  const [balances, assignedTotals, locations] = await Promise.all([
    getCenterInventoryBalances(center.id),
    getAssignedCustodyTotalsAtLocation(roomId),
    prisma.location.findMany({ where: { centerId: center.id, active: true }, select: { id: true, name: true, code: true } }),
  ]);
  const quantityById = new Map(
    [...balances.itemLocationTotals].map(([id, quantities]) => [id, quantities.get(roomId) ?? 0]),
  );
  const expectedIds = [...quantityById].filter(([, quantity]) => quantity > 0).map(([id]) => id);

  const ids = strings(data, "knownId");
  const actuals = strings(data, "knownActual");
  const originals = strings(data, "knownSystem");
  const destinations = strings(data, "knownDestination");
  const surplusSources = strings(data, "knownSurplusSource");
  if (ids.length !== expectedIds.length || new Set(ids).size !== ids.length ||
      ids.some((id) => !expectedIds.includes(id)) ||
      actuals.length !== ids.length || originals.length !== ids.length || destinations.length !== ids.length ||
      surplusSources.length !== ids.length) {
    throw new Error("تغيرت بيانات الغرفة أثناء الجرد. حدّث الصفحة وراجع الكميات قبل الحفظ.");
  }
  if (ids.some((itemId, index) => parseQuantity(originals[index]) !== (quantityById.get(itemId) ?? 0))) {
    throw new Error("تغيرت أرصدة المواد منذ فتح شاشة الجرد. حدّث الصفحة وراجع الأعداد.");
  }
  const known: AuditKnown[] = ids.map((itemId, index) => ({
    itemId,
    systemQuantity: quantityById.get(itemId) ?? 0,
    assignedQuantity: assignedTotals.get(itemId) ?? 0,
    actualQuantity: parseQuantity(actuals[index]),
    destinationId: destinations[index],
    surplusSourceId: surplusSources[index],
  }));

  const extraIds = strings(data, "extraId");
  const extraQuantities = strings(data, "extraQuantity");
  const extraSources = strings(data, "extraSource");
  if (extraIds.length !== extraQuantities.length || extraIds.length !== extraSources.length)
    throw new Error("بيانات المواد المضافة غير مكتملة");
  const found: AuditFound[] = extraIds.map((itemId, index) => ({
    itemId, quantity: parseQuantity(extraQuantities[index]), sourceId: extraSources[index],
  }));
  const operations = planRoomAudit(roomId, known, found);

  const validItems = await prisma.item.findMany({
    where: { id: { in: [...ids, ...extraIds] } },
    include: { unit: true },
  });
  const itemMap = new Map(validItems.map((item) => [item.id, item]));
  if (itemMap.size !== new Set([...ids, ...extraIds]).size) throw new Error("إحدى المواد غير صالحة أو محذوفة");

  for (const op of operations) {
    if (op.kind === "INCREASE" && (balances.itemTotals.get(op.itemId) ?? 0) > 0) {
      throw new Error("لا يمكن اعتبار مادة لها رصيد قائم إضافة جديدة أثناء الجرد. انقلها من موقعها، أو سجّل شراءً/تبرعًا جديدًا بسند إدخال مستقل.");
    }
  }
  const locationIds = new Set(locations.map((location) => location.id));
  const unlocated = locations.find((location) => location.code === UNLOCATED);
  const availableBySource = new Map<string, { itemId: string; locationId: string; quantity: number }>();
  for (const op of operations) {
    if (op.to !== UNLOCATED && !locationIds.has(op.to))
      throw new Error("الغرفة المحددة كوجهة لم تعد موجودة");
    if (op.from && !locationIds.has(op.from))
      throw new Error("الموقع المحدد كمصدر غير صالح");
    if (op.to === op.from) throw new Error("لا يمكن نقل المادة داخل الغرفة نفسها");
    if (op.from) {
      const key = `${op.itemId}\u0000${op.from}`;
      const previous = availableBySource.get(key);
      availableBySource.set(key, {
        itemId: op.itemId,
        locationId: op.from,
        quantity: (previous?.quantity ?? 0) + op.quantity,
      });
    }
  }
  const sourceRows = [...availableBySource.values()];
  const holders = await getCustodyHoldersForAudit(
    [...new Set(sourceRows.map((source) => source.locationId))],
    [...new Set(sourceRows.map((source) => source.itemId))],
  );
  const plannedReturns = planAuditCustodyReturns(operations, sourceRows.map((source) => ({
    itemId: source.itemId,
    locationId: source.locationId,
    physical: balances.itemLocationTotals.get(source.itemId)?.get(source.locationId) ?? 0,
    holders: holders.get(`${source.itemId}\u0000${source.locationId}`) ?? [],
  })));
  if (plannedReturns.length) {
    const employees = await prisma.employee.count({
      where: { centerId: center.id, id: { in: [...new Set(plannedReturns.map((entry) => entry.employeeId))] } },
    });
    if (employees !== new Set(plannedReturns.map((entry) => entry.employeeId)).size)
      throw new Error("لا يمكن تسوية عهدة مرتبطة بموظف خارج المركز");
  }

  if (operations.length === 0) {
    redirect(`/locations/${roomId}?audit=matched`);
  }

  // This is only a DRAFT. It does not change any inventory balance until
  // the existing document approval/posting mechanism verifies it again.
  const reference = `JRD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8)}`;
  const groups = new Map<string, typeof operations>();
  for (const op of operations) {
    const key = `${op.kind}:${op.from ?? NEW_STOCK}:${op.to}`;
    groups.set(key, [...(groups.get(key) ?? []), op]);
  }
  const created = await prisma.$transaction(async (tx) => {
    const pendingAudit = await tx.inventoryDocument.count({
      where: { centerId: center.id, status: "DRAFT", documentNo: { startsWith: "JRD-" }, OR: [{ fromLocationId: roomId }, { toLocationId: roomId }] },
    });
    if (pendingAudit > 0) throw new Error("يوجد جرد سابق لم تُعتمد حركاته بعد. اعتمده أو ألغِ مسوداته قبل إنشاء جرد جديد.");
    let unlocatedId = unlocated?.id;
    if (operations.some((op) => op.to === UNLOCATED) && !unlocatedId) {
      const record = await tx.location.upsert({
        where: { centerId_code: { centerId: center.id, code: UNLOCATED } },
        create: { centerId: center.id, code: UNLOCATED, name: "مواد غير محددة الموقع", type: "OTHER" },
        update: { active: true },
      });
      unlocatedId = record.id;
    }
    const ids: string[] = [];
    // Stage custody releases before transfers: every release and transfer
    // gets the same audit reference and is later posted in ONE transaction.
    const returnGroups = new Map<string, typeof plannedReturns>();
    for (const entry of plannedReturns) {
      const key = `${entry.locationId}\u0000${entry.employeeId}`;
      returnGroups.set(key, [...(returnGroups.get(key) ?? []), entry]);
    }
    for (const lines of returnGroups.values()) {
      const first = lines[0];
      const roomLabel = locations.find((location) => location.id === first.locationId)?.name ?? "الموقع المصدر";
      const doc = await tx.inventoryDocument.create({
        data: {
          centerId: center.id,
          documentType: "RETURN",
          documentNo: `${reference}-${ids.length + 1}`,
          documentDate: new Date(),
          fromLocationId: first.locationId,
          toLocationId: first.locationId,
          employeeId: first.employeeId,
          statement: `إرجاع عهدة لتصحيح موقع مواد ثبت انتقالها عند جرد ${room.name}`,
          notes: `محضر تسوية عهدة ${roomLabel} ضمن الجرد ${reference}؛ يتطلب توثيق توقيع المسؤول، ولا يعني الإقرار باستلام فعلي جديد.`,
          lines: { create: lines.map((line, index) => {
            const item = itemMap.get(line.itemId)!;
            return {
              lineNo: index + 1,
              itemId: item.id,
              quantity: line.quantity,
              itemCodeSnapshot: item.itemCode,
              itemNameSnapshot: item.name,
              unitNameSnapshot: item.unit?.name ?? null,
              ledgerPageNo: item.legacyLedgerPageNo,
              notes: "تسوية عهدة عند جرد موقع مغاير",
            };
          }) },
        },
      });
      ids.push(doc.id);
    }
    for (const [key, lines] of groups) {
      const first = lines[0];
      const fromId = first.from;
      const toId = first.to === UNLOCATED ? unlocatedId! : first.to;
      const incoming = first.kind === "INCREASE";
      const doc = await tx.inventoryDocument.create({
        data: {
          centerId: center.id,
          documentType: incoming ? "ADJUSTMENT" : "TRANSFER",
          documentNo: `${reference}-${ids.length + 1}`,
          documentDate: new Date(),
          fromLocationId: incoming ? null : fromId,
          toLocationId: toId,
          statement: incoming ? `إضافة موجودات تم العثور عليها بجرد ${room.name}` : `نقل بناءً على جرد ${room.name}`,
          notes: `مرجع جرد الغرفة ${room.name}: ${reference}. ${first.to === UNLOCATED ? "الموقع الفعلي غير معروف بعد؛ يلزم تحديده لاحقاً." : "مراجعة النقل قبل الاعتماد."}`,
          lines: { create: lines.map((line, index) => {
            const item = itemMap.get(line.itemId)!;
            return {
              lineNo: index + 1,
              itemId: item.id,
              quantity: line.quantity,
              itemCodeSnapshot: item.itemCode,
              itemNameSnapshot: item.name,
              unitNameSnapshot: item.unit?.name ?? null,
              ledgerPageNo: item.legacyLedgerPageNo,
              notes: "نتيجة جرد الغرفة",
            };
          }) },
        },
      });
      ids.push(doc.id);
    }
    return ids;
  });

  revalidatePath("/locations");
  revalidatePath(`/locations/${roomId}`);
  revalidatePath("/items");
  revalidatePath("/documents");
  redirect(`/locations/${roomId}/audit/review?ids=${created.join(",")}`);
}
