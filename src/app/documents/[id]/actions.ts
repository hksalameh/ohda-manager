"use server";

import { DocumentStatus, DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { postInventoryDocument } from "@/lib/inventory-posting";
import { ensureCustodyTemplate } from "@/lib/print-templates";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function saveCustodyDraft(formData: FormData) {
  const documentId = getText(formData, "documentId");
  if (!documentId) throw new Error("رقم المستند مفقود");

  const document = await prisma.inventoryDocument.findUnique({
    where: { id: documentId },
    include: { lines: true },
  });
  if (!document) throw new Error("المستند غير موجود");
  if (document.documentType !== DocumentType.CUSTODY) throw new Error("هذا المستند ليس سند عهدة");
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن تعديل سند تم اعتماده");

  const kept = new Set(
    formData
      .getAll("includedLine")
      .filter((value): value is string => typeof value === "string"),
  );

  if (kept.size === 0) throw new Error("يجب إبقاء مادة واحدة على الأقل في السند");

  await prisma.$transaction(async (tx) => {
    let lineNo = 1;
    for (const line of document.lines.sort((a, b) => a.lineNo - b.lineNo)) {
      if (!kept.has(line.id)) {
        await tx.inventoryDocumentLine.delete({ where: { id: line.id } });
        continue;
      }

      const rawQuantity = getText(formData, `quantity:${line.id}`);
      const quantity = Number(rawQuantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error(`كمية غير صالحة للمادة ${line.itemNameSnapshot}`);
      }
      if (quantity > line.quantity) {
        throw new Error(`لا يمكن زيادة كمية ${line.itemNameSnapshot} فوق الكمية المتاحة عند إنشاء المسودة (${line.quantity})`);
      }

      await tx.inventoryDocumentLine.update({
        where: { id: line.id },
        data: { quantity, lineNo },
      });
      lineNo += 1;
    }
  });

  revalidatePath(`/documents/${documentId}`);
}

export async function postCustodyDocument(formData: FormData) {
  const documentId = getText(formData, "documentId");
  if (!documentId) throw new Error("رقم المستند مفقود");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("المستند غير موجود");
  if (document.documentType !== DocumentType.CUSTODY) throw new Error("هذا المستند ليس سند عهدة");

  if (!document.templateVersionId) {
    const templateVersion = await ensureCustodyTemplate();
    await prisma.inventoryDocument.update({
      where: { id: documentId },
      data: { templateVersionId: templateVersion.id },
    });
  }

  await postInventoryDocument(documentId);
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/employees");
  revalidatePath("/locations");
  revalidatePath("/documents");
  redirect(`/documents/${documentId}`);
}

export async function discardCustodyDraft(formData: FormData) {
  const documentId = getText(formData, "documentId");
  if (!documentId) throw new Error("رقم المستند مفقود");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("المستند غير موجود");
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن حذف سند تم اعتماده");

  await prisma.inventoryDocument.delete({ where: { id: documentId } });
  redirect("/employees");
}

export async function postStockDocument(formData: FormData) {
  const documentId = getText(formData, "documentId");
  if (!documentId) throw new Error("رقم المستند مفقود");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("المستند غير موجود");

  const isPostableStockDocument =
    document.documentType === DocumentType.RECEIPT ||
    document.documentType === DocumentType.ISSUE ||
    document.documentType === DocumentType.TRANSFER ||
    document.documentType === DocumentType.RETURN ||
    document.documentType === DocumentType.ADJUSTMENT;

  if (!isPostableStockDocument) {
    throw new Error("هذا النوع من المستندات لا يعتمد بهذه العملية");
  }

  await postInventoryDocument(documentId);
  revalidatePath(`/documents/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/items");
  revalidatePath("/locations");
  redirect(`/documents/${documentId}`);
}

export async function discardStockDraft(formData: FormData) {
  const documentId = getText(formData, "documentId");
  if (!documentId) throw new Error("رقم المستند مفقود");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document) throw new Error("المستند غير موجود");
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن حذف مستند تم اعتماده");
  if (document.documentType === DocumentType.CUSTODY) throw new Error("استخدم عملية حذف مسودة العهدة");

  await prisma.inventoryDocument.delete({ where: { id: documentId } });
  revalidatePath("/documents");
  redirect("/documents");
}
