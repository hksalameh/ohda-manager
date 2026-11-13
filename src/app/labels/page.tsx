import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCurrentCenter } from "@/lib/current-center";
import { getCenterInventoryBalances } from "@/lib/inventory-query";
import { itemQrValue, locationQrValue } from "@/lib/qr-codes";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

const MAX_LABELS = 600;

type Label = { key: string; title: string; subtitle: string | null; svg: string };

async function qrSvg(value: string) {
  return QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; locationId?: string; itemId?: string; copies?: string }>;
}) {
  const params = await searchParams;
  const center = await getCurrentCenter();
  if (!center) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4">لا يوجد مركز مفعّل بعد.</p>;

  const type = params.type === "locations" || params.type === "room" || params.type === "items" ? params.type : null;
  const perPiece = params.copies === "qty";

  const locations = await prisma.location.findMany({
    where: { centerId: center.id, active: true },
    orderBy: { name: "asc" },
  });

  const labels: Label[] = [];
  let truncated = false;
  let heading = "";

  if (type === "locations") {
    heading = "ملصقات الغرف والمواقع";
    for (const location of locations) {
      labels.push({ key: location.id, title: location.name, subtitle: location.code, svg: await qrSvg(locationQrValue(location.id)) });
    }
  } else if (type === "items") {
    heading = params.itemId ? "ملصق مادة" : "ملصقات جميع المواد";
    const items = await prisma.item.findMany({
      where: params.itemId ? { id: params.itemId } : { active: true },
      include: { unit: true },
      orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      take: MAX_LABELS,
    });
    for (const item of items) {
      labels.push({ key: item.id, title: item.name, subtitle: item.itemCode, svg: await qrSvg(itemQrValue(item.id)) });
    }
  } else if (type === "room" && params.locationId) {
    const location = locations.find((entry) => entry.id === params.locationId);
    heading = `ملصقات مواد ${location?.name ?? "الغرفة"}`;
    if (location) {
      const balances = await getCenterInventoryBalances(center.id);
      const itemIds = [...balances.itemLocationTotals.entries()]
        .filter(([, perLocation]) => (perLocation.get(location.id) ?? 0) > 0)
        .map(([itemId]) => itemId);
      const items = await prisma.item.findMany({
        where: { id: { in: itemIds } },
        orderBy: [{ itemCode: "asc" }, { name: "asc" }],
      });
      outer: for (const item of items) {
        const svg = await qrSvg(itemQrValue(item.id));
        const copies = perPiece ? balances.itemLocationTotals.get(item.id)?.get(location.id) ?? 1 : 1;
        for (let copy = 1; copy <= copies; copy += 1) {
          if (labels.length >= MAX_LABELS) {
            truncated = true;
            break outer;
          }
          labels.push({ key: `${item.id}-${copy}`, title: item.name, subtitle: [item.itemCode, location.name].filter(Boolean).join(" • "), svg });
        }
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-500">الأدوات / ملصقات QR</p>
        <h2 className="mt-1 text-2xl font-bold text-slate-900">طباعة ملصقات QR</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
          الصق ملصق الغرفة على بابها، وملصق المادة على القطعة نفسها. أثناء الجرد من الهاتف: امسح ملصق الغرفة لفتحها، ثم امسح ملصقات المواد فيُحسب كل مسح قطعة واحدة.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <a href="/labels?type=locations" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center text-sm font-bold text-blue-900 hover:bg-blue-100">ملصقات كل الغرف ({locations.length})</a>
          <a href="/labels?type=items" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm font-bold text-slate-800 hover:bg-slate-100">ملصق واحد لكل مادة</a>
          <form action="/labels" method="get" className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <input type="hidden" name="type" value="room" />
            <select name="locationId" required defaultValue={params.locationId ?? ""} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="" disabled>مواد غرفة معينة…</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs font-bold text-emerald-900">
              <input type="checkbox" name="copies" value="qty" defaultChecked={perPiece} />
              ملصق لكل قطعة حسب الكمية
            </label>
            <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white">عرض الملصقات</button>
          </form>
        </div>
      </section>

      {type ? (
        <section className="space-y-3">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-extrabold text-slate-900">{heading} — {labels.length} ملصق</h3>
            {labels.length ? <PrintButton label="طباعة الملصقات" /> : null}
          </div>
          {truncated ? <p className="no-print rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">تم عرض أول {MAX_LABELS} ملصق فقط.</p> : null}
          {labels.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">لا توجد ملصقات لعرضها.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4">
              {labels.map((label) => (
                <div key={label.key} className="break-inside-avoid rounded-lg border border-slate-300 bg-white p-2 text-center">
                  <div className="mx-auto w-28 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: label.svg }} />
                  <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-900">{label.title}</p>
                  {label.subtitle ? <p className="font-mono text-[10px] text-slate-500">{label.subtitle}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
