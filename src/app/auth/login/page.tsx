"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Briefcase, Loader2 } from "lucide-react";
import { resolveEmailForLogin } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/auth-messages";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const callbackMessage = searchParams.get("message");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (callbackMessage) return decodeURIComponent(callbackMessage);
    if (callbackError === "auth") {
      return "Sign-in link expired or invalid. Try again.";
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { email, error: resolveError } = await resolveEmailForLogin(
        identifier
      );

      if (!email) {
        setError(resolveError ?? "Could not resolve account");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword(
        {
          email,
          password,
        }
      );

      if (authError) {
        setError(formatAuthError(authError.message));
        setLoading(false);
        return;
      }

      if (!data.session) {
        setError(
          "No active session. Confirm your email first (check inbox), or disable email confirmation in Supabase for local dev."
        );
        setLoading(false);
        return;
      }

      const next = searchParams.get("next") ?? "/dashboard";
      window.location.href = next.startsWith("/") ? next : "/dashboard";
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not connect to Supabase"
      );
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex items-center justify-center gap-2 font-semibold">
          <Briefcase className="h-6 w-6 text-primary" />
          getajob.io
        </div>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in with email or username to see your matches
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email or username</Label>
            <Input
              id="identifier"
              type="text"
              autoComplete="username"
              required
              placeholder="you@email.com or jane_doe"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/auth/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
