"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { getAssignedCustodyTotalsAtLocation } from "@/lib/custody-query";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function allText(formData: FormData, key: string) {
  return formData.getAll(key).map((value) => typeof value === "string" ? value.trim() : "");
}

function safeDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date();
  return new Date(`${value}T00:00:00.000Z`);
}

function defaultReference(date: Date) {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sec = String(now.getSeconds()).padStart(2, "0");
  return `JRD-${yyyy}${mm}${dd}-${hh}${min}${sec}`;
}

export async function createStocktakeAdjustments(formData: FormData) {
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const locationId = text(formData, "locationId");
  if (!locationId) throw new Error("الموقع مطلوب");

  const location = await prisma.location.findFirst({
    where: { id: locationId, centerId: center.id, active: true },
  });
  if (!location) throw new Error("الموقع المحدد غير صالح للمركز الحالي");

  const itemIds = allText(formData, "itemId");
  const actualValues = allText(formData, "actualQuantity");
  const rows = itemIds
    .map((itemId, index) => ({ itemId, actualRaw: actualValues[index] ?? "" }))
    .filter((row) => row.itemId && row.actualRaw !== "");

  if (rows.length === 0) throw new Error("أدخل الكمية الفعلية لمادة واحدة على الأقل");
  if (new Set(rows.map((row) => row.itemId)).size !== rows.length) {
    throw new Error("لا يمكن تكرار المادة أكثر من مرة في نفس الجرد");
  }

  const items = await prisma.item.findMany({
    where: { id: { in: rows.map((row) => row.itemId) }, active: true },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  if (itemMap.size !== rows.length) throw new Error("إحدى المواد غير موجودة أو غير فعالة");

  const [balances, assignedTotals] = await Promise.all([
    getCenterInventoryBalances(center.id),
    getAssignedCustodyTotalsAtLocation(locationId),
  ]);

  const countedRows: Array<{ itemId: string; actualQuantity: number; systemQuantity: number; assignedQuantity: number }> = [];
  const increases: Array<{ itemId: string; quantity: number; systemQuantity: number; actualQuantity: number }> = [];
  const decreases: Array<{ itemId: string; quantity: number; systemQuantity: number; actualQuantity: number }> = [];

  for (const row of rows) {
    const item = itemMap.get(row.itemId)!;
    const actualQuantity = Number(row.actualRaw);
    if (!Number.isInteger(actualQuantity) || actualQuantity < 0) {
      throw new Error(`الكمية الفعلية للمادة ${item.name} يجب أن تكون عدداً صحيحاً يساوي صفراً أو أكثر`);
    }

    const systemQuantity = balances.itemLocationTotals.get(row.itemId)?.get(locationId) ?? 0;
    const assignedQuantity = assignedTotals.get(row.itemId) ?? 0;
    if (actualQuantity < assignedQuantity) {
      throw new Error(
        `لا يمكن تخفيض ${item.name} إلى ${actualQuantity} لأن المسجل في عهد الموظفين داخل ${location.name} هو ${assignedQuantity}. يجب معالجة العهدة أولاً.`,
      );
    }

    countedRows.push({ itemId: row.itemId, actualQuantity, systemQuantity, assignedQuantity });
    const difference = actualQuantity - systemQuantity;
    if (difference > 0) increases.push({ itemId: row.itemId, quantity: difference, systemQuantity, actualQuantity });
    if (difference < 0) decreases.push({ itemId: row.itemId, quantity: Math.abs(difference), systemQuantity, actualQuantity });
  }

  const countDate = safeDate(text(formData, "countDate"));
  const reference = text(formData, "referenceNo") || defaultReference(countDate);
  const notes = text(formData, "notes") || null;
  const selectedEmployeeId = text(formData, "responsibleEmployeeId") || null;
  const responsibleName = text(formData, "responsibleName") || null;
  const wantsCustody = Boolean(selectedEmployeeId || responsibleName);

  const result = await prisma.$transaction(async (tx) => {
    const adjustmentIds: string[] = [];

    if (increases.length > 0) {
      const document = await tx.inventoryDocument.create({
        data: {
          centerId: center.id,
          documentNo: `${reference}-PLUS`,
          documentType: "ADJUSTMENT",
          documentDate: countDate,
          toLocationId: locationId,
          statement: `تسوية جرد فعلي - زيادة - ${location.name}`,
          notes: notes ? `مرجع الجرد: ${reference}\n${notes}` : `مرجع الجرد: ${reference}`,
          lines: {
            create: increases.map((entry, index) => {
              const item = itemMap.get(entry.itemId)!;
              return {
                lineNo: index + 1,
                itemId: item.id,
                quantity: entry.quantity,
                itemCodeSnapshot: item.itemCode,
                itemNameSnapshot: item.name,
                unitNameSnapshot: item.unit?.name ?? null,
                ledgerPageNo: item.legacyLedgerPageNo,
                notes: `[STOCKTAKE system=${entry.systemQuantity} actual=${entry.actualQuantity}]`,
              };
            }),
          },
        },
      });
      adjustmentIds.push(document.id);
    }

    if (decreases.length > 0) {
      const document = await tx.inventoryDocument.create({
        data: {
          centerId: center.id,
          documentNo: `${reference}-MINUS`,
          documentType: "ADJUSTMENT",
          documentDate: countDate,
          fromLocationId: locationId,
          statement: `تسوية جرد فعلي - نقص - ${location.name}`,
          notes: notes ? `مرجع الجرد: ${reference}\n${notes}` : `مرجع الجرد: ${reference}`,
          lines: {
            create: decreases.map((entry, index) => {
              const item = itemMap.get(entry.itemId)!;
              return {
                lineNo: index + 1,
                itemId: item.id,
                quantity: entry.quantity,
                itemCodeSnapshot: item.itemCode,
                itemNameSnapshot: item.name,
                unitNameSnapshot: item.unit?.name ?? null,
                ledgerPageNo: item.legacyLedgerPageNo,
                notes: `[STOCKTAKE system=${entry.systemQuantity} actual=${entry.actualQuantity}]`,
              };
            }),
          },
        },
      });
      adjustmentIds.push(document.id);
    }

    let custodyId: string | null = null;

    if (wantsCustody) {
      let employee = selectedEmployeeId
        ? await tx.employee.findFirst({ where: { id: selectedEmployeeId, centerId: center.id, active: true } })
        : null;

      if (selectedEmployeeId && !employee) {
        throw new Error("الموظف المختار غير صالح للمركز الحالي");
      }

      if (!employee && responsibleName) {
        employee = await tx.employee.findFirst({
          where: { centerId: center.id, fullName: responsibleName, active: true },
        });

        if (!employee) {
          employee = await tx.employee.create({
            data: {
              centerId: center.id,
              fullName: responsibleName,
              notes: `أضيف أثناء جرد ${location.name} - مرجع ${reference}`,
            },
          });
          await tx.employeeLocationAssignment.create({
            data: {
              employeeId: employee.id,
              locationId,
              startsAt: countDate,
              isPrimary: true,
              notes: "تم الربط أثناء جرد الغرفة",
            },
          });
        } else {
          const currentAssignment = await tx.employeeLocationAssignment.findFirst({
            where: { employeeId: employee.id, isPrimary: true, endsAt: null },
          });
          if (!currentAssignment) {
            await tx.employeeLocationAssignment.create({
              data: {
                employeeId: employee.id,
                locationId,
                startsAt: countDate,
                isPrimary: true,
                notes: "تم الربط أثناء جرد الغرفة",
              },
            });
          }
        }
      }

      if (!employee) throw new Error("حدد موظفاً أو اكتب اسم مستلم العهدة");

      const custodyLines = countedRows
        .map((entry) => ({
          ...entry,
          quantity: Math.max(0, entry.actualQuantity - entry.assignedQuantity),
        }))
        .filter((entry) => entry.quantity > 0);

      if (custodyLines.length > 0) {
        const custody = await tx.inventoryDocument.create({
          data: {
            centerId: center.id,
            documentType: "CUSTODY",
            documentDate: countDate,
            employeeId: employee.id,
            fromLocationId: locationId,
            toLocationId: locationId,
            statement: `عهدة ${employee.fullName} من جرد ${location.name}`,
            notes: notes ? `أنشئت من جرد ${reference}\n${notes}` : `أنشئت من جرد ${reference}`,
            lines: {
              create: custodyLines.map((entry, index) => {
                const item = itemMap.get(entry.itemId)!;
                return {
                  lineNo: index + 1,
                  itemId: item.id,
                  quantity: entry.quantity,
                  itemCodeSnapshot: item.itemCode,
                  itemNameSnapshot: item.name,
                  unitNameSnapshot: item.unit?.name ?? null,
                  ledgerPageNo: item.legacyLedgerPageNo,
                  notes: "من نتيجة جرد الغرفة",
                };
              }),
            },
          },
        });
        custodyId = custody.id;
      }
    }

    return { adjustmentIds, custodyId };
  });

  revalidatePath("/documents");
  revalidatePath("/stocktake");
  revalidatePath("/employees");

  if (result.adjustmentIds.length === 0 && !result.custodyId) {
    redirect(`/stocktake?locationId=${encodeURIComponent(locationId)}&matched=1`);
  }

  const query = new URLSearchParams();
  if (result.adjustmentIds.length) query.set("ids", result.adjustmentIds.join(","));
  if (result.custodyId) query.set("custodyId", result.custodyId);
  if (result.adjustmentIds.length === 0) query.set("matched", "1");
  redirect(`/stocktake/review?${query.toString()}`);
}
