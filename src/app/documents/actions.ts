"use server";

import { CounterpartyType, DocumentType } from "@prisma/client";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function allText(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => (typeof value === "string" ? value.trim() : ""));
}

function parseDate(value: string, fieldName: string) {
  if (!value) throw new Error(`${fieldName} مطلوب`);
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${fieldName} غير صالح`);
  return parsed;
}

function optionalDate(value: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error("أحد التواريخ غير صالح");
  return parsed;
}

function priceToFils(value: string) {
  if (!value) return null;
  const normalized = value.replace(/,/g, ".");
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`سعر غير صالح: ${value}`);
  return Math.round(amount * 1000);
}

export async function createStockDocument(formData: FormData) {
  const typeValue = text(formData, "documentType");
  const documentType = typeValue === DocumentType.ISSUE ? DocumentType.ISSUE : typeValue === DocumentType.RECEIPT ? DocumentType.RECEIPT : null;
  if (!documentType) throw new Error("نوع المستند غير صالح");

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("يجب استيراد بيانات مركز الرمثا أولاً");

  const documentNo = text(formData, "documentNo") || null;
  const documentDate = parseDate(text(formData, "documentDate"), "تاريخ المستند");
  const locationId = text(formData, "locationId");
  if (!locationId) throw new Error("الموقع مطلوب");

  const location = await prisma.location.findFirst({
    where: { id: locationId, centerId: center.id, active: true },
  });
  if (!location) throw new Error("الموقع المختار غير صالح");

  const itemIds = allText(formData, "itemId");
  const quantities = allText(formData, "quantity");
  const unitPrices = allText(formData, "unitPriceJod");
  const lineNotes = allText(formData, "lineNotes");

  const lineInputs = itemIds.map((itemId, index) => ({
    itemId,
    quantityText: quantities[index] ?? "",
    priceText: unitPrices[index] ?? "",
    notes: lineNotes[index] || null,
  })).filter((line) => line.itemId);

  if (lineInputs.length === 0) throw new Error("يجب إضافة مادة واحدة على الأقل");

  const uniqueIds = [...new Set(lineInputs.map((line) => line.itemId))];
  if (uniqueIds.length !== lineInputs.length) throw new Error("لا يمكن تكرار نفس المادة في المستند؛ عدّل الكمية في سطر واحد");

  const items = await prisma.item.findMany({
    where: { id: { in: uniqueIds }, active: true },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  if (itemMap.size !== uniqueIds.length) throw new Error("توجد مادة غير صالحة أو غير فعالة ضمن المستند");

  const preparedLines = lineInputs.map((line, index) => {
    const item = itemMap.get(line.itemId);
    if (!item) throw new Error("تعذر العثور على إحدى المواد");
    const quantity = Number(line.quantityText);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`كمية غير صالحة للمادة ${item.name}`);
    const unitPriceFils = documentType === DocumentType.RECEIPT ? priceToFils(line.priceText) : null;
    return {
      lineNo: index + 1,
      itemId: item.id,
      quantity,
      unitPriceFils,
      totalValueFils: unitPriceFils === null ? null : unitPriceFils * quantity,
      ledgerPageNo: item.legacyLedgerPageNo,
      itemCodeSnapshot: item.itemCode,
      itemNameSnapshot: item.name,
      unitNameSnapshot: item.unit?.name ?? null,
      notes: line.notes,
    };
  });

  const partyName = text(formData, documentType === DocumentType.RECEIPT ? "supplierName" : "recipientName");
  let counterpartyId: string | null = null;
  if (partyName) {
    const partyType = documentType === DocumentType.RECEIPT ? CounterpartyType.SUPPLIER : CounterpartyType.OTHER;
    const party = await prisma.counterparty.upsert({
      where: { name_type: { name: partyName, type: partyType } },
      update: { active: true },
      create: { name: partyName, type: partyType },
    });
    counterpartyId = party.id;
  }

  const statement = text(formData, "statement") || null;
  const notes = text(formData, "notes") || null;

  const document = await prisma.inventoryDocument.create({
    data: {
      centerId: center.id,
      documentNo,
      documentType,
      documentDate,
      fromLocationId: documentType === DocumentType.ISSUE ? location.id : null,
      toLocationId: documentType === DocumentType.RECEIPT ? location.id : null,
      counterpartyId,
      statement,
      notes,
      lines: { create: preparedLines },
      receiptDetail: documentType === DocumentType.RECEIPT ? {
        create: {
          invoiceNo: text(formData, "invoiceNo") || null,
          invoiceDate: optionalDate(text(formData, "invoiceDate")),
          receivingCommitteeDate: optionalDate(text(formData, "receivingCommitteeDate")),
          reportReference: text(formData, "reportReference") || null,
          purchaseOrderNo: text(formData, "purchaseOrderNo") || null,
        },
      } : undefined,
    },
  });

  redirect(`/documents/${document.id}`);
}
