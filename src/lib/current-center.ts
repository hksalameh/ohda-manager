import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const CENTER_COOKIE_NAME = "ohda_center";

export async function getCurrentCenter() {
  const cookieStore = await cookies();
  const selectedCenterId = cookieStore.get(CENTER_COOKIE_NAME)?.value;

  if (selectedCenterId) {
    const selectedCenter = await prisma.center.findFirst({
      where: { id: selectedCenterId, active: true },
    });

    if (selectedCenter) return selectedCenter;
  }

  const defaultCenterCode = process.env.DEFAULT_CENTER_CODE?.trim();
  if (defaultCenterCode) {
    const defaultCenter = await prisma.center.findFirst({
      where: { code: defaultCenterCode, active: true },
    });

    if (defaultCenter) return defaultCenter;
  }

  return prisma.center.findFirst({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}
