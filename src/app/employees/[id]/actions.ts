"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getEmployeeCustodyBalances } from "@/lib/custody-query";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createReturnDraftForLocation(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const fromLocationId = text(formData, "fromLocationId");
  const toLocationId = text(formData, "toLocationId") || fromLocationId;
  if (!employeeId || !fromLocationId) throw new Error("الموظف وموقع العهدة مطلوبان");

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee || !employee.active) throw new Error("الموظف غير موجود أو غير فعال");

  const [fromLocation, toLocation] = await Promise.all([
    prisma.location.findFirst({ where: { id: fromLocationId, centerId: employee.centerId, active: true } }),
    prisma.location.findFirst({ where: { id: toLocationId, centerId: employee.centerId, active: true } }),
  ]);
  if (!fromLocation || !toLocation) throw new Error("موقع الإرجاع غير صالح");

  const currentBalances = (await getEmployeeCustodyBalances(employeeId))
    .filter((balance) => balance.locationId === fromLocationId);
  const balanceMap = new Map(currentBalances.map((balance) => [balance.itemId, balance.quantity]));

  const selectedItemIds = formData
    .getAll("includedItem")
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (selectedItemIds.length === 0) throw new Error("اختر مادة واحدة على الأقل للإرجاع");

  const uniqueItemIds = [...new Set(selectedItemIds)];
  const items = await prisma.item.findMany({
    where: { id: { in: uniqueItemIds } },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const lines = uniqueItemIds.map((itemId, index) => {
    const item = itemMap.get(itemId);
    if (!item) throw new Error("تعذر العثور على إحدى المواد");
    const available = balanceMap.get(itemId) ?? 0;
    const quantity = Number(text(formData, `quantity:${itemId}`));
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`كمية الإرجاع غير صالحة للمادة ${item.name}`);
    if (quantity > available) throw new Error(`عهدة ${item.name} الحالية هي ${available} فقط`);
    return {
      lineNo: index + 1,
      itemId: item.id,
      quantity,
      itemCodeSnapshot: item.itemCode,
      itemNameSnapshot: item.name,
      unitNameSnapshot: item.unit?.name ?? null,
      ledgerPageNo: item.legacyLedgerPageNo,
    };
  });

  const document = await prisma.inventoryDocument.create({
    data: {
      centerId: employee.centerId,
      documentType: "RETURN",
      documentDate: new Date(),
      employeeId,
      fromLocationId,
      toLocationId,
      statement: fromLocationId === toLocationId
        ? `فك عهدة وإبقاء المواد في ${fromLocation.name}`
        : `إرجاع عهدة من ${fromLocation.name} إلى ${toLocation.name}`,
      lines: { create: lines },
    },
  });

  revalidatePath(`/employees/${employeeId}`);
  redirect(`/documents/${document.id}`);
}
