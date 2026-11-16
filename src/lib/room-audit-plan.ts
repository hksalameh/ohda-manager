/** Room reconciliation is a relocation, not a deletion of physical inventory. */
export const UNLOCATED = "UNLOCATED" as const;
export const NEW_STOCK = "NEW_STOCK" as const;

export type AuditKnown = {
  itemId: string;
  systemQuantity: number;
  assignedQuantity: number;
  actualQuantity: number;
  destinationId: string;
  surplusSourceId: string;
};

export type AuditFound = { itemId: string; quantity: number; sourceId: string };

export type AuditMovement = {
  itemId: string;
  quantity: number;
  from: string | null;
  to: string;
  kind: "TRANSFER" | "INCREASE";
};

export function planRoomAudit(
  locationId: string,
  known: AuditKnown[],
  found: AuditFound[],
): AuditMovement[] {
  const result: AuditMovement[] = [];
  const ids = new Set<string>();
  for (const line of known) {
    if (!line.itemId || ids.has(line.itemId)) throw new Error("المادة مكررة في الجرد");
    ids.add(line.itemId);
    if (!Number.isInteger(line.systemQuantity) || line.systemQuantity < 0 ||
        !Number.isInteger(line.actualQuantity) || line.actualQuantity < 0 ||
        !Number.isInteger(line.assignedQuantity) || line.assignedQuantity < 0) {
      throw new Error("الكمية يجب أن تكون عدداً صحيحاً غير سالب");
    }
    // A room audit establishes the physical location. Custody releases for
    // relocated pieces are documented and posted atomically with the transfer.
    const delta = line.actualQuantity - line.systemQuantity;
    if (delta < 0) {
      if (!line.destinationId || line.destinationId === locationId)
        throw new Error("حدد مكان المواد غير الموجودة: غرفة أخرى أو غير محدد الموقع");
      result.push({ itemId: line.itemId, quantity: -delta, from: locationId, to: line.destinationId, kind: "TRANSFER" });
    }
    if (delta > 0) {
      if (!line.surplusSourceId || line.surplusSourceId === locationId)
        throw new Error("حدد مصدر الكمية الزائدة في الغرفة");
      result.push({
        itemId: line.itemId,
        quantity: delta,
        from: line.surplusSourceId === NEW_STOCK ? null : line.surplusSourceId,
        to: locationId,
        kind: line.surplusSourceId === NEW_STOCK ? "INCREASE" : "TRANSFER",
      });
    }
  }
  for (const line of found) {
    if (!line.itemId || ids.has(line.itemId)) throw new Error("لا يمكن تكرار المادة في نفس الجرد");
    ids.add(line.itemId);
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new Error("الكمية المضافة يجب أن تكون أكبر من صفر");
    if (!line.sourceId || line.sourceId === locationId)
      throw new Error("حدد مصدر المادة الجديدة في الغرفة");
    result.push({
      itemId: line.itemId,
      quantity: line.quantity,
      from: line.sourceId === NEW_STOCK ? null : line.sourceId,
      to: locationId,
      kind: line.sourceId === NEW_STOCK ? "INCREASE" : "TRANSFER",
    });
  }
  return result;
}
