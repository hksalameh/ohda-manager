"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createEmployee(formData: FormData) {
  const fullName = text(formData, "fullName");
  const employeeNo = text(formData, "employeeNo") || null;
  const jobTitle = text(formData, "jobTitle") || null;
  const locationId = text(formData, "locationId") || null;

  if (!fullName) throw new Error("اسم الموظف مطلوب");

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("يجب استيراد بيانات مركز الرمثا أولاً");

  if (employeeNo) {
    const duplicate = await prisma.employee.findFirst({
      where: { centerId: center.id, employeeNo },
      select: { id: true },
    });
    if (duplicate) throw new Error("الرقم الوظيفي مستخدم لموظف آخر");
  }

  if (locationId) {
    const location = await prisma.location.findFirst({
      where: { id: locationId, centerId: center.id, active: true },
      select: { id: true },
    });
    if (!location) throw new Error("الموقع المختار غير صالح");
  }

  await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        centerId: center.id,
        fullName,
        employeeNo,
        jobTitle,
      },
    });

    if (locationId) {
      await tx.employeeLocationAssignment.create({
        data: {
          employeeId: employee.id,
          locationId,
          startsAt: new Date(),
          isPrimary: true,
        },
      });
    }
  });

  revalidatePath("/employees");
  revalidatePath("/");
}

export async function changeEmployeePrimaryLocation(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const locationId = text(formData, "locationId");
  if (!employeeId || !locationId) throw new Error("الموظف والموقع مطلوبان");

  const center = await prisma.center.findUnique({ where: { code: "RAMTHA" } });
  if (!center) throw new Error("مركز الرمثا غير موجود");

  const [employee, location] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId, centerId: center.id, active: true } }),
    prisma.location.findFirst({ where: { id: locationId, centerId: center.id, active: true } }),
  ]);
  if (!employee || !location) throw new Error("الموظف أو الموقع غير صالح");

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.employeeLocationAssignment.updateMany({
      where: { employeeId, isPrimary: true, endsAt: null },
      data: { endsAt: now },
    });
    await tx.employeeLocationAssignment.create({
      data: { employeeId, locationId, startsAt: now, isPrimary: true },
    });
  });

  revalidatePath("/employees");
}

export async function createCustodyDraftFromRoom(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  if (!employeeId) throw new Error("الموظف مطلوب");

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      center: true,
      locationAssignments: {
        where: { isPrimary: true, endsAt: null },
        orderBy: { startsAt: "desc" },
        take: 1,
        include: { location: true },
      },
    },
  });
  if (!employee || !employee.active) throw new Error("الموظف غير موجود أو غير فعال");

  const assignment = employee.locationAssignments[0];
  if (!assignment) throw new Error("يجب ربط الموظف بغرفة/موقع قبل إنشاء سند العهدة");
  const locationId = assignment.locationId;

  const movements = await prisma.inventoryMovement.findMany({
    where: {
      OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
    },
    select: {
      itemId: true,
      quantity: true,
      fromLocationId: true,
      toLocationId: true,
      fromEmployeeId: true,
      toEmployeeId: true,
    },
  });

  const physical = new Map<string, number>();
  const assigned = new Map<string, number>();
  for (const movement of movements) {
    if (movement.toLocationId === locationId) {
      physical.set(movement.itemId, (physical.get(movement.itemId) ?? 0) + movement.quantity);
      if (movement.toEmployeeId) {
        assigned.set(movement.itemId, (assigned.get(movement.itemId) ?? 0) + movement.quantity);
      }
    }
    if (movement.fromLocationId === locationId) {
      physical.set(movement.itemId, (physical.get(movement.itemId) ?? 0) - movement.quantity);
      if (movement.fromEmployeeId) {
        assigned.set(movement.itemId, (assigned.get(movement.itemId) ?? 0) - movement.quantity);
      }
    }
  }

  const available = [...physical.entries()]
    .map(([itemId, quantity]) => ({
      itemId,
      quantity: quantity - (assigned.get(itemId) ?? 0),
    }))
    .filter((entry) => entry.quantity > 0);

  if (available.length === 0) throw new Error("لا توجد مواد غير معهود بها في غرفة الموظف");

  const items = await prisma.item.findMany({
    where: { id: { in: available.map((entry) => entry.itemId) } },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));

  const document = await prisma.inventoryDocument.create({
    data: {
      centerId: employee.centerId,
      documentType: "CUSTODY",
      documentDate: new Date(),
      employeeId: employee.id,
      fromLocationId: locationId,
      toLocationId: locationId,
      statement: `عهدة شخصية من محتويات ${assignment.location.name}`,
      lines: {
        create: available.map((entry, index) => {
          const item = itemMap.get(entry.itemId);
          if (!item) throw new Error("تعذر العثور على إحدى المواد");
          return {
            lineNo: index + 1,
            itemId: item.id,
            quantity: entry.quantity,
            itemCodeSnapshot: item.itemCode,
            itemNameSnapshot: item.name,
            unitNameSnapshot: item.unit?.name ?? null,
            ledgerPageNo: item.legacyLedgerPageNo,
          };
        }),
      },
    },
  });

  redirect(`/documents/${document.id}`);
}
