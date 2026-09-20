import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "نظام إدارة العُهَد",
  description: "نظام إدارة العهد واللوازم - مركز الرمثا",
};

const links = [
  { href: "/", label: "الرئيسية" },
  { href: "/items", label: "المواد" },
  { href: "/locations", label: "المواقع والغرف" },
  { href: "/employees", label: "الموظفون" },
  { href: "/documents", label: "المستندات" },
  { href: "/stocktake", label: "الجرد والتسويات" },
  { href: "/settings/templates", label: "نماذج الطباعة" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="min-h-screen">
          <header className="no-print border-b border-slate-200 bg-white shadow-sm">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
              <div>
                <h1 className="text-xl font-bold text-slate-900">نظام إدارة العُهَد</h1>
                <p className="mt-1 text-sm text-slate-500">مركز الرمثا</p>
              </div>
              <nav className="flex gap-2 overflow-x-auto pb-1 md:pb-0">
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
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
