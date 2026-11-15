import { redirect } from "next/navigation";

/** The legacy stocktake screen used an adjustment-out for missing assets.
 * Route all new room counts through the safe reconciliation workflow instead.
 * Existing document review URLs remain available for historical references. */
export default async function LegacyStocktakeRedirect({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string }>;
}) {
  const { locationId } = await searchParams;
  if (locationId && /^[a-zA-Z0-9_-]+$/.test(locationId))
    redirect(`/locations/${locationId}/audit`);
  redirect("/locations");
}
