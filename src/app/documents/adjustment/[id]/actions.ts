"use server";

import { DocumentStatus, DocumentType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getAssignedCustodyTotalsAtLocation } from "@/lib/custody-query";
import { postInventoryDocument } from "@/lib/inventory-posting";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseStocktakeNote(note: string | null) {
  if (!note) return null;
  const match = note.match(/\[STOCKTAKE system=(\d+) actual=(\d+)\]/);
  if (!match) return null;
  return { systemQuantity: Number(match[1]), actualQuantity: Number(match[2]) };
}

export async function postAdjustmentDocument(formData: FormData) {
  const documentId = text(formData, "documentId");
  if (!documentId) throw new Error("رقم مستند التسوية مفقود");

  const document = await prisma.inventoryDocument.findUnique({
    where: { id: documentId },
    include: { lines: true },
  });
  if (!document || document.documentType !== DocumentType.ADJUSTMENT) throw new Error("مستند التسوية غير صالح");
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن اعتماد مستند ليس في حالة مسودة");

  const locationId = document.toLocationId ?? document.fromLocationId;
  if (!locationId) throw new Error("موقع التسوية غير محدد");

  const [balances, assignedTotals] = await Promise.all([
    getCenterInventoryBalances(document.centerId),
    getAssignedCustodyTotalsAtLocation(locationId),
  ]);

  for (const line of document.lines) {
    const stocktake = parseStocktakeNote(line.notes);
    if (!stocktake) continue;

    const currentQuantity = balances.itemLocationTotals.get(line.itemId)?.get(locationId) ?? 0;
    if (currentQuantity !== stocktake.systemQuantity) {
      throw new Error(
        `تغير رصيد ${line.itemNameSnapshot} منذ إنشاء الجرد: كان ${stocktake.systemQuantity} وأصبح ${currentQuantity}. احذف مسودة التسوية وأعد الجرد حتى لا يتم تطبيق فرق قديم.`,
      );
    }

    if (document.fromLocationId && !document.toLocationId) {
      const assignedQuantity = assignedTotals.get(line.itemId) ?? 0;
      if (stocktake.actualQuantity < assignedQuantity) {
        throw new Error(
          `لا يمكن تخفيض ${line.itemNameSnapshot} إلى ${stocktake.actualQuantity} لأن عهد الموظفين الحالية في الموقع أصبحت ${assignedQuantity}. عالج العهدة أولاً ثم أعد الجرد.`,
        );
      }
    }
  }

  await postInventoryDocument(documentId);
  revalidatePath(`/documents/adjustment/${documentId}`);
  revalidatePath("/documents");
  revalidatePath("/items");
  revalidatePath("/locations");
  revalidatePath("/stocktake");
  redirect(`/documents/adjustment/${documentId}`);
}

export async function discardAdjustmentDraft(formData: FormData) {
  const documentId = text(formData, "documentId");
  if (!documentId) throw new Error("رقم مستند التسوية مفقود");

  const document = await prisma.inventoryDocument.findUnique({ where: { id: documentId } });
  if (!document || document.documentType !== DocumentType.ADJUSTMENT) throw new Error("مستند التسوية غير صالح");
  if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن حذف تسوية تم اعتمادها");

  await prisma.inventoryDocument.delete({ where: { id: documentId } });
  revalidatePath("/documents");
  revalidatePath("/stocktake");
  redirect("/documents");
}
