"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentCenter } from "@/lib/current-center";
import { ensureCustodyTemplate } from "@/lib/print-templates";
import { createCurrentCustodyDocument } from "@/lib/current-custody-document";

/** Print previously assigned items on the existing official FIN/3/3/4 template. */
export async function printCurrentEmployeeCustody(formData: FormData) {
  const employeeId = formData.get("employeeId");
  const roomId = formData.get("roomId");
  if (typeof employeeId !== "string" || typeof roomId !== "string" ||
      !/^[\w-]+$/.test(employeeId) || !/^[\w-]+$/.test(roomId)) {
    throw new Error("بيانات الموظف أو الغرفة غير صالحة");
  }

  const center = await getCurrentCenter();
  if (!center) throw new Error("لا يوجد مركز مفعّل");
  const template = await ensureCustodyTemplate();
  const document = await createCurrentCustodyDocument({
    centerId: center.id,
    employeeId,
    roomId,
    templateVersionId: template.id,
  });
  revalidatePath(`/locations/${roomId}`);
  revalidatePath("/documents");
  redirect(`/documents/${document.id}/print`);
}
