// صيغة محتوى رموز QR الخاصة بالنظام.
// OHDA:I:<itemId>     ملصق مادة
// OHDA:L:<locationId> ملصق غرفة / موقع
// أي نص آخر يُعامل كرقم مادة (itemCode) حتى تعمل الباركودات القديمة إن وجدت.

export type ParsedQr =
  | { kind: "item"; id: string }
  | { kind: "location"; id: string }
  | { kind: "text"; value: string };

export function itemQrValue(itemId: string) {
  return `OHDA:I:${itemId}`;
}

export function locationQrValue(locationId: string) {
  return `OHDA:L:${locationId}`;
}

export function parseQr(raw: string): ParsedQr {
  const value = raw.trim();
  const match = /^OHDA:([IL]):(.+)$/i.exec(value);
  if (match) {
    return match[1].toUpperCase() === "I" ? { kind: "item", id: match[2] } : { kind: "location", id: match[2] };
  }
  return { kind: "text", value };
}
