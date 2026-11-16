import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Assign an employee to several rooms without changing any stock or custody. */
export async function saveEmployeeRoomsInTransaction(tx: Tx, input: {
  centerId: string;
  employeeId: string;
  locationIds: string[];
  primaryLocationId?: string | null;
}) {
  const selected = [...new Set(input.locationIds)];
  if (selected.some((id) => !id || !/^[a-zA-Z0-9_-]+$/.test(id)))
    throw new Error("اختيار الغرف غير صالح");
  const [employee, validLocations, existing] = await Promise.all([
    tx.employee.findFirst({ where: { id: input.employeeId, centerId: input.centerId, active: true }, select: { id: true } }),
    tx.location.findMany({ where: { id: { in: selected }, centerId: input.centerId, active: true, OR: [{ code: null }, { code: { not: "UNLOCATED" } }] }, select: { id: true } }),
    tx.employeeLocationAssignment.findMany({ where: { employeeId: input.employeeId, endsAt: null }, orderBy: [{ startsAt: "desc" }, { id: "asc" }] }),
  ]);
  if (!employee || validLocations.length !== selected.length) throw new Error("الموظف أو إحدى الغرف غير صالح");
  const currentPrimary = existing.find((assignment) => assignment.isPrimary)?.locationId;
  const primary = input.primaryLocationId && selected.includes(input.primaryLocationId)
    ? input.primaryLocationId
    : currentPrimary && selected.includes(currentPrimary) ? currentPrimary : selected[0] ?? null;
  if (input.primaryLocationId && !selected.includes(input.primaryLocationId))
    throw new Error("الغرفة الرئيسية يجب أن تكون إحدى الغرف المحددة");

  const removed = existing.filter((assignment) => !selected.includes(assignment.locationId));
  if (removed.length) {
    const removedIds = [...new Set(removed.map((entry) => entry.locationId))];
    const movements = await tx.inventoryMovement.findMany({
      where: {
        OR: [
          { toEmployeeId: input.employeeId, toLocationId: { in: removedIds } },
          { fromEmployeeId: input.employeeId, fromLocationId: { in: removedIds } },
        ],
      },
      select: { itemId: true, quantity: true, fromEmployeeId: true, toEmployeeId: true, fromLocationId: true, toLocationId: true },
    });
    const custodyByLocationAndItem = new Map<string, number>();
    for (const movement of movements) {
      if (movement.toEmployeeId === input.employeeId && movement.toLocationId) {
        const key = `${movement.toLocationId}\u0000${movement.itemId}`;
        custodyByLocationAndItem.set(key, (custodyByLocationAndItem.get(key) ?? 0) + movement.quantity);
      }
      if (movement.fromEmployeeId === input.employeeId && movement.fromLocationId) {
        const key = `${movement.fromLocationId}\u0000${movement.itemId}`;
        custodyByLocationAndItem.set(key, (custodyByLocationAndItem.get(key) ?? 0) - movement.quantity);
      }
    }
    if ([...custodyByLocationAndItem.values()].some((quantity) => quantity > 0))
      throw new Error("لا يمكن إزالة غرفة ما زالت فيها عهدة مسجلة على الموظف. أرجع العهدة أو انقلها أولًا.");
  }

  const now = new Date();
  for (const assignment of removed) {
    await tx.employeeLocationAssignment.update({ where: { id: assignment.id }, data: { endsAt: now } });
  }
  const kept = new Set<string>();
  for (const assignment of existing) {
    if (!selected.includes(assignment.locationId)) continue;
    if (kept.has(assignment.locationId)) {
      await tx.employeeLocationAssignment.update({ where: { id: assignment.id }, data: { endsAt: now } });
      continue;
    }
    kept.add(assignment.locationId);
    await tx.employeeLocationAssignment.update({ where: { id: assignment.id }, data: { isPrimary: assignment.locationId === primary } });
  }
  for (const locationId of selected.filter((id) => !kept.has(id))) {
    await tx.employeeLocationAssignment.create({
      data: { employeeId: input.employeeId, locationId, startsAt: now, isPrimary: locationId === primary },
    });
  }
  return { count: selected.length, primaryLocationId: primary };
}

/** Legacy single-room selectors only change the primary; other rooms survive. */
export async function setPrimaryEmployeeRoomInTransaction(tx: Tx, input: {
  centerId: string; employeeId: string; locationId: string;
}) {
  const current = await tx.employeeLocationAssignment.findMany({
    where: { employeeId: input.employeeId, endsAt: null },
    select: { locationId: true },
  });
  const rooms = [...new Set([...current.map((assignment) => assignment.locationId), input.locationId])];
  return saveEmployeeRoomsInTransaction(tx, {
    centerId: input.centerId, employeeId: input.employeeId,
    locationIds: rooms, primaryLocationId: input.locationId,
  });
}
