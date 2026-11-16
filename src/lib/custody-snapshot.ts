/** Derives existing employee custody, never creates or reallocates physical stock. */
export type CustodyMovementRow = {
  itemId: string;
  quantity: number;
  toEmployeeId: string | null;
  fromEmployeeId: string | null;
  toLocationId: string | null;
  fromLocationId: string | null;
};

export function currentCustodyAtRoom(
  employeeId: string,
  roomId: string,
  movements: CustodyMovementRow[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const movement of movements) {
    if (!Number.isInteger(movement.quantity) || movement.quantity <= 0) {
      throw new Error("حركة عهدة بكمية غير صالحة");
    }
    const incoming = movement.toEmployeeId === employeeId && movement.toLocationId === roomId;
    const outgoing = movement.fromEmployeeId === employeeId && movement.fromLocationId === roomId;
    if (!incoming && !outgoing) continue;
    balances.set(
      movement.itemId,
      (balances.get(movement.itemId) ?? 0) + (incoming ? movement.quantity : 0) - (outgoing ? movement.quantity : 0),
    );
  }
  if ([...balances.values()].some((quantity) => quantity < 0)) {
    throw new Error("توجد حركة إرجاع عهدة أكبر من المسجل؛ يلزم مراجعة سجل الموظف");
  }
  return new Map([...balances].filter(([, quantity]) => quantity > 0));
}
