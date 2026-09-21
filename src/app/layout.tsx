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

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/items", label: "المواد" },
  { href: "/custody", label: "العُهد" },
  { href: "/stocktake", label: "الجرد" },
  { href: "/documents", label: "المستندات والسندات" },
  { href: "/reports", label: "التقارير" },
];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="overflow-x-hidden">
        <div className="min-h-screen bg-slate-100 lg:pr-60">
          <aside className="no-print fixed inset-y-0 right-0 z-40 hidden w-60 flex-col bg-slate-800 px-4 py-5 text-white shadow-xl lg:flex">
            <div className="border-b border-slate-600 pb-4 text-center">
              <img src="/official-logo-full.webp" alt="شعار جمعية المركز الإسلامي الخيرية" className="mx-auto h-32 w-auto max-w-[155px] object-contain" />
              <h1 className="mt-3 text-xl font-bold">إدارة العُهَد</h1>
              <div className="mt-2 text-sm text-slate-300"><CenterSwitcher /></div>
              <div className="mt-3"><InstallAppButton /></div>
            </div>
            <nav className="mt-5 grid gap-2">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-md bg-blue-600 px-4 py-3 text-center text-sm font-bold transition hover:bg-blue-500">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-auto border-t border-slate-600 pt-4 text-center text-xs leading-6 text-slate-400">جمعية المركز الإسلامي الخيرية<br />قسم اللوازم والمشتريات</div>
          </aside>
          <header className="no-print sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <h1 className="truncate font-bold text-slate-900">إدارة العُهَد</h1>
                <CenterSwitcher />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <InstallAppButton compact />
                <Link href="/stocktake" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">الجرد</Link>
              </div>
            </div>
          </header>
          <main className="min-h-screen min-w-0 max-w-full overflow-x-hidden p-4 pb-24 sm:p-5 sm:pb-24 lg:p-6 lg:pb-6 xl:p-8">{children}</main>
          <nav className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(15,23,42,0.08)] lg:hidden">
            {[links[0],links[1],links[2],links[3],links[4]].map((link) => <Link key={link.href} href={link.href} className="px-1 py-3 text-center text-[11px] font-bold text-slate-700">{link.label === "المستندات والسندات" ? "السندات" : link.label}</Link>)}
          </nav>
          <OfflineStatus />
        </div>
      </body>
    </html>
  );
}
