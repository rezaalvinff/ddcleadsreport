import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readEnv } from "@/lib/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

const STEPS = [
  { title: "Catat prospek sekali", body: "Nama, domisili, unit dan source. Wilayah pelaporan terisi sendiri dari domisili." },
  { title: "Kirim saat Anda siap", body: "Prospek menumpuk sepanjang hari, lalu satu tombol memperbarui tab bulanan di Google Sheets." },
  { title: "Serahkan ke cabang", body: "Pesan WhatsApp sudah tersusun rapi, tinggal disalin dan dikirim sendiri ke grup cabang." },
];

export default async function LoginPage() {
  await connection(); // configuration is read at request time, not build time
  const configured = readEnv("supabase").ok;
  if (configured && (await getCurrentUser())) redirect("/");

  return (
    <main className="min-h-screen bg-slate-50 lg:grid lg:min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel: deep navy drawn from the logo, with a faint grid so it is
          not a flat slab. Hidden on phones, where the form is all that matters. */}
      <aside className="relative hidden overflow-hidden bg-[#06294a] px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-28 -right-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #00adef 0%, transparent 70%)" }}
        />

        <div className="relative flex items-center gap-3">
          <Image src="/logo-mark.png" alt="" width={40} height={38} priority className="h-10 w-auto" />
          <span className="text-sm leading-tight font-semibold">
            DDC Leads Report
            <span className="block text-xs font-normal text-sky-200/80">Mitsubishi DIPO</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold text-balance">
            Dari prospek masuk sampai diterima cabang, dalam satu alur.
          </h2>
          <ol className="mt-8 space-y-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-sky-200 tabular-nums">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-sky-100/70">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="relative text-xs text-sky-200/60">
          Aplikasi internal. Pengiriman pesan WhatsApp tetap dilakukan manual oleh Anda.
        </p>
      </aside>

      <div className="flex min-h-screen items-center justify-center px-5 py-12 lg:min-h-0">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Image src="/logo-mark.png" alt="" width={52} height={49} priority className="h-12 w-auto" />
            <h1 className="mt-3 text-base font-semibold text-neutral-900">DDC Leads Report</h1>
            <p className="text-xs text-neutral-500">Aplikasi internal Mitsubishi DIPO</p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-7 shadow-sm">
            <h1 className="text-lg font-semibold text-neutral-900">Masuk</h1>
            <p className="mt-1 mb-6 text-sm text-neutral-500">Gunakan akun yang terdaftar untuk aplikasi ini.</p>
            {configured ? (
              <LoginForm />
            ) : (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                Supabase belum dikonfigurasi. Isi NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, dan
                SUPABASE_SERVICE_ROLE_KEY (lihat README).
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-neutral-400">Mitsubishi DIPO · DDC</p>
        </div>
      </div>
    </main>
  );
}
