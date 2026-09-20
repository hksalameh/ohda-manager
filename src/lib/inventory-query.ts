import { prisma } from "./prisma";

export type CenterInventoryBalances = {
  itemTotals: Map<string, number>;
  locationTotals: Map<string, number>;
  itemLocationTotals: Map<string, Map<string, number>>;
};

export async function getCenterInventoryBalances(centerId: string): Promise<CenterInventoryBalances> {
  const movements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [
        { toLocation: { centerId } },
        { fromLocation: { centerId } },
        { document: { centerId } },
      ],
    },
    select: {
      itemId: true,
      quantity: true,
      fromLocationId: true,
      toLocationId: true,
    },
  });

  const itemTotals = new Map<string, number>();
  const locationTotals = new Map<string, number>();
  const itemLocationTotals = new Map<string, Map<string, number>>();

  function addItemLocation(itemId: string, locationId: string, delta: number) {
    let locationMap = itemLocationTotals.get(itemId);
    if (!locationMap) {
      locationMap = new Map<string, number>();
      itemLocationTotals.set(itemId, locationMap);
    }
    locationMap.set(locationId, (locationMap.get(locationId) ?? 0) + delta);
  }

  for (const movement of movements) {
    let globalDelta = 0;
    if (movement.toLocationId) {
      globalDelta += movement.quantity;
      locationTotals.set(movement.toLocationId, (locationTotals.get(movement.toLocationId) ?? 0) + movement.quantity);
      addItemLocation(movement.itemId, movement.toLocationId, movement.quantity);
    }
    if (movement.fromLocationId) {
      globalDelta -= movement.quantity;
      locationTotals.set(movement.fromLocationId, (locationTotals.get(movement.fromLocationId) ?? 0) - movement.quantity);
      addItemLocation(movement.itemId, movement.fromLocationId, -movement.quantity);
    }
    itemTotals.set(movement.itemId, (itemTotals.get(movement.itemId) ?? 0) + globalDelta);
  }

  return { itemTotals, locationTotals, itemLocationTotals };
}
