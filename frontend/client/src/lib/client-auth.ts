/** Client-side helper to fetch the current user via /api/auth/me. */
export async function getCurrentUserClient(): Promise<{
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
} | null> {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    const json = await res.json();
    return json.ok ? json.data.user : null;
  } catch {
    return null;
  }
}
