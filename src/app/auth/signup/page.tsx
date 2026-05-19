"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Briefcase, Loader2 } from "lucide-react";
import { saveUsernameProfile } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/client";
import { formatAuthError } from "@/lib/auth-messages";
import { normalizeUsername, validateUsername } from "@/lib/auth-username";
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

function SignupForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      setLoading(false);
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const trimmedEmail = email.trim().toLowerCase();

    try {
      const supabase = createClient();
      const next = searchParams.get("next") ?? "/dashboard";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

      const { data, error: authError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { username: normalizedUsername },
        },
      });

      if (authError) {
        setError(formatAuthError(authError.message));
        setLoading(false);
        return;
      }

      if (data.user && data.session) {
        const profileResult = await saveUsernameProfile(
          data.user.id,
          trimmedEmail,
          normalizedUsername
        );
        if (!profileResult.ok) {
          setError(profileResult.error ?? "Could not save username");
          setLoading(false);
          return;
        }
        window.location.href = next.startsWith("/") ? next : "/dashboard";
        return;
      }

      setSuccess(
        "Account created. Check your email for a confirmation link, then sign in with your username or email. (Supabase → Authentication → Email controls confirmation.)"
      );
      setLoading(false);
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
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Pick a username for easy sign-in — Hong Kong job matches
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSignup}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              required
              placeholder="jane_doe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              3–24 characters: letters, numbers, underscore
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 6 characters
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              {success}
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Sign up"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function SignupPage() {
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
        <SignupForm />
      </Suspense>
    </main>
  );
}
