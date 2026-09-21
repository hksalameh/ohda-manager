import type { Metadata } from "next";
import Link from "next/link";
import CenterSwitcher from "@/components/center-switcher";
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
  { href: "/settings/templates", label: "نماذج الطباعة" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="min-h-screen">
          <header className="no-print border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:px-6">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">نظام إدارة العُهَد</h1>
                  <CenterSwitcher />
                </div>
                <nav className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
                  {links.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="whitespace-nowrap rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-5 sm:py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
