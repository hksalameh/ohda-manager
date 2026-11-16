import type { AuditMovement } from "./room-audit-plan";

export type AuditCustodySource = {
  itemId: string;
  locationId: string;
  physical: number;
  holders: { employeeId: string; quantity: number }[];
};

export type AuditCustodyReturn = {
  itemId: string;
  locationId: string;
  employeeId: string;
  quantity: number;
};

/**
 * Relocate unassigned stock first. If a physical count proves a relocation
 * of entrusted pieces, create the minimum employee returns needed to release
 * that stock before the transfer. These returns are never posted separately.
 */
export function planAuditCustodyReturns(
  movements: AuditMovement[],
  sources: AuditCustodySource[],
): AuditCustodyReturn[] {
  const outbound = new Map<string, number>();
  for (const movement of movements) {
    if (!movement.from) continue;
    const key = `${movement.itemId}\u0000${movement.from}`;
    outbound.set(key, (outbound.get(key) ?? 0) + movement.quantity);
  }

  const returns: AuditCustodyReturn[] = [];
  const sourceMap = new Map(sources.map((source) => [`${source.itemId}\u0000${source.locationId}`, source]));
  for (const [key, need] of outbound) {
    const source = sourceMap.get(key);
    if (!source) throw new Error("تعذّر تحديد رصيد الموقع المصدر أثناء الجرد");
    const totalCustody = source.holders.reduce((sum, holder) => sum + holder.quantity, 0);
    if (!Number.isInteger(source.physical) || source.physical < 0 ||
        source.holders.some((holder) => !holder.employeeId || !Number.isInteger(holder.quantity) || holder.quantity <= 0) ||
        totalCustody > source.physical) {
      throw new Error("توجد مشكلة في تطابق عهد الموظفين مع رصيد الموقع المصدر؛ يلزم مراجعتها");
    }
    if (source.physical < need) {
      throw new Error(`الكمية المتاحة في الموقع المصدر ${source.physical} فقط، والمطلوب ${need}`);
    }
    let release = Math.max(0, need - (source.physical - totalCustody));
    for (const holder of [...source.holders].sort((a, b) => a.employeeId.localeCompare(b.employeeId))) {
      const quantity = Math.min(release, holder.quantity);
      if (!quantity) continue;
      returns.push({ itemId: source.itemId, locationId: source.locationId, employeeId: holder.employeeId, quantity });
      release -= quantity;
    }
    if (release !== 0) throw new Error("تعذّر تسوية عهدة المادة المتحركة تلقائياً");
  }
  return returns;
}
