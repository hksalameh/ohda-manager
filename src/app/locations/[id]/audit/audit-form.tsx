"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { saveRoomAudit } from "./actions";

type Item = { id: string; code: string | null; name: string; system: number; assigned: number };
type Source = { id: string; name: string; code: string | null };
type SearchItem = { id: string; code: string | null; name: string; total: number; locations: { id: string; quantity: number }[] };
type Extra = { itemId: string; quantity: string; source: string };
type Saved = {
  counts: Record<string, string>;
  destinations: Record<string, string>;
  sources: Record<string, string>;
  extras: Extra[];
};

function SaveButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={!ready || pending} className="w-full rounded-xl bg-teal-700 px-6 py-4 text-base font-extrabold text-white shadow-sm hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto">
    {pending ? "جارٍ تجهيز الحركات للمراجعة..." : "إنهاء الجرد وعرض حركات النقل للمراجعة"}
  </button>;
}

export default function AuditForm({ roomId, roomName, known, allItems, locations, newItemId }: {
  roomId: string;
  roomName: string;
  known: Item[];
  allItems: SearchItem[];
  locations: Source[];
  newItemId: string;
}) {
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [query, setQuery] = useState("");
  const [addQuery, setAddQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [validation, setValidation] = useState("");
  const key = `room-audit:${roomId}`;
  const knownIds = useMemo(() => new Set(known.map((item) => item.id)), [known]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const draft = JSON.parse(stored) as Saved;
        setCounts(draft.counts ?? {});
        setDestinations(draft.destinations ?? {});
        setSources(draft.sources ?? {});
        setExtras(draft.extras ?? []);
      }
    } catch { /* local storage not available */ }
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready || !newItemId || knownIds.has(newItemId)) return;
    const candidate = allItems.find((item) => item.id === newItemId);
    if (!candidate) return;
    setExtras((old) => old.some((item) => item.itemId === newItemId) ? old : [...old, { itemId: newItemId, quantity: "1", source: "NEW_STOCK" }]);
  }, [allItems, knownIds, newItemId, ready]);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(key, JSON.stringify({ counts, destinations, sources, extras } satisfies Saved)); }
    catch { /* user can still submit online */ }
  }, [counts, destinations, sources, extras, key, ready]);

  const completed = known.filter((item) => counts[item.id] !== undefined && counts[item.id] !== "").length;
  const missingRows = known.filter((item) => Number(counts[item.id]) < item.system && counts[item.id] !== undefined && counts[item.id] !== "");
  const changedRows = known.filter((item) => counts[item.id] !== undefined && counts[item.id] !== "" && Number(counts[item.id]) !== item.system);
  const visible = known.filter((item) => `${item.code ?? ""} ${item.name}`.toLocaleLowerCase("ar").includes(query.toLocaleLowerCase("ar")));
  const matches = allItems.filter((item) => !knownIds.has(item.id) && !extras.some((row) => row.itemId === item.id) &&
    `${item.code ?? ""} ${item.name}`.toLocaleLowerCase("ar").includes(addQuery.toLocaleLowerCase("ar"))).slice(0, 12);

  function sourceOptions(itemId: string) {
    return allItems.find((item) => item.id === itemId)?.locations.filter((location) => location.id !== roomId && location.quantity > 0) ?? [];
  }
  function setCount(id: string, n: string) {
    setCounts((old) => ({ ...old, [id]: n }));
    setValidation("");
  }
  function addItem(id: string) {
    setExtras((old) => [...old, { itemId: id, quantity: "1", source: "" }]);
    setAddQuery("");
    setValidation("");
  }
  function submitAudit(e: FormEvent<HTMLFormElement>) {
    const unfinished = known.find((item) => counts[item.id] === "" || counts[item.id] === undefined);
    const wrongDestination = missingRows.find((item) => !destinations[item.id]);
    const missingSource = known.find((item) => Number(counts[item.id]) > item.system && !sources[item.id]);
    const needsExtraSource = extras.find((item) => !item.source || Number(item.quantity) <= 0);
    const invalidCustody = known.find((item) => counts[item.id] !== "" && counts[item.id] !== undefined && Number(counts[item.id]) < item.assigned);
    if (unfinished || wrongDestination || missingSource || needsExtraSource || invalidCustody) {
      e.preventDefault();
      setValidation(
        unfinished ? `لم تُجرَد المادة: ${unfinished.name}. اضغط «مطابق» أو أدخل العدد الموجود.`
        : invalidCustody ? `المادة ${invalidCustody.name} مسجلة بعهدة موظف. عالج العهدة قبل نقلها.`
        : wrongDestination ? `حدد وجهة المادة المفقودة: ${wrongDestination.name}.`
        : missingSource ? `حدد مصدر الكمية الزائدة: ${missingSource.name}.`
        : "اختر مصدر كل مادة أضفتها وتحقق من الكمية.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!window.confirm("سيتم إنشاء مسودات الحركات للمراجعة فقط، ولن تتغير الأرصدة حتى الاعتماد. هل تريد المتابعة؟"))
      e.preventDefault();
  }
  const actionable = known.length === completed;

  return <form action={saveRoomAudit} onSubmit={submitAudit} className="space-y-5">
    <input type="hidden" name="roomId" value={roomId}/>
    <section className="sticky top-0 z-20 rounded-2xl border border-teal-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:top-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-teal-800">جرد {roomName}</p>
          <p className="text-xl font-black text-slate-900">{completed} / {known.length} مادة تم جردها</p>
          <p className="mt-1 text-xs text-slate-500">المفقود {missingRows.length} أنواع • فروقات الكميات {changedRows.length} • المواد الجديدة {extras.length}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setCounts((old) => Object.fromEntries(known.map((item) => [item.id, old[item.id] !== undefined && old[item.id] !== "" ? old[item.id] : String(item.system)])))} className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900">اعتبار غير المفحوص مطابقًا</button>
          <Link href={`/locations/${roomId}`} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">عودة للغرفة</Link>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-600" style={{ width: `${known.length ? completed / known.length * 100 : 100}%` }}/></div>
      {validation ? <p role="alert" className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">{validation}</p> : null}
      <p className="mt-2 text-xs text-slate-500">يُحفظ تقدمك على هذا الجهاز تلقائيًا حتى لا تضيع الأعداد عند الانتقال إلى شاشة إضافة مادة.</p>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">الموجود والمفقود</h2>
          <p className="mt-1 text-xs text-slate-500">لكل مادة: اختر «موجود بالكامل» أو «غير موجود»، أو أدخل العدد الصحيح.</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث في مواد الغرفة..." className="w-full rounded-xl border border-slate-300 px-4 py-3 sm:w-64" />
      </header>
      <div className="divide-y divide-slate-100">
        {known.map((item) => {
          const actualRaw = counts[item.id] ?? "";
          const actual = actualRaw === "" ? null : Number(actualRaw);
          const delta = actual === null ? 0 : actual - item.system;
          return <article key={item.id} className={`space-y-3 p-4 sm:p-5 ${visible.some((entry) => entry.id === item.id) ? "" : "hidden"}`}>
            <input type="hidden" name="knownId" value={item.id}/>
            <input type="hidden" name="knownActual" value={actualRaw}/>
            <input type="hidden" name="knownSystem" value={item.system}/>
            <input type="hidden" name="knownDestination" value={destinations[item.id] ?? ""}/>
            <input type="hidden" name="knownSurplusSource" value={sources[item.id] ?? ""}/>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong className="text-base text-slate-900">{item.name}</strong>
                <p className="mt-1 text-xs text-slate-500">رمز {item.code || "—"} • المسجل {item.system} • بعهدة موظفين {item.assigned}</p>
              </div>
              <span className={`rounded-lg px-3 py-1.5 text-xs font-extrabold ${actual === null ? "bg-slate-100 text-slate-600" : delta === 0 ? "bg-emerald-100 text-emerald-800" : delta < 0 ? "bg-amber-100 text-amber-950" : "bg-blue-100 text-blue-900"}`}>
                {actual === null ? "لم يُفحص" : delta === 0 ? "مطابق" : delta < 0 ? `ناقص ${-delta}` : `زيادة ${delta}`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCount(item.id, String(item.system))} className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800">موجود بالكامل</button>
              <button type="button" onClick={() => setCount(item.id, "0")} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-900">غير موجود</button>
              <label className="mr-auto flex items-center gap-2 text-sm font-bold text-slate-700">الموجود
                <input type="number" min="0" step="1" inputMode="numeric" value={actualRaw} onChange={(e) => setCount(item.id, e.target.value)} placeholder="العدد" className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg font-extrabold"/>
              </label>
            </div>
            {delta < 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-bold text-amber-950">أين تضع {(-delta)} قطعة غير موجودة؟</p>
              <select value={destinations[item.id] ?? ""} onChange={(e) => setDestinations((old) => ({ ...old, [item.id]: e.target.value }))} className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-3 text-sm font-bold" aria-label={`وجهة المادة ${item.name}`}>
                <option value="">اختر مكانها الجديد...</option>
                <option value="UNLOCATED">لم أحدد مكانها بعد — غير محدد الموقع</option>
                {locations.filter((location) => location.id !== roomId && location.code !== "UNLOCATED").map((room) => <option key={room.id} value={room.id}>نقل إلى {room.name}</option>)}
              </select>
              {actual !== null && actual < item.assigned ? <p className="mt-2 text-sm font-bold text-red-700">لا يمكن نقل {item.assigned - actual} قطعة مرتبطة بعهدة موظف. <Link href={`/custody?mode=rooms&locationId=${roomId}`} className="underline">افتح العهدة وسجّل الإرجاع أولاً</Link>.</p> : null}
              <p className="mt-2 text-xs text-amber-900">لن تُحذف القطعة من المخزون. النقل يصبح فعليًا بعد اعتماد المسودة.</p>
            </div>}
            {delta > 0 && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-950">مصدر {delta} قطعة زائدة</p>
              <select value={sources[item.id] ?? ""} onChange={(e) => setSources((old) => ({ ...old, [item.id]: e.target.value }))} className="mt-2 w-full rounded-lg border border-blue-300 bg-white px-3 py-3 text-sm">
                <option value="">اختر من أين جاءت...</option>
                {sourceOptions(item.id).map((s) => <option key={s.id} value={s.id}>من {locations.find((x) => x.id === s.id)?.name ?? "موقع آخر"} — متوفر {s.quantity}</option>)}
              </select>
            </div>}
          </article>;
        })}
        {visible.length === 0 && <p className="p-8 text-center text-sm text-slate-500">لا توجد مواد مطابقة للبحث.</p>}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b p-5">
        <h2 className="text-xl font-extrabold text-slate-900">وجدت مادة إضافية في الغرفة؟</h2>
        <p className="mt-1 text-sm text-slate-600">ابحث في الدليل، أضف العدد واختر مصدرها. أو سجل مادة جديدة إذا لم تكن موجودة أصلًا.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input value={addQuery} onChange={(e) => setAddQuery(e.target.value)} placeholder="اسم المادة أو رقمها..." className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3"/>
          <Link href={`/items/new?stocktakeLocationId=${roomId}`} className="rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white">+ مادة جديدة</Link>
        </div>
        {addQuery.trim() && <div className="mt-3 max-h-64 divide-y overflow-auto rounded-xl border border-slate-200">
          {matches.map((item) => <button key={item.id} type="button" onClick={() => addItem(item.id)} className="flex w-full items-center justify-between px-4 py-3 text-right text-sm hover:bg-teal-50"><span>{item.name}</span><span className="font-bold text-teal-700">إضافة</span></button>)}
          {matches.length === 0 && <p className="p-3 text-sm text-slate-500">غير موجود في الدليل؟ استخدم زر مادة جديدة.</p>}
        </div>}
      </div>
      {extras.length === 0 ? <p className="p-5 text-sm text-slate-500">لا توجد مواد إضافية في هذا الجرد.</p> : <div className="divide-y divide-slate-100">
        {extras.map((extra) => {
          const item = allItems.find((i) => i.id === extra.itemId);
          return <div key={extra.itemId} className="grid gap-3 p-4 sm:grid-cols-[1fr_130px_1fr_auto] sm:items-end">
            <div className="text-sm font-bold text-slate-900">{item?.name || "مادة"}</div>
            <label className="text-xs font-bold text-slate-600">العدد
              <input name="extraQuantity" value={extra.quantity} onChange={(e) => setExtras((old) => old.map((x) => x.itemId === extra.itemId ? { ...x, quantity: e.target.value } : x))} type="number" min={1} step={1} className="mt-1 w-full rounded-lg border px-3 py-2.5 text-center"/>
            </label>
            <label className="text-xs font-bold text-slate-600">مصدر المادة
              <select name="extraSource" required value={extra.source} onChange={(e) => setExtras((old) => old.map((x) => x.itemId === extra.itemId ? { ...x, source: e.target.value } : x))} className="mt-1 w-full rounded-lg border px-3 py-2.5">
                <option value="">اختر المصدر</option>
                {sourceOptions(extra.itemId).map((s) => <option key={s.id} value={s.id}>{locations.find((x) => x.id === s.id)?.name ?? "غرفة أخرى"} ({s.quantity})</option>)}
                {item?.total === 0 && <option value="NEW_STOCK">مادة جديدة لم تسجل سابقًا</option>}
              </select>
            </label>
            <button type="button" onClick={() => setExtras((old) => old.filter((x) => x.itemId !== extra.itemId))} className="rounded-lg border border-red-200 px-3 py-2.5 text-sm font-bold text-red-700">حذف</button>
            <input type="hidden" name="extraId" value={extra.itemId}/>
          </div>;
        })}
      </div>}
    </section>
    <section className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
      <h3 className="text-base font-extrabold text-teal-950">ماذا يحدث عند إنهاء الجرد؟</h3>
      <p className="mt-2 text-sm leading-7 text-teal-950">سيُنشئ البرنامج حركات نقل أو إضافة <strong>كمسودات فقط</strong>. راجعها واعتمدها ليُحدّث الرصيد، ثم ارجع إلى الغرفة واضغط «تسليم عهدة الموظف» لإنشاء السند وطباعته بالقالب المعتمد نفسه. للمشتريات والتبرعات لمادة موجودة استخدم <Link href="/documents/new?type=receipt" className="font-bold underline">سند إدخال</Link>.</p>
      <div className="mt-4"><SaveButton ready={actionable && ready}/></div>
    </section>
  </form>;
}
