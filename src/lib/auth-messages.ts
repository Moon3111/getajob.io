export function formatAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("email not confirmed")) {
    return "Email not confirmed yet. Check your inbox for the Supabase confirmation link, or disable “Confirm email” in Supabase → Authentication → Providers → Email for local testing.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Invalid email or password. If you just signed up, confirm your email first or use the correct password.";
  }

  if (lower.includes("user already registered")) {
    return "An account with this email already exists. Try signing in instead.";
  }

  return message;
}
