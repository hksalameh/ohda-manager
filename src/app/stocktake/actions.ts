"use server";

import { redirect } from "next/navigation";

/** Compatibility route for saved legacy links.
 * The older implementation treated missing assets as ADJUST_OUT, reducing
 * total inventory. New audits use room reconciliation and transfer missing
 * pieces to another room or a reserved unlocated location instead. */
export async function createStocktakeAdjustments(data: FormData) {
  const id = data.get("locationId");
  if (typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id)) {
    redirect(`/locations/${id}/audit`);
  }
  redirect("/locations");
}
