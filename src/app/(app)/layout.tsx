import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";
import { signOutAction } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-neutral-200 bg-white px-4 py-3 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:py-5">
        <Link href="/" className="mb-3 flex items-center gap-2 md:mb-6 md:px-3">
          <Image src="/logo-mark.png" alt="" width={32} height={30} priority className="h-8 w-auto" />
          <span className="text-sm leading-tight font-semibold text-neutral-900">
            DDC Leads Report
            <span className="block text-xs font-normal text-neutral-500">Mitsubishi DIPO</span>
          </span>
        </Link>
        <Nav />
        <div className="mt-4 hidden border-t border-neutral-200 pt-4 md:mt-auto md:block md:px-3">
          <p className="truncate text-xs text-neutral-500" title={user.email}>
            {user.email}
          </p>
          <form action={signOutAction}>
            <button className="mt-1 text-xs text-neutral-600 hover:text-brand-700">Keluar</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
