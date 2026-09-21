import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { CENTER_COOKIE_NAME, getCurrentCenter } from "@/lib/current-center";

async function selectCenter(formData: FormData) {
  "use server";

  const centerId = String(formData.get("centerId") ?? "").trim();
  if (!centerId) return;

  const center = await prisma.center.findFirst({
    where: { id: centerId, active: true },
    select: { id: true },
  });

  if (!center) return;

  const cookieStore = await cookies();
  cookieStore.set(CENTER_COOKIE_NAME, center.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  revalidatePath("/", "layout");
}

export default async function CenterSwitcher() {
  const [centers, currentCenter] = await Promise.all([
    prisma.center.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    getCurrentCenter(),
  ]);

  if (centers.length === 0) {
    return <p className="text-sm text-slate-500">لا يوجد مركز مفعّل</p>;
  }

  if (centers.length === 1) {
    return <p className="text-sm text-slate-500">{centers[0].name}</p>;
  }

  return (
    <form action={selectCenter} className="flex items-center gap-2">
      <label htmlFor="centerId" className="text-sm font-medium text-slate-600">
        المركز
      </label>
      <select
        id="centerId"
        name="centerId"
        defaultValue={currentCenter?.id ?? centers[0].id}
        className="max-w-52 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
      >
        {centers.map((center) => (
          <option key={center.id} value={center.id}>
            {center.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        اختيار
      </button>
    </form>
  );
}
