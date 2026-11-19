import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookie and keeps unauthenticated visitors on
 * /login. Authorisation (allowlist) is enforced again in every page and server
 * action via requireUser().
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isLogin = request.nextUrl.pathname === "/login";

  if (!url || !anonKey) {
    if (isLogin) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isLogin) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  // Everything except the cron and worker endpoints (which check their own
  // shared secret) and static assets: build output plus public/ branding, which carry no
  // data and must load on the sign-in page itself.
  matcher: ["/((?!_next/static|_next/image|api/cron|api/wa/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)"],
};
