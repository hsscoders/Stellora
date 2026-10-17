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
    const raw = Object.fromEntries(form.entries()) as Record<string, string>;

    /* Mobile-first payloads: login/forgot send one `identifier`; register
       always sends the phone and only includes the email when given. */
    let payload: Record<string, string>;
    if (mode === "login") {
      payload = { identifier: (raw.identifier ?? "").trim(), password: raw.password ?? "" };
    } else if (mode === "register") {
      payload = { name: raw.name ?? "", phone: raw.phone ?? "", password: raw.password ?? "" };
      const email = (raw.email ?? "").trim();
      if (email) payload.email = email;
    } else {
      payload = { identifier: (raw.identifier ?? "").trim() };
    }

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
        toast.success("If we found your account, the reset link has been sent.", {
          description: json.data.devLink
            ? "Dev mode: SMTP is not configured — the reset link is also printed in the server logs."
            : "The reset link goes to the email address. For mobile-only accounts, please contact the shop.",
          duration: 8000,
        });
        if (json.data.devLink) {
          setErrors({ devLink: json.data.devLink });
        }
        return;
      }
      await refreshCart();
      toast.success(mode === "login" ? "Welcome back!" : "Account created! Welcome to Stellora.");
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

      {/* Mobile-first: the phone number leads on register; login/forgot take
          one identifier that accepts both mobile numbers and emails. */}
      {mode === "register" ? (
        <div>
          <Label htmlFor="phone">
            Mobile number <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-semibold">
              +91
            </span>
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              required
              autoComplete="tel-national"
              maxLength={10}
              placeholder="98765 43210"
              className="pl-12 tnum"
            />
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Order updates and the latest shop news will be sent to this number.
          </p>
          {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone}</p>}
        </div>
      ) : (
        <div>
          <Label htmlFor="identifier">
            {mode === "login" ? "Mobile number or Email" : "Mobile number or Email"}
          </Label>
          <Input
            id="identifier"
            name="identifier"
            required
            autoComplete={mode === "login" ? "username" : "email"}
            placeholder="98765 43210  ·  or  ·  you@example.com"
          />
          {errors.identifier && <p className="mt-1 text-xs text-destructive">{errors.identifier}</p>}
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
      )}

      {/* Email is now the optional second line on register — most shop
          customers only keep a mobile number. */}
      {mode === "register" && (
        <div>
          <Label htmlFor="email">
            Email <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
          />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
      )}

      {mode !== "forgot" && (
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" && (
              <Link href="/forgot-password" className="text-primary text-xs hover:underline">
                Forgot your password?
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
            <p className="text-muted-foreground mt-1 text-xs">
              At least 8 characters with a letter and a number.
            </p>
          )}
          {errors.password && <p className="mt-1 text-xs text-destructive">{errors.password}</p>}
        </div>
      )}

      {errors.devLink && (
        <div className="bg-accent/60 border-border rounded-md border p-3 text-xs break-all">
          <p className="text-accent-foreground font-medium">Dev mode reset link (SMTP not configured):</p>
          <a className="text-primary underline" href={errors.devLink}>
            {errors.devLink}
          </a>
        </div>
      )}

      <Button
        type="submit"
        disabled={busy}
        className="bg-primary hover:bg-primary/90 w-full rounded-full py-6 text-sm tracking-wide"
      >
        {busy
          ? "Please wait…"
          : mode === "login"
            ? "Sign In"
            : mode === "register"
              ? "Create Account"
              : "Send Reset Link"}
      </Button>

      {mode === "register" && (
        <p className="text-muted-foreground text-center text-xs leading-relaxed">
          You can also create an account with just a mobile number — email is optional.
        </p>
      )}
    </form>
  );
}
