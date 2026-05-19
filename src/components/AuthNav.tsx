"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AuthNav() {
  const router = useRouter();
  const [displayLabel, setDisplayLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        setDisplayLabel(null);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle();

      setDisplayLabel(
        profile?.username ? `@${profile.username}` : user.email ?? null
      );
      setLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUser();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setDisplayLabel(null);
    router.push("/");
    router.refresh();
  };

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        …
      </Button>
    );
  }

  if (displayLabel) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground md:inline">
          {displayLabel}
        </span>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </div>
    );
  }

  return (
  <>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/auth/login">Sign in</Link>
      </Button>
    </>
  );
}
