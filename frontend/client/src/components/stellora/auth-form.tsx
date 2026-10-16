"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";

export function AuthForm({
  mode,
}: {
  mode: "login" | "register" | "forgot";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/account";
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const refreshCart = useStore((s) => s.refreshCart);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const url =
      mode === "login"
        ? "/api/auth/login"
        : mode === "register"
          ? "/api/auth/register"
          : "/api/auth/forgot-password";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrors(json.error?.fields ?? {});
        toast.error(json.error?.message ?? "Something went wrong");
        return;
      }
      if (mode === "forgot") {
        toast.success("Check your inbox for the reset link.", {
          description: json.data.devLink
            ? "Dev mode: SMTP is not configured — the reset link is also printed in the server log."
            : undefined,
          duration: 8000,
        });
        if (json.data.devLink) {
          setErrors({ devLink: json.data.devLink });
        }
        return;
      }
      await refreshCart();
      toast.success(mode === "login" ? "Welcome back!" : "Account created. Welcome to Stellora!");
      // The admin console is a SEPARATE Next.js app behind a rewrite proxy.
      // router.push() soft-navigates across the rewrite boundary and fails
      // silently (user stays stuck on /login) — a hard navigation is required.
      if (json.data.role === "ADMIN" || next.startsWith("/admin-console")) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional hard navigation across the admin-console rewrite boundary
        window.location.assign("/admin-console");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "register" && (
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" required autoComplete="name" placeholder="Aisha Kapoor" />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
      )}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
      </div>
      {mode === "register" && (
        <div>
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" name="phone" autoComplete="tel" placeholder="98000 00000" />
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
      )}
      {mode !== "forgot" && (
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-muted-foreground">
              At least 8 characters with a letter and a number.
            </p>
          )}
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </div>
      )}

      {errors.devLink && (
        <div className="rounded-md border border-border bg-accent/60 p-3 text-xs break-all">
          <p className="font-medium text-accent-foreground">Dev mode reset link (SMTP not configured):</p>
          <a className="text-primary underline" href={errors.devLink}>
            {errors.devLink}
          </a>
        </div>
      )}

      <Button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-primary py-6 text-sm tracking-wide hover:bg-primary/90"
      >
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign In"
            : mode === "register"
              ? "Create Account"
              : "Send Reset Link"}
      </Button>
    </form>
  );
}
