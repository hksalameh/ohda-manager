"use server";

import {
  CounterpartyType,
  DocumentStatus,
  DocumentType,
  PostingMode,
  SnapshotStatus,
} from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function allText(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => typeof value === "string" ? value.trim() : "");
}

function parseDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!value || Number.isNaN(date.getTime())) throw new Error("تاريخ المستند غير صالح");
  return date;
}

function priceToFils(value: string) {
  if (!value) return null;
  const amount = Number(value.replace(/,/g, "."));
  if (!Number.isFinite(amount) || amount < 0) throw new Error("السعر غير صالح");
  return Math.round(amount * 1000);
}

export async function createHistoricalDocument(formData: FormData) {
  const typeValue = text(formData, "documentType");
  const documentType = typeValue === DocumentType.HISTORICAL_ISSUE
    ? DocumentType.HISTORICAL_ISSUE
    : typeValue === DocumentType.HISTORICAL_RECEIPT
      ? DocumentType.HISTORICAL_RECEIPT
      : null;
  if (!documentType) throw new Error("نوع المستند التاريخي غير صالح");
  const isReceipt = documentType === DocumentType.HISTORICAL_RECEIPT;

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("مركز الرمثا غير موجود");

  const openingSnapshot = await prisma.openingSnapshot.findFirst({
    where: { centerId: center.id, status: SnapshotStatus.POSTED },
    orderBy: { snapshotDate: "desc" },
  });
  if (!openingSnapshot) throw new Error("لا يوجد جرد افتتاحي معتمد");

  const documentDate = parseDate(text(formData, "documentDate"));
  if (documentDate.getTime() > openingSnapshot.snapshotDate.getTime()) {
    throw new Error("المستند التاريخي يجب أن يكون بتاريخ الجرد الافتتاحي أو قبله. المستندات الأحدث تدخل كمستندات فعلية.");
  }

  const itemIds = allText(formData, "itemId");
  const quantities = allText(formData, "quantity");
  const linkedQuantities = allText(formData, "linkedQuantity");
  const prices = allText(formData, "unitPriceJod");
  const notes = allText(formData, "lineNotes");

  const rows = itemIds.map((itemId, index) => ({
    itemId,
    quantity: Number(quantities[index] ?? ""),
    linkedQuantity: Number(linkedQuantities[index] || "0"),
    price: prices[index] ?? "",
    notes: notes[index] || null,
  })).filter((row) => row.itemId);

  if (rows.length === 0) throw new Error("يجب إضافة مادة واحدة على الأقل");
  if (new Set(rows.map((row) => row.itemId)).size !== rows.length) throw new Error("لا تكرر المادة في أكثر من سطر");

  const itemRecords = await prisma.item.findMany({
    where: { id: { in: rows.map((row) => row.itemId) }, active: true },
    include: { unit: true },
  });
  const itemMap = new Map(itemRecords.map((item) => [item.id, item]));
  if (itemMap.size !== rows.length) throw new Error("إحدى المواد غير موجودة أو غير فعالة");

  const openingLines = await prisma.openingSnapshotLine.findMany({
    where: { snapshotId: openingSnapshot.id, itemId: { in: rows.map((row) => row.itemId) } },
    include: { sourceLinks: true },
  });
  const openingMap = new Map(openingLines.map((line) => [line.itemId, line]));

  const prepared = rows.map((row, index) => {
    const item = itemMap.get(row.itemId)!;
    if (!Number.isInteger(row.quantity) || row.quantity <= 0) throw new Error(`كمية ${item.name} غير صالحة`);
    if (!Number.isInteger(row.linkedQuantity) || row.linkedQuantity < 0) throw new Error(`الكمية المرتبطة للمادة ${item.name} غير صالحة`);
    if (!isReceipt && row.linkedQuantity !== 0) throw new Error("الربط برصيد البداية يستخدم مع سندات الإدخال التاريخية فقط");
    if (row.linkedQuantity > row.quantity) throw new Error(`الكمية المرتبطة للمادة ${item.name} أكبر من كمية السند`);

    const openingLine = openingMap.get(row.itemId);
    if (isReceipt && row.linkedQuantity > 0) {
      if (!openingLine) throw new Error(`المادة ${item.name} لا تملك رصيداً افتتاحياً للربط`);
      const alreadyLinked = openingLine.sourceLinks.reduce((sum, link) => sum + link.quantity, 0);
      const remaining = openingLine.physicalQuantity - alreadyLinked;
      if (row.linkedQuantity > remaining) throw new Error(`المتبقي غير الموثق للمادة ${item.name} هو ${remaining} فقط`);
    }

    const unitPriceFils = isReceipt ? priceToFils(row.price) : null;
    return {
      lineNo: index + 1,
      item,
      quantity: row.quantity,
      linkedQuantity: row.linkedQuantity,
      unitPriceFils,
      totalValueFils: unitPriceFils === null ? null : unitPriceFils * row.quantity,
      notes: row.notes,
      openingLineId: openingLine?.id ?? null,
    };
  });

  const partyName = text(formData, "partyName") || null;
  let counterpartyId: string | null = null;
  if (partyName) {
    const partyType = isReceipt ? CounterpartyType.SUPPLIER : CounterpartyType.OTHER;
    const party = await prisma.counterparty.upsert({
      where: { name_type: { name: partyName, type: partyType } },
      update: { active: true },
      create: { name: partyName, type: partyType },
    });
    counterpartyId = party.id;
  }

  const now = new Date();
  const document = await prisma.inventoryDocument.create({
    data: {
      documentNo: text(formData, "documentNo") || null,
      documentType,
      status: DocumentStatus.POSTED,
      postingMode: PostingMode.REFERENCE_ONLY,
      centerId: center.id,
      documentDate,
      counterpartyId,
      statement: text(formData, "statement") || (isReceipt ? "سند إدخال تاريخي من الدفتر" : "سند إخراج تاريخي من الدفتر"),
      notes: text(formData, "notes") || null,
      centerNameSnapshot: center.name,
      counterpartyNameSnapshot: partyName,
      postedAt: now,
      lockedAt: now,
      lines: {
        create: prepared.map((line) => ({
          lineNo: line.lineNo,
          itemId: line.item.id,
          quantity: line.quantity,
          unitPriceFils: line.unitPriceFils,
          totalValueFils: line.totalValueFils,
          ledgerPageNo: line.item.legacyLedgerPageNo,
          itemCodeSnapshot: line.item.itemCode,
          itemNameSnapshot: line.item.name,
          unitNameSnapshot: line.item.unit?.name ?? null,
          notes: line.notes,
          openingSourceLinks: isReceipt && line.linkedQuantity > 0 && line.openingLineId ? {
            create: {
              openingLineId: line.openingLineId,
              quantity: line.linkedQuantity,
              notes: "ربط من سند تاريخي متعدد المواد",
            },
          } : undefined,
        })),
      },
    },
  });

  redirect(`/documents/${document.id}`);
}
