"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { ensureCustodyTemplate } from "@/lib/print-templates";
import { saveEmployeeRoomsInTransaction, setPrimaryEmployeeRoomInTransaction } from "@/lib/employee-room-assignments";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createEmployee(formData: FormData) {
  const fullName = text(formData, "fullName");
  const employeeNo = text(formData, "employeeNo") || null;
  const jobTitle = text(formData, "jobTitle") || null;
  const locationId = text(formData, "locationId") || null;
  const selectedRooms = formData.getAll("locationIds").filter((entry): entry is string => typeof entry === "string" && !!entry.trim());

  if (!fullName) throw new Error("اسم الموظف مطلوب");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

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

    if (locationId || selectedRooms.length) {
      const rooms = [...new Set([...selectedRooms, ...(locationId ? [locationId] : [])])];
      await saveEmployeeRoomsInTransaction(tx, {
        centerId: center.id, employeeId: employee.id,
        locationIds: rooms, primaryLocationId: locationId || rooms[0],
      });
    }
  });

  revalidatePath("/employees");
  revalidatePath("/");
}

export async function updateEmployee(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const fullName = text(formData, "fullName");
  const employeeNo = text(formData, "employeeNo") || null;
  const jobTitle = text(formData, "jobTitle") || null;
  const locationId = text(formData, "locationId") || null;

  if (!employeeId || !fullName) throw new Error("اسم الموظف مطلوب");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, centerId: center.id, active: true },
    include: {
      locationAssignments: {
        where: { endsAt: null, isPrimary: true },
        orderBy: { startsAt: "desc" },
        take: 1,
      },
    },
  });
  if (!employee) throw new Error("الموظف غير موجود في المركز الحالي");

  if (employeeNo) {
    const duplicate = await prisma.employee.findFirst({
      where: {
        centerId: center.id,
        employeeNo,
        id: { not: employeeId },
      },
      select: { id: true },
    });
    if (duplicate) throw new Error("الرقم الوظيفي مستخدم لموظف آخر");
  }

  if (locationId) {
    const location = await prisma.location.findFirst({
      where: { id: locationId, centerId: center.id, active: true },
      select: { id: true },
    });
    if (!location) throw new Error("الغرفة المختارة غير صالحة");
  }

  const currentAssignment = employee.locationAssignments[0];
  const locationChanged = !!locationId && currentAssignment?.locationId !== locationId;

  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: employeeId },
      data: { fullName, employeeNo, jobTitle },
    });

    if (locationChanged) {
      await setPrimaryEmployeeRoomInTransaction(tx, { centerId: center.id, employeeId, locationId });
    }
  });

  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/locations");
  revalidatePath("/");
}

export async function changeEmployeePrimaryLocation(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const locationId = text(formData, "locationId");
  if (!employeeId || !locationId) throw new Error("الموظف والموقع مطلوبان");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const [employee, location] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId, centerId: center.id, active: true } }),
    prisma.location.findFirst({ where: { id: locationId, centerId: center.id, active: true } }),
  ]);
  if (!employee || !location) throw new Error("الموظف أو الموقع غير صالح");

  await prisma.$transaction(async (tx) => {
    await setPrimaryEmployeeRoomInTransaction(tx, { centerId: center.id, employeeId, locationId });
  });

  revalidatePath("/employees");
  revalidatePath("/locations");
  revalidatePath("/custody");
}

export async function updateEmployeeRooms(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) throw new Error("رقم الموظف غير صالح");
  const url = `/employees/${employeeId}`;
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");
  const ids = formData.getAll("locationIds").filter((id): id is string => typeof id === "string");
  const primaryId = text(formData, "primaryLocationId") || null;
  let count: number;
  try {
    const result = await prisma.$transaction((tx) => saveEmployeeRoomsInTransaction(tx, {
      centerId: center.id, employeeId, locationIds: ids, primaryLocationId: primaryId,
    }));
    count = result.count;
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر حفظ غرف الموظف";
    redirect(`${url}?roomsError=${encodeURIComponent(message)}`);
  }
  revalidatePath("/employees");
  revalidatePath(url);
  revalidatePath("/custody");
  revalidatePath("/custody/new");
  revalidatePath("/locations");
  revalidatePath("/locations/manage");
  redirect(`${url}?roomsSaved=${count}`);
}

export async function createCustodyDraftFromRoom(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const requestedReturnTo = text(formData, "returnTo");
  const returnTo = requestedReturnTo.startsWith("/") ? requestedReturnTo : "/employees";
  const fail = (message: string): never => {
    const query = new URLSearchParams({ error: message });
    redirect(`${returnTo}?${query.toString()}`);
  };

  if (!employeeId) fail("اختر الموظف أولاً");

  const center = await getCurrentCenter();
  if (!center) fail("لا يوجد مركز مفعّل");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, centerId: center!.id },
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
  if (!employee || !employee.active) fail("الموظف غير موجود أو غير فعال في المركز الحالي");

  const assignment = employee!.locationAssignments[0];
  if (!assignment) fail("يجب ربط الموظف بغرفة أو موقع قبل إنشاء سند العهدة");
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

  if (available.length === 0) fail("لا توجد مواد متاحة للتسليم في غرفة الموظف؛ المواد الموجودة إما معهود بها أو رصيدها صفر.");

  const items = await prisma.item.findMany({
    where: { id: { in: available.map((entry) => entry.itemId) } },
    include: { unit: true },
  });
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const templateVersion = await ensureCustodyTemplate();

  const document = await prisma.inventoryDocument.create({
    data: {
      centerId: employee!.centerId,
      documentType: "CUSTODY",
      documentDate: new Date(),
      employeeId: employee!.id,
      fromLocationId: locationId,
      toLocationId: locationId,
      templateVersionId: templateVersion.id,
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
