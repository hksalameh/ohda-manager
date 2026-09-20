"use server";

import { DocumentStatus, DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { postInventoryDocument } from "@/lib/inventory-posting";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function postReturnDocument(formData: FormData) {
  const documentId = text(formData, "documentId");
  const employeeId = text(formData, "employeeId");
  if (!documentId || !employeeId) throw new Error("بيانات مستند الإرجاع ناقصة");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document || document.documentType !== DocumentType.RETURN || document.employeeId !== employeeId) {
    throw new Error("مستند الإرجاع غير صالح");
  }

  await postInventoryDocument(documentId);
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/items");
  revalidatePath("/locations");
  revalidatePath("/documents");
  redirect(`/employees/${employeeId}/returns/${documentId}`);
}

export async function discardReturnDraft(formData: FormData) {
  const documentId = text(formData, "documentId");
  const employeeId = text(formData, "employeeId");
  if (!documentId || !employeeId) throw new Error("بيانات مستند الإرجاع ناقصة");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document || document.documentType !== DocumentType.RETURN || document.employeeId !== employeeId) {
    throw new Error("مستند الإرجاع غير صالح");
  }
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن حذف مستند إرجاع معتمد");

  await prisma.inventoryDocument.delete({ where: { id: documentId } });
  revalidatePath(`/employees/${employeeId}`);
  redirect(`/employees/${employeeId}`);
}
