"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-16">
      <section className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-2xl font-black text-red-700">!</div>
        <h2 className="mt-4 text-2xl font-extrabold text-slate-900">تعذر إكمال هذه العملية</h2>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          بقي البرنامج يعمل، لكن هذه الصفحة واجهت مشكلة أثناء تنفيذ العملية. ارجع للسند وراجع البيانات قبل المحاولة مرة أخرى.
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button onClick={reset} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white">إعادة المحاولة</button>
          <button onClick={() => { window.location.href = "/"; }} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700">العودة للرئيسية</button>
        </div>
        {error.digest ? <p className="mt-4 text-xs text-slate-400">رمز المتابعة: {error.digest}</p> : null}
      </section>
    </div>
  );
}
