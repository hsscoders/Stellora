"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      toast.success("Password updated. Please sign in.");
      router.push("/login");
    } else {
      setError(json.error?.message ?? "Could not reset password.");
    }
  }

  if (!token) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        This link is missing its reset token. Please request a new one from the{" "}
        <a href="/forgot-password" className="text-primary underline">
          forgot password
        </a>{" "}
        page.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          At least 8 characters with a letter and a number.
        </p>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        type="submit"
        disabled={busy}
        className="w-full rounded-full bg-primary py-6 text-sm hover:bg-primary/90"
      >
        {busy ? "Updating…" : "Update Password"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-medium">Choose a New Password</h1>
      </div>
      <div className="mt-8 rounded-lg border border-border/70 bg-card p-6 sm:p-8">
        <Suspense fallback={<Skeleton className="h-48 w-full" />}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
