"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-slate-100 p-6">
        <div className="mx-auto max-w-xl py-20 text-center">
          <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-extrabold text-slate-900">حدثت مشكلة في البرنامج</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">يمكنك إعادة المحاولة أو العودة إلى الصفحة الرئيسية دون إغلاق البرنامج.</p>
            <div className="mt-5 flex justify-center gap-2">
              <button onClick={reset} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white">إعادة المحاولة</button>
              <button onClick={() => { window.location.href = "/"; }} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700">الرئيسية</button>
            </div>
            {error.digest ? <p className="mt-4 text-xs text-slate-400">رمز المتابعة: {error.digest}</p> : null}
          </div>
        </div>
      </body>
    </html>
  );
}
