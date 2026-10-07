import type { Metadata, Viewport } from "next";
import Link from "next/link";
import CenterSwitcher from "@/components/center-switcher";
import OfflineStatus from "@/components/offline-status";
import InstallAppButton from "@/components/install-app-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام إدارة العُهَد",
  description: "نظام مركزي لإدارة العهد واللوازم لعدة مراكز",
  applicationName: "إدارة العهد",
  manifest: "/manifest.webmanifest",
};

const operationLinks = [
  { href: "/", label: "الرئيسية" },
  { href: "/items", label: "المواد" },
  { href: "/custody", label: "العُهد" },
  { href: "/stocktake", label: "الجرد" },
  { href: "/documents", label: "المستندات والسندات" },
  { href: "/reports", label: "التقارير" },
];

const masterDataLinks = [
  { href: "/employees", label: "الموظفون" },
  { href: "/locations", label: "الغرف والمواقع" },
];

const mobileLinks = [
  { href: "/", label: "الرئيسية" },
  { href: "/items", label: "المواد" },
  { href: "/custody", label: "العُهد" },
  { href: "/employees", label: "الموظفون" },
  { href: "/locations", label: "الغرف" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="overflow-x-hidden">
        <div className="min-h-screen bg-slate-100 lg:pr-64">
          <aside className="no-print fixed inset-y-0 right-0 z-40 hidden w-64 flex-col overflow-y-auto bg-slate-950 px-4 py-5 text-white shadow-xl lg:flex">
            <div className="border-b border-white/10 pb-4 text-center">
              <Link href="/" className="block">
                <img src="/official-logo-full.webp" alt="شعار جمعية المركز الإسلامي الخيرية" className="mx-auto h-28 w-auto max-w-[150px] object-contain" />
              </Link>
              <h1 className="mt-3 text-xl font-extrabold">إدارة العُهَد واللوازم</h1>
              <div className="mt-2 text-sm text-slate-300"><CenterSwitcher /></div>
              <div className="mt-3"><InstallAppButton /></div>
            </div>
            <nav className="mt-5">
              <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">التشغيل</p>
              <div className="mt-2 grid gap-1.5">
                {operationLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="rounded-lg border border-white/5 bg-white/5 px-4 py-2.5 text-right text-sm font-bold text-slate-100 transition hover:border-blue-400/40 hover:bg-blue-500/20">
                    {link.label}
                  </Link>
                ))}
              </div>
              <p className="mt-5 px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">البيانات الأساسية</p>
              <div className="mt-2 grid gap-1.5">
                {masterDataLinks.map((link) => (
                  <Link key={link.href} href={link.href} className="rounded-lg border border-white/5 bg-white/5 px-4 py-2.5 text-right text-sm font-bold text-slate-100 transition hover:border-emerald-400/40 hover:bg-emerald-500/20">
                  {link.label}
                  </Link>
                ))}
              </div>
            </nav>
            <div className="mt-auto border-t border-white/10 pt-4 text-center text-xs leading-6 text-slate-500">جمعية المركز الإسلامي الخيرية<br />قسم اللوازم والمشتريات</div>
          </aside>
          <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <Link href="/" className="truncate font-extrabold text-slate-900">إدارة العُهَد</Link>
                <CenterSwitcher />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <InstallAppButton compact />
                <Link href="/documents" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">السندات</Link>
              </div>
            </div>
          </header>
          <main className="min-h-screen min-w-0 max-w-full overflow-x-hidden p-4 pb-24 sm:p-5 sm:pb-24 lg:p-6 lg:pb-6 xl:p-8">{children}</main>
          <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(15,23,42,0.08)] lg:hidden">
            {mobileLinks.map((link) => <Link key={link.href} href={link.href} className="px-1 py-3 text-center text-[11px] font-bold text-slate-700 hover:bg-slate-50">{link.label}</Link>)}
          </nav>
          <OfflineStatus />
        </div>
      </body>
    </html>
  );
}
