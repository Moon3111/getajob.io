const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);
  if (!USERNAME_RE.test(normalized)) {
    return "Username must be 3–24 characters (letters, numbers, underscore only).";
  }
  return null;
}
