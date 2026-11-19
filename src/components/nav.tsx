"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/prospek/tambah", label: "Tambah Prospek" },
  { href: "/prospek", label: "Data Prospek" },
  { href: "/service", label: "Data Service" },
  { href: "/handover", label: "Riwayat Handover" },
  { href: "/cabang", label: "Master Cabang" },
  { href: "/laporan", label: "Laporan Bulanan" },
  { href: "/pengaturan", label: "Pengaturan" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/prospek") return pathname === "/prospek" || /^\/prospek\/[^/]+\/edit/.test(pathname);
  if (href === "/prospek/tambah") return pathname === "/prospek/tambah";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm whitespace-nowrap ${
              active ? "bg-brand-50 font-semibold text-brand-700" : "text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
