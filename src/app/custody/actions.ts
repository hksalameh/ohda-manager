"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function renameEmployee(formData: FormData) {
  const employeeId = text(formData, "employeeId");
  const fullName = text(formData, "fullName");
  if (!employeeId || !fullName) throw new Error("اسم الموظف مطلوب");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, centerId: center.id, active: true },
    select: { id: true },
  });
  if (!employee) throw new Error("الموظف غير موجود في المركز الحالي");

  await prisma.employee.update({ where: { id: employeeId }, data: { fullName } });
  revalidatePath("/custody");
  revalidatePath("/employees");
  revalidatePath(`/employees/${employeeId}`);
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