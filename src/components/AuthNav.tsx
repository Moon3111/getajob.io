"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AuthNav() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setEmail(null);
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

  if (email) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground md:inline">
          {email}
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
