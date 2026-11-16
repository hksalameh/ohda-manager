"use server";

import { LocationType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseType(formData: FormData) {
  const raw = text(formData, "type");
  return Object.values(LocationType).includes(raw as LocationType)
    ? (raw as LocationType)
    : LocationType.ROOM;
}

async function ensureUnique(centerId: string, name: string, code: string | null, ignoreId?: string) {
  const duplicate = await prisma.location.findFirst({
    where: {
      centerId,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
      OR: [
        { name },
        ...(code ? [{ code }] : []),
      ],
    },
    select: { id: true, name: true, code: true },
  });

  if (duplicate?.name === name) throw new Error("اسم الغرفة مستخدم مسبقًا");
  if (code && duplicate?.code === code) throw new Error("رمز الغرفة مستخدم مسبقًا");
}

export async function createLocation(formData: FormData) {
  const name = text(formData, "name");
  const code = text(formData, "code") || null;
  const type = parseType(formData);
  if (!name) throw new Error("اسم الغرفة أو الموقع مطلوب");
  if (code === "UNLOCATED" || name === "مواد غير محددة الموقع")
    throw new Error("هذا الاسم والرمز محجوزان لنظام متابعة المواد غير محددة الموقع");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  await ensureUnique(center.id, name, code);
  await prisma.location.create({
    data: {
      centerId: center.id,
      name,
      code,
      type,
    },
  });

  revalidatePath("/locations");
  revalidatePath("/employees");
  revalidatePath("/");
}

export async function updateLocation(formData: FormData) {
  const locationId = text(formData, "locationId");
  const name = text(formData, "name");
  const code = text(formData, "code") || null;
  const type = parseType(formData);
  if (!locationId || !name) throw new Error("اسم الغرفة أو الموقع مطلوب");
  if (code === "UNLOCATED" || name === "مواد غير محددة الموقع")
    throw new Error("هذا الاسم والرمز محجوزان لنظام متابعة المواد غير محددة الموقع");

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");

  const location = await prisma.location.findFirst({
    where: { id: locationId, centerId: center.id, active: true },
    select: { id: true, code: true },
  });
  if (!location) throw new Error("الغرفة غير موجودة في المركز الحالي");
  if (location.code === "UNLOCATED") throw new Error("لا يمكن تعديل موقع المتابعة الافتراضي");

  await ensureUnique(center.id, name, code, locationId);
  await prisma.location.update({
    where: { id: locationId },
    data: { name, code, type },
  });

  revalidatePath("/locations");
  revalidatePath("/employees");
  revalidatePath("/custody");
  revalidatePath("/");
}

/** Simple in-room editor: renaming never changes the location ID or stock movements. */
export async function renameLocation(formData: FormData) {
  const id = text(formData, "locationId");
  const name = text(formData, "name");
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error("معرّف الغرفة غير صالح");
  const url = `/locations/${id}`;
  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");
  try {
    if (!name || name.length > 150) throw new Error("اكتب اسمًا صحيحًا للغرفة لا يتجاوز 150 حرفًا");
    if (name === "مواد غير محددة الموقع") throw new Error("هذا اسم محجوز في النظام");
    const current = await prisma.location.findFirst({
      where: { id, centerId: center.id, active: true }, select: { id: true, code: true },
    });
    if (!current || current.code === "UNLOCATED") throw new Error("لا يمكن تغيير اسم هذه الغرفة");
    await ensureUnique(center.id, name, null, id);
    await prisma.location.update({ where: { id }, data: { name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر تعديل اسم الغرفة";
    redirect(`${url}?renameError=${encodeURIComponent(message)}`);
  }
  for (const path of [url, "/locations", "/locations/manage", "/employees", "/custody", "/custody/new", "/documents", "/stocktake"])
    revalidatePath(path);
  redirect(`${url}?renamed=1`);
}
