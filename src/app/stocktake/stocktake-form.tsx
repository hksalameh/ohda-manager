"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { deleteOfflineDraft, loadOfflineDraft, saveOfflineDraft } from "@/lib/offline-drafts";
import { QrScanner } from "@/components/qr-scanner";
import { parseQr } from "@/lib/qr-codes";
import { createStocktakeAdjustments } from "./actions";

type ItemOption = {
  id: string;
  itemCode: string | null;
  name: string;
  unitName: string | null;
  systemQuantity: number;
  assignedQuantity: number;
};

type EmployeeOption = {
  id: string;
  fullName: string;
  employeeNo: string | null;
  locationName: string | null;
};

type ExtraLine = {
  key: number;
  itemId: string;
  actualQuantity: string;
};

type StocktakeOfflineDraft = {
  counts: Record<string, string>;
  extras: ExtraLine[];
  responsibleEmployeeId: string;
  responsibleName: string;
  countDate: string;
  referenceNo: string;
  notes: string;
};

function matches(item: { itemCode: string | null; name: string }, query: string) {
  const normalized = query.trim().toLocaleLowerCase("ar");
  if (!normalized) return true;
  return `${item.itemCode ?? ""} ${item.name}`.toLocaleLowerCase("ar").includes(normalized);
}

