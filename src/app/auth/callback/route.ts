import { NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { saveUsernameProfile } from "@/app/actions/auth";
import { normalizeUsername, validateUsername } from "@/lib/auth-username";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") ? next : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/login?error=auth`);
  }

  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options: CookieOptions;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
      },
    },
  });

  const { data: sessionData, error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("auth callback:", error.message);
    return NextResponse.redirect(
      `${origin}/auth/login?error=auth&message=${encodeURIComponent(error.message)}`
    );
  }

  const user = sessionData.user;
  const metaUsername = user?.user_metadata?.username;
  if (user?.email && typeof metaUsername === "string") {
    const validation = validateUsername(metaUsername);
    if (!validation) {
      await saveUsernameProfile(
        user.id,
        user.email,
        normalizeUsername(metaUsername)
      );
    }
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
