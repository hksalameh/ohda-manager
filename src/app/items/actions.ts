"use server";

import { CounterpartyType, DocumentStatus, DocumentType, PostingMode } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: string) {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!value || Number.isNaN(parsed.getTime())) throw new Error("التاريخ غير صالح");
  return parsed;
}

function priceToFils(value: string) {
  if (!value) return null;
  const amount = Number(value.replace(/,/g, "."));
  if (!Number.isFinite(amount) || amount < 0) throw new Error("السعر غير صالح");
  return Math.round(amount * 1000);
}

export async function createItem(formData: FormData) {
  const itemCode = text(formData, "itemCode") || null;
  const name = text(formData, "name");
  const unitName = text(formData, "unitName") || "قطعة";
  const legacyLedgerPageNo = text(formData, "legacyLedgerPageNo") || null;
  const notes = text(formData, "notes") || null;
  if (!name) throw new Error("اسم المادة مطلوب");

  if (itemCode) {
    const exists = await prisma.item.findUnique({ where: { itemCode } });
    if (exists) throw new Error("رقم المادة مستخدم مسبقاً");
  }

  const unit = await prisma.unit.upsert({
    where: { name: unitName },
    update: { active: true },
    create: { name: unitName },
  });

  const item = await prisma.item.create({
    data: { itemCode, name, unitId: unit.id, legacyLedgerPageNo, notes },
  });

  revalidatePath("/items");
  redirect(`/items/${item.id}`);
}

export async function updateItem(formData: FormData) {
  const itemId = text(formData, "itemId");
  const itemCode = text(formData, "itemCode") || null;
  const name = text(formData, "name");
  const unitName = text(formData, "unitName") || "قطعة";
  const legacyLedgerPageNo = text(formData, "legacyLedgerPageNo") || null;
  const notes = text(formData, "notes") || null;
  if (!itemId || !name) throw new Error("بيانات المادة ناقصة");

  if (itemCode) {
    const duplicate = await prisma.item.findFirst({ where: { itemCode, NOT: { id: itemId } } });
    if (duplicate) throw new Error("رقم المادة مستخدم لمادة أخرى");
  }

  const unit = await prisma.unit.upsert({
    where: { name: unitName },
    update: { active: true },
    create: { name: unitName },
  });

  await prisma.item.update({
    where: { id: itemId },
    data: { itemCode, name, unitId: unit.id, legacyLedgerPageNo, notes },
  });

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/items");
}

export async function addHistoricalReceiptSource(formData: FormData) {
  const itemId = text(formData, "itemId");
  const documentNo = text(formData, "documentNo") || null;
  const sourceName = text(formData, "sourceName") || null;
  const documentDate = dateValue(text(formData, "documentDate"));
  const originalQuantity = Number(text(formData, "originalQuantity"));
  const linkedQuantity = Number(text(formData, "linkedQuantity"));
  const unitPriceFils = priceToFils(text(formData, "unitPriceJod"));
  const notes = text(formData, "notes") || null;

  if (!itemId) throw new Error("المادة مطلوبة");
  if (!Number.isInteger(originalQuantity) || originalQuantity <= 0) throw new Error("كمية السند الأصلية غير صالحة");
  if (!Number.isInteger(linkedQuantity) || linkedQuantity <= 0) throw new Error("الكمية المرتبطة برصيد البداية غير صالحة");
  if (linkedQuantity > originalQuantity) throw new Error("الكمية المرتبطة لا يمكن أن تزيد عن كمية السند الأصلية");

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("مركز الرمثا غير موجود");

  const openingLine = await prisma.openingSnapshotLine.findFirst({
    where: { itemId, snapshot: { centerId: center.id, status: "POSTED" } },
    orderBy: { snapshot: { snapshotDate: "desc" } },
    include: {
      snapshot: true,
      sourceLinks: true,
      item: { include: { unit: true } },
    },
  });
  if (!openingLine) throw new Error("هذه المادة لا تملك رصيداً افتتاحياً يمكن ربط السند القديم به");
  if (documentDate.getTime() > openingLine.snapshot.snapshotDate.getTime()) {
    throw new Error("السند التاريخي يجب أن يكون بتاريخ الجرد الافتتاحي أو قبله؛ الحركات الأحدث تسجل كسند إدخال فعلي");
  }

  const alreadyLinked = openingLine.sourceLinks.reduce((sum, link) => sum + link.quantity, 0);
  const remaining = openingLine.physicalQuantity - alreadyLinked;
  if (linkedQuantity > remaining) {
    throw new Error(`المتبقي غير الموثق من رصيد البداية هو ${remaining} فقط`);
  }

  let counterpartyId: string | null = null;
  if (sourceName) {
    const counterparty = await prisma.counterparty.upsert({
      where: { name_type: { name: sourceName, type: CounterpartyType.SUPPLIER } },
      update: { active: true },
      create: { name: sourceName, type: CounterpartyType.SUPPLIER },
    });
    counterpartyId = counterparty.id;
  }

  const now = new Date();
  const document = await prisma.inventoryDocument.create({
    data: {
      documentNo,
      documentType: DocumentType.HISTORICAL_RECEIPT,
      status: DocumentStatus.POSTED,
      postingMode: PostingMode.REFERENCE_ONLY,
      centerId: center.id,
      documentDate,
      counterpartyId,
      statement: "سند إدخال تاريخي مضاف من الدفتر اليدوي",
      notes,
      centerNameSnapshot: center.name,
      counterpartyNameSnapshot: sourceName,
      postedAt: now,
      lockedAt: now,
      lines: {
        create: {
          lineNo: 1,
          itemId: openingLine.item.id,
          quantity: originalQuantity,
          unitPriceFils,
          totalValueFils: unitPriceFils === null ? null : unitPriceFils * originalQuantity,
          ledgerPageNo: openingLine.ledgerPageNo ?? openingLine.item.legacyLedgerPageNo,
          itemCodeSnapshot: openingLine.item.itemCode,
          itemNameSnapshot: openingLine.item.name,
          unitNameSnapshot: openingLine.item.unit?.name ?? null,
          openingSourceLinks: {
            create: {
              openingLineId: openingLine.id,
              quantity: linkedQuantity,
              notes: `ربط ${linkedQuantity} من رصيد البداية بالسند التاريخي`,
            },
          },
        },
      },
    },
  });

  revalidatePath(`/items/${itemId}`);
  revalidatePath("/documents");
  redirect(`/items/${itemId}?historical=${document.id}`);
}
