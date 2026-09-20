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
