import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DDC Leads Report", template: "%s · DDC Leads Report" },
  description: "Pencatatan prospek, laporan bulanan, dan handover cabang Mitsubishi DIPO.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
