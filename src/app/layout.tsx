import type { Metadata } from "next";
import Link from "next/link";
import CenterSwitcher from "@/components/center-switcher";
import OfflineStatus from "@/components/offline-status";
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
  { href: "/locations", label: "المواقع والغرف" },
  { href: "/employees", label: "الموظفون" },
  { href: "/documents", label: "المستندات" },
  { href: "/stocktake", label: "الجرد والتسويات" },
  { href: "/reports", label: "التقارير والبحث" },
];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="min-h-screen bg-slate-100 lg:pr-60">
          <aside className="no-print fixed inset-y-0 right-0 z-40 hidden w-60 flex-col bg-slate-800 px-4 py-5 text-white shadow-xl lg:flex">
            <div className="border-b border-slate-600 pb-4 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-slate-500 bg-white text-3xl text-slate-800">ع</div>
              <h1 className="mt-3 text-xl font-bold">إدارة العُهَد</h1>
              <div className="mt-2 text-sm text-slate-300"><CenterSwitcher /></div>
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
            <div className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div><h1 className="font-bold text-slate-900">إدارة العُهَد</h1><CenterSwitcher /></div>
                <Link href="/stocktake" className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-bold text-white">الجرد</Link>
              </div>
              <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {links.map((link) => <Link key={link.href} href={link.href} className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{link.label}</Link>)}
              </nav>
            </div>
          </header>
          <main className="min-h-screen p-4 sm:p-5 lg:p-6 xl:p-8">{children}</main>
          <OfflineStatus />
        </div>
      </body>
    </html>
  );
}
