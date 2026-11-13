import { redirect } from "next/navigation";
import { authEnabled, safeNextPath } from "@/lib/auth";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  if (!authEnabled()) redirect(next);

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-extrabold text-slate-900">تسجيل الدخول</h2>
      <p className="mt-2 text-sm leading-7 text-slate-600">أدخل رمز الدخول الظاهر على شاشة برنامج العهد في الكمبيوتر.</p>
      {params.error ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">رمز الدخول غير صحيح.</p>
      ) : null}
      <form action={login} className="mt-5 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium text-slate-700">
          رمز الدخول
          <input
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            inputMode="text"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-center text-xl font-bold tracking-widest"
          />
        </label>
        <button className="w-full rounded-xl bg-blue-700 px-4 py-3 text-base font-bold text-white hover:bg-blue-800">دخول</button>
      </form>
    </div>
  );
}
