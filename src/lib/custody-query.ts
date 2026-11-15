import { prisma } from "./prisma";

export type EmployeeCustodyBalance = {
  itemId: string;
  locationId: string;
  quantity: number;
};

export async function getEmployeeCustodyBalances(employeeId: string): Promise<EmployeeCustodyBalance[]> {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [{ toEmployeeId: employeeId }, { fromEmployeeId: employeeId }],
    },
    select: {
      itemId: true,
      quantity: true,
      toEmployeeId: true,
      fromEmployeeId: true,
      toLocationId: true,
      fromLocationId: true,
    },
  });

  const balances = new Map<string, EmployeeCustodyBalance>();

  for (const movement of movements) {
    if (movement.toEmployeeId === employeeId && movement.toLocationId) {
      const key = `${movement.itemId}|${movement.toLocationId}`;
      const current = balances.get(key) ?? {
        itemId: movement.itemId,
        locationId: movement.toLocationId,
        quantity: 0,
      };
      current.quantity += movement.quantity;
      balances.set(key, current);
    }

    if (movement.fromEmployeeId === employeeId && movement.fromLocationId) {
      const key = `${movement.itemId}|${movement.fromLocationId}`;
      const current = balances.get(key) ?? {
        itemId: movement.itemId,
        locationId: movement.fromLocationId,
        quantity: 0,
      };
      current.quantity -= movement.quantity;
      balances.set(key, current);
    }
  }

  return [...balances.values()].filter((balance) => balance.quantity > 0);
}

export async function getAssignedCustodyTotalsAtLocation(locationId: string): Promise<Map<string, number>> {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [
        { toLocationId: locationId, toEmployeeId: { not: null } },
        { fromLocationId: locationId, fromEmployeeId: { not: null } },
      ],
    },
    select: {
      itemId: true,
      quantity: true,
      toEmployeeId: true,
      fromEmployeeId: true,
      toLocationId: true,
      fromLocationId: true,
    },
  });

  const totals = new Map<string, number>();
  for (const movement of movements) {
    let quantity = totals.get(movement.itemId) ?? 0;
    if (movement.toEmployeeId && movement.toLocationId === locationId) quantity += movement.quantity;
    if (movement.fromEmployeeId && movement.fromLocationId === locationId) quantity -= movement.quantity;
    totals.set(movement.itemId, quantity);
  }

  return new Map([...totals.entries()].filter(([, quantity]) => quantity > 0));
}

/** Positive employee holdings by item and room, for room-audit reconciliation. */
export async function getCustodyHoldersForAudit(locationIds: string[], itemIds: string[]) {
  const result = new Map<string, { employeeId: string; quantity: number }[]>();
  if (!locationIds.length || !itemIds.length) return result;
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      itemId: { in: itemIds },
      OR: [
        { toLocationId: { in: locationIds }, toEmployeeId: { not: null } },
        { fromLocationId: { in: locationIds }, fromEmployeeId: { not: null } },
      ],
    },
    select: {
      itemId: true, quantity: true,
      fromEmployeeId: true, toEmployeeId: true,
      fromLocationId: true, toLocationId: true,
    },
  });
  const holdings = new Map<string, Map<string, number>>();
  const change = (itemId: string, locationId: string, employeeId: string, quantity: number) => {
    const key = `${itemId}\u0000${locationId}`;
    const employees = holdings.get(key) ?? new Map<string, number>();
    employees.set(employeeId, (employees.get(employeeId) ?? 0) + quantity);
    holdings.set(key, employees);
  };
  for (const movement of movements) {
    if (movement.toEmployeeId && movement.toLocationId)
      change(movement.itemId, movement.toLocationId, movement.toEmployeeId, movement.quantity);
    if (movement.fromEmployeeId && movement.fromLocationId)
      change(movement.itemId, movement.fromLocationId, movement.fromEmployeeId, -movement.quantity);
  }
  for (const [key, employees] of holdings) {
    if ([...employees.values()].some((quantity) => quantity < 0))
      throw new Error("توجد عهدة موظف برصيد سالب؛ يلزم مراجعة سجل الحركات قبل نقل المادة");
    result.set(key, [...employees].filter(([, quantity]) => quantity > 0)
      .map(([employeeId, quantity]) => ({ employeeId, quantity })));
  }
  return result;
}
