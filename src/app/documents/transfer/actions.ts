"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function allText(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => typeof value === "string" ? value.trim() : "");
}

export async function createTransferDraft(formData: FormData) {
  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("مركز الرمثا غير موجود");

  const fromLocationId = text(formData, "fromLocationId");
  const toLocationId = text(formData, "toLocationId");
  if (!fromLocationId || !toLocationId) throw new Error("موقع المصدر وموقع الوجهة مطلوبان");
  if (fromLocationId === toLocationId) throw new Error("يجب اختيار موقعين مختلفين للنقل");

  const [fromLocation, toLocation] = await Promise.all([
    prisma.location.findFirst({ where: { id: fromLocationId, centerId: center.id, active: true } }),
    prisma.location.findFirst({ where: { id: toLocationId, centerId: center.id, active: true } }),
  ]);
  if (!fromLocation || !toLocation) throw new Error("أحد المواقع غير صالح");

  const itemIds = allText(formData, "itemId");
  const quantities = allText(formData, "quantity");
  const lineNotes = allText(formData, "lineNotes");
  const rows = itemIds.map((itemId, index) => ({
    itemId,
    quantity: Number(quantities[index] ?? ""),
    notes: lineNotes[index] || null,
  })).filter((row) => row.itemId);

  if (rows.length === 0) throw new Error("يجب إضافة مادة واحدة على الأقل للنقل");
  if (new Set(rows.map((row) => row.itemId)).size !== rows.length) throw new Error("لا تكرر المادة في أكثر من سطر");

  const items = await prisma.item.findMany({
    where: { id: { in: rows.map((row) => row.itemId) }, active: true },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  if (itemMap.size !== rows.length) throw new Error("إحدى المواد غير موجودة أو غير فعالة");

  const balances = await getCenterInventoryBalances(center.id);
  const lines = rows.map((row, index) => {
    const item = itemMap.get(row.itemId)!;
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new Error(`كمية ${item.name} غير صالحة`);
    const available = balances.itemLocationTotals.get(item.id)?.get(fromLocationId) ?? 0;
    if (row.quantity > available) throw new Error(`المتوفر من ${item.name} في ${fromLocation.name} هو ${available} فقط`);
    return {
      lineNo: index + 1,
      itemId: item.id,
      quantity: row.quantity,
      itemCodeSnapshot: item.itemCode,
      itemNameSnapshot: item.name,
      unitNameSnapshot: item.unit?.name ?? null,
      ledgerPageNo: item.legacyLedgerPageNo,
      notes: row.notes,
    };
  });

  const document = await prisma.inventoryDocument.create({
    data: {
      centerId: center.id,
      documentNo: text(formData, "documentNo") || null,
      documentType: "TRANSFER",
      documentDate: new Date(),
      fromLocationId,
      toLocationId,
      statement: text(formData, "statement") || `نقل مواد من ${fromLocation.name} إلى ${toLocation.name}`,
      notes: text(formData, "notes") || null,
      lines: { create: lines },
    },
  });

  revalidatePath("/documents");
  redirect(`/documents/transfer/${document.id}`);
}