export function StocktakeForm({
  locationId,
  locationName,
  expectedItems,
  allItems,
  employees,
  today,
  discardSavedDraft = false,
  createdItemId = "",
}: {
  locationId: string;
  locationName: string;
  expectedItems: ItemOption[];
  allItems: Omit<ItemOption, "systemQuantity" | "assignedQuantity">[];
  employees: EmployeeOption[];
  today: string;
  discardSavedDraft?: boolean;
  createdItemId?: string;
}) {
  const draftKey = `stocktake:${locationId}`;
  const createdItemHandled = useRef(false);
  const [query, setQuery] = useState("");
  const [extraSearch, setExtraSearch] = useState("");
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [nextKey, setNextKey] = useState(2);
  const [extras, setExtras] = useState<ExtraLine[]>([]);
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState("");
  const [responsibleName, setResponsibleName] = useState("");
  const [countDate, setCountDate] = useState(today);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [online, setOnline] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [offlineMessage, setOfflineMessage] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const expectedIds = useMemo(() => new Set(expectedItems.map((item) => item.id)), [expectedItems]);
  const selectedExtraIds = useMemo(() => new Set(extras.map((line) => line.itemId).filter(Boolean)), [extras]);
  const visibleExpected = useMemo(() => expectedItems.filter((item) => matches(item, query)), [expectedItems, query]);
  const extraCandidates = useMemo(
    () => allItems
      .filter((item) => !expectedIds.has(item.id))
      .filter((item) => matches(item, extraSearch)),
    [allItems, expectedIds, extraSearch],
  );
  const allSearchResults = useMemo(
    () => extraSearch.trim() ? allItems.filter((item) => matches(item, extraSearch)).slice(0, 20) : [],
    [allItems, extraSearch],
  );

  useEffect(() => {
    setOnline(navigator.onLine);
    const handleOnline = () => {
      setOnline(true);
      setOfflineMessage("عاد الاتصال. يمكنك الآن إرسال الجرد المحفوظ إلى النظام.");
    };
    const handleOffline = () => {
      setOnline(false);
      setOfflineMessage("انقطع الاتصال. سيستمر حفظ ما تدخله على هذا الجهاز.");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (discardSavedDraft) {
      deleteOfflineDraft(draftKey)
        .catch(() => undefined)
        .finally(() => {
          if (active) setDraftReady(true);
        });
      return () => {
        active = false;
      };
    }
    loadOfflineDraft<StocktakeOfflineDraft>(draftKey)
      .then((record) => {
        if (!active || !record) return;
        const draft = record.value;
        setCounts(draft.counts ?? {});
        setExtras(draft.extras ?? []);
        setResponsibleEmployeeId(draft.responsibleEmployeeId ?? "");
        setResponsibleName(draft.responsibleName ?? "");
        setCountDate(draft.countDate || today);
        setReferenceNo(draft.referenceNo ?? "");
        setNotes(draft.notes ?? "");
        const maxKey = Math.max(1, ...(draft.extras ?? []).map((line) => line.key));
        setNextKey(maxKey + 1);
        setDraftRestored(true);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [discardSavedDraft, draftKey, today]);

  useEffect(() => {
    // حفظ تلقائي دائم: لو أُغلقت الصفحة أو انطفأت شاشة الهاتف لا يضيع الجرد.
    if (!draftReady) return;
    const draft: StocktakeOfflineDraft = {
      counts,
      extras,
      responsibleEmployeeId,
      responsibleName,
      countDate,
      referenceNo,
      notes,
    };
    const timer = window.setTimeout(() => {
      saveOfflineDraft(draftKey, draft).catch(() => undefined);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [counts, countDate, draftKey, draftReady, extras, notes, referenceNo, responsibleEmployeeId, responsibleName]);

  useEffect(() => {
    if (!draftReady || !createdItemId || createdItemHandled.current) return;
    createdItemHandled.current = true;
    const item = allItems.find((entry) => entry.id === createdItemId);
    if (!item || expectedIds.has(item.id)) return;
    setExtras((current) => {
      if (current.some((line) => line.itemId === item.id)) return current;
      const key = Math.max(1, ...current.map((line) => line.key)) + 1;
      return [...current, { key, itemId: item.id, actualQuantity: "1" }];
    });
    setNextKey((value) => value + 1);
    setExtraSearch(item.name);
  }, [allItems, createdItemId, draftReady, expectedIds]);

  async function discardDraft() {
    if (!window.confirm("سيتم مسح كل ما أدخلته في هذا الجرد. هل أنت متأكد؟")) return;
    setCounts({});
    setExtras([]);
    setResponsibleEmployeeId("");
    setResponsibleName("");
    setCountDate(today);
    setReferenceNo("");
    setNotes("");
    setDraftRestored(false);
    setOfflineMessage(null);
    setScanFeedback(null);
    await deleteOfflineDraft(draftKey).catch(() => undefined);
  }

  function handleScan(raw: string) {
    const parsed = parseQr(raw);
    if (parsed.kind === "location") {
      setScanFeedback(
        parsed.id === locationId
          ? { tone: "ok", text: `أنت داخل ${locationName}. امسح الآن ملصقات المواد.` }
          : { tone: "error", text: "هذا ملصق غرفة أخرى. أنهِ جرد هذه الغرفة أو افتح الغرفة الأخرى من أعلى الصفحة." },
      );
      return;
    }

    const item =
      parsed.kind === "item"
        ? allItems.find((entry) => entry.id === parsed.id)
        : allItems.find((entry) => entry.itemCode && entry.itemCode.toLowerCase() === parsed.value.toLowerCase());

    if (!item) {
      setScanFeedback({ tone: "error", text: "الرمز لا يطابق أي مادة مسجلة في النظام." });
      return;
    }

    if (expectedIds.has(item.id)) {
      const nextValue = (Number(counts[item.id]) || 0) + 1;
      setCounts((current) => ({ ...current, [item.id]: String((Number(current[item.id]) || 0) + 1) }));
      const expected = expectedItems.find((entry) => entry.id === item.id);
      setQuery("");
      setHighlightId(item.id);
      window.setTimeout(() => document.getElementById(`stocktake-item-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
      setScanFeedback({ tone: "ok", text: `✔ ${item.name}: ${nextValue} من ${expected?.systemQuantity ?? "؟"} مسجلة` });
      return;
    }

    const existing = extras.find((line) => line.itemId === item.id);
    if (existing) {
      const nextValue = (Number(existing.actualQuantity) || 0) + 1;
      setExtras((current) => current.map((line) => line.itemId === item.id ? { ...line, actualQuantity: String(nextValue) } : line));
      setScanFeedback({ tone: "ok", text: `＋ ${item.name}: ${nextValue} (غير مسجلة في هذه الغرفة)` });
    } else {
      setExtras((current) => [...current, { key: nextKey, itemId: item.id, actualQuantity: "1" }]);
      setNextKey((value) => value + 1);
      setScanFeedback({ tone: "ok", text: `＋ ${item.name}: أضيفت كمادة جديدة في الغرفة (1)` });
    }
    setHighlightId(item.id);
  }

  function setCount(itemId: string, value: string) {
    setCounts((current) => ({ ...current, [itemId]: value }));
  }

  function confirmVisibleAsMatching() {
    setCounts((current) => {
      const next = { ...current };
      for (const item of visibleExpected) next[item.id] = String(item.systemQuantity);
      return next;
    });
  }

  function addExtraItem(itemId: string) {
    if (!itemId || expectedIds.has(itemId) || selectedExtraIds.has(itemId)) return;
    setExtras((current) => [...current, { key: nextKey, itemId, actualQuantity: "1" }]);
    setNextKey((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (navigator.onLine) return;
    event.preventDefault();
    const draft: StocktakeOfflineDraft = {
      counts,
      extras,
      responsibleEmployeeId,
      responsibleName,
      countDate,
      referenceNo,
      notes,
    };
    try {
      await saveOfflineDraft(draftKey, draft);
      setDraftRestored(true);
      setOfflineMessage("تم حفظ الجرد على هذا الجهاز. عند رجوع الإنترنت اضغط الزر نفسه لإرساله إلى النظام.");
    } catch {
      setOfflineMessage("تعذر حفظ المسودة محلياً. أبقِ هذه الصفحة مفتوحة وحاول مرة أخرى.");
    }
  }

  return (
    <form action={createStocktakeAdjustments} onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="locationId" value={locationId} />

      {!online || draftRestored || offlineMessage ? (
        <section className={`rounded-2xl border p-4 text-sm leading-7 ${online ? "border-blue-200 bg-blue-50 text-blue-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}>
          <strong>{online ? "حالة المسودة: " : "وضع دون إنترنت: "}</strong>
          {offlineMessage ?? (draftRestored ? "تم العثور على جرد محفوظ محلياً لهذه الغرفة واستعادته." : "كل ما تدخله سيُحفظ على هذا الجهاز حتى يعود الاتصال.")}
          {draftRestored ? (
            <button type="button" onClick={discardDraft} className="mr-2 rounded-lg border border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-700">مسح المسودة والبدء من جديد</button>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <div>
          <p className="text-xs font-bold text-blue-700">سند العهدة بعد الجرد</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">من سيستلم عهدة {locationName}؟</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            اختر موظفاً مسجلاً، أو اكتب اسم المستلم إذا لم يكن موجوداً بعد. إذا تركت الحقلين فارغين سيُحفظ الجرد فقط من دون إنشاء سند عهدة.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            موظف مسجل
            <select name="responsibleEmployeeId" value={responsibleEmployeeId} onChange={(event) => setResponsibleEmployeeId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base">
              <option value="">— اختر إن كان مسجلاً —</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}{employee.employeeNo ? ` (${employee.employeeNo})` : ""}{employee.locationName ? ` — ${employee.locationName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            أو اكتب اسم المستلم / الموقّع
            <input name="responsibleName" value={responsibleName} onChange={(event) => setResponsibleName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base" placeholder="مثال: أحمد محمد" autoComplete="off" />
          </label>
        </div>
        <p className="mt-3 text-xs leading-6 text-blue-900">سيظهر الاسم على سند العهدة مع مكان مخصص للتوقيع عند الطباعة.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium text-slate-700">
            تاريخ الجرد
            <input name="countDate" type="date" value={countDate} onChange={(event) => setCountDate(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            رقم / مرجع الجرد
            <input name="referenceNo" value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" placeholder="اختياري - يولده النظام تلقائياً" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            ملاحظات عامة
            <input name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3" placeholder="مثال: جرد سنوي / لجنة الجرد" />
          </label>
        </div>
      </section>

      <section className="sticky top-16 z-20 rounded-2xl border border-blue-300 bg-white/95 p-4 shadow-md backdrop-blur lg:top-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-extrabold text-slate-900">الجرد بالمسح</h3>
            <p className="text-xs leading-6 text-slate-600">كل مسح لملصق مادة يضيف قطعة واحدة إلى الكمية الفعلية.</p>
          </div>
          <QrScanner label="مسح ملصقات المواد" onResult={handleScan} continuous className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800" />
        </div>
        {scanFeedback ? (
          <p className={`mt-3 rounded-lg px-3 py-2 text-sm font-bold ${scanFeedback.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{scanFeedback.text}</p>
        ) : null}
      </section>

      <section id="add-room-items" className="scroll-mt-20 rounded-2xl border border-blue-200 bg-white shadow-sm">
        <div className="border-b border-blue-100 p-4">
          <h3 className="text-lg font-bold text-slate-900">إدارة مواد الغرفة</h3>
          <p className="mt-1 text-sm leading-7 text-slate-600">ابحث في جميع مواد النظام. يمكنك إضافة مادة غير موجودة في الغرفة، أما إزالة مادة مسجلة فتتم من قائمتها أدناه حتى تبقى الحركة محفوظة في السجل.</p>
          <Link href={`/items/new?stocktakeLocationId=${encodeURIComponent(locationId)}`} className="mt-3 inline-block rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">+ إنشاء مادة جديدة غير موجودة في الدليل</Link>
          <input value={extraSearch} onChange={(event) => setExtraSearch(event.target.value)} placeholder="ابحث في جميع المواد بالاسم أو رقم المادة" className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-base" />
        </div>
        {extraSearch.trim() ? (
          <div className="divide-y divide-slate-100">
            {allSearchResults.map((item) => {
              const inRoom = expectedIds.has(item.id);
              const alreadyAdded = selectedExtraIds.has(item.id);
              return (
                <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{item.name}</strong>{item.itemCode ? <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{item.itemCode}</span> : null}</div>
                    <p className="mt-1 text-xs text-slate-500">{item.unitName ?? "بدون وحدة محددة"}</p>
                  </div>
                  {inRoom ? <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">موجودة في الغرفة</span> : alreadyAdded ? <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">مضافة إلى الجرد</span> : <button type="button" onClick={() => addExtraItem(item.id)} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800">+ إضافة إلى الغرفة</button>}
                </div>
              );
            })}
            {allSearchResults.length === 0 ? <p className="p-5 text-sm text-slate-500">لا توجد مادة مطابقة للبحث.</p> : null}
          </div>
        ) : <p className="p-4 text-sm text-slate-500">ابدأ بكتابة اسم المادة أو رقمها لعرض النتائج من جميع المواد.</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">المواد المسجلة في {locationName}</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">ابحث ثم سجّل ما وجدته فعلياً. زر «مطابق» ينسخ رصيد النظام مباشرة، وزر «إزالة من الغرفة» يسجل الكمية الفعلية صفراً ويجهز تسوية نقص للمراجعة.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المادة أو رقمها" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base" />
            <button type="button" onClick={confirmVisibleAsMatching} disabled={visibleExpected.length === 0} className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 enabled:hover:bg-emerald-100 disabled:opacity-50">اعتبار الظاهر مطابقًا</button>
          </div>
          <p className="mt-2 text-xs text-slate-500">الظاهر الآن: {visibleExpected.length} من {expectedItems.length}</p>
        </div>

        {expectedItems.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لا توجد مواد مسجلة حالياً في هذه الغرفة. يمكنك إضافة ما وجدته من القسم التالي.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {expectedItems.map((item) => {
              const visible = matches(item, query);
              return (
                <div key={item.id} id={`stocktake-item-${item.id}`} className={visible ? `p-4 transition-colors ${highlightId === item.id ? "bg-emerald-50" : ""}` : "hidden"}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-slate-900">{item.name}</h4>
                        {item.itemCode ? <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{item.itemCode}</span> : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        المسجل: <strong className="text-slate-900">{item.systemQuantity}</strong>{item.unitName ? ` ${item.unitName}` : ""}
                        {item.assignedQuantity > 0 ? <> • منها في عهد الموظفين: <strong className="text-blue-800">{item.assignedQuantity}</strong></> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setCount(item.id, String(item.systemQuantity))} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">مطابق</button>
                      {item.assignedQuantity > 0 ? (
                        <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">لا تُزال قبل إرجاع العهدة</span>
                      ) : counts[item.id] === "0" ? (
                        <button type="button" onClick={() => setCount(item.id, "")} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">تراجع عن الإزالة</button>
                      ) : (
                        <button type="button" onClick={() => setCount(item.id, "0")} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">إزالة من الغرفة</button>
                      )}
                      <input name="actualQuantity" type="number" min={item.assignedQuantity} step={1} inputMode="numeric" value={counts[item.id] ?? ""} onChange={(event) => setCount(item.id, event.target.value)} className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-center text-base font-bold" placeholder="الفعلي" />
                    </div>
                  </div>
                  {item.assignedQuantity > 0 ? <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">هذه المادة مرتبطة بعهدة موظف. أقل كمية يمكن اعتمادها في هذه الغرفة حالياً هي {item.assignedQuantity}. لمعالجة نقص أكبر، أرجع أو انقل العهدة أولاً.</p> : counts[item.id] === "0" ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">سيتم تسجيل هذه المادة كغير موجودة في الغرفة، ولن تُحذف من سجل النظام.</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <h3 className="font-bold text-slate-900">مواد ستُضاف إلى الغرفة</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">المواد التي اخترتها من «إدارة مواد الغرفة» تظهر هنا. عدّل الكمية أو احذف الإضافة قبل حفظ الجرد.</p>
        </div>

        {extras.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">لم تضف مواد جديدة إلى الجرد بعد.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {extras.map((line, index) => (
              <div key={line.key} className="p-4">
                <div className="grid gap-3 md:grid-cols-[1fr_130px_auto] md:items-end">
                  <label className="text-sm font-medium text-slate-700">
                    المادة {index + 1}
                    <select name="itemId" required value={line.itemId} onChange={(event) => setExtras((current) => current.map((entry) => entry.key === line.key ? { ...entry, itemId: event.target.value } : entry))} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3">
                      <option value="">اختر المادة</option>
                      {allItems.filter((item) => !expectedIds.has(item.id)).filter((item) => item.id === line.itemId || matches(item, extraSearch)).filter((item) => !selectedExtraIds.has(item.id) || item.id === line.itemId).map((item) => <option key={item.id} value={item.id}>{item.itemCode ? `${item.itemCode} — ` : ""}{item.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    الكمية
                    <input name="actualQuantity" type="number" min={1} step={1} inputMode="numeric" required value={line.actualQuantity} onChange={(event) => setExtras((current) => current.map((entry) => entry.key === line.key ? { ...entry, actualQuantity: event.target.value } : entry))} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 text-center font-bold" />
                  </label>
                  <button type="button" onClick={() => setExtras((current) => current.filter((entry) => entry.key !== line.key))} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-bold text-red-700 hover:bg-red-50">حذف</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
        النظام سيقارن الجرد بالرصيد الحالي. أي زيادة أو نقص تُنشأ كمسودة تسوية للمراجعة، وسند العهدة يبقى أيضاً مسودة إلى أن تراجع كل شيء ثم تعتمده. أثناء انقطاع الإنترنت لا يتم اعتماد أي حركة؛ تحفظ المسودة على الجهاز فقط.
      </section>

      <button className="w-full rounded-xl bg-slate-900 px-6 py-4 text-base font-bold text-white hover:bg-slate-800 sm:w-auto">
        {online && draftRestored ? "إرسال الجرد المحفوظ وتجهيز المستندات" : online ? "حفظ نتيجة الجرد وتجهيز المستندات" : "حفظ الجرد على الجهاز"}
      </button>
    </form>
  );
}
