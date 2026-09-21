"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateEmployeeProfile(formData: FormData) {
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
    include: { locationAssignments: { where: { isPrimary: true, endsAt: null }, take: 1 } },
  });
  if (!employee) throw new Error("الموظف غير موجود في المركز الحالي");

  if (employeeNo) {
    const duplicate = await prisma.employee.findFirst({ where: { centerId: center.id, employeeNo, id: { not: employeeId } }, select: { id: true } });
    if (duplicate) throw new Error("الرقم الوظيفي مستخدم لموظف آخر");
  }
  if (locationId) {
    const location = await prisma.location.findFirst({ where: { id: locationId, centerId: center.id, active: true }, select: { id: true } });
    if (!location) throw new Error("الغرفة المختارة غير صالحة");
  }
  const currentLocationId = employee.locationAssignments[0]?.locationId ?? null;
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: employeeId }, data: { fullName, employeeNo, jobTitle } });
    if (currentLocationId !== locationId) {
      const now = new Date();
      await tx.employeeLocationAssignment.updateMany({ where: { employeeId, isPrimary: true, endsAt: null }, data: { endsAt: now } });
      if (locationId) await tx.employeeLocationAssignment.create({ data: { employeeId, locationId, startsAt: now, isPrimary: true } });
    }
  });
  revalidatePath("/custody");
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
  revalidatePath("/stocktake");
}
export async function renameLocation(formData: FormData) {
  const locationId = text(formData, "locationId");
  const name = text(formData, "name");
  if (!locationId || !name) throw new Error("اسم الغرفة مطلوب");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const location = await prisma.location.findFirst({
    where: { id: locationId, centerId: center.id, active: true },
    select: { id: true },
  });
  if (!location) throw new Error("الغرفة غير موجودة في المركز الحالي");

  const duplicate = await prisma.location.findFirst({
    where: { centerId: center.id, name, id: { not: locationId } },
    select: { id: true },
  });
  if (duplicate) throw new Error("يوجد موقع آخر بنفس الاسم");

  await prisma.location.update({ where: { id: locationId }, data: { name } });
  revalidatePath("/custody");
  revalidatePath("/locations");
  revalidatePath("/stocktake");
}