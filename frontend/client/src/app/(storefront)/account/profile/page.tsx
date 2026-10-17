"use client";

import { useEffect, useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { getCurrentUserClient } from "@/lib/client-auth";

export default function ProfilePage() {
  const [user, setUser] = useState<{ name: string; email: string | null; phone: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCurrentUserClient().then(setUser);
  }, []);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      setUser(json.data);
      toast.success("Profile updated");
    } else {
      toast.error(json.error?.message ?? "Could not update profile");
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries());
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      toast.success("Password changed");
      form.reset();
    } else {
      toast.error(json.error?.fields?.currentPassword ?? json.error?.message ?? "Could not change password");
    }
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl font-medium">Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="max-w-md space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={user.name} required minLength={2} />
            </div>
            {/* Mobile-first shop: the phone leads the profile; email stays a
                read-only secondary (it cannot be changed without support). */}
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
                  maxLength={10}
                  required
                  autoComplete="tel-national"
                  defaultValue={user.phone ?? ""}
                  placeholder="98765 43210"
                  className="pl-12 tnum"
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Order updates are sent to this number.
              </p>
            </div>
            <div>
              <Label>
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input value={user.email ?? "— no email on this account —"} disabled />
            </div>
            <Button type="submit" disabled={busy} className="bg-primary hover:bg-primary/90 rounded-full">
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="max-w-md space-y-4">
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
            </div>
            <Separator />
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                At least 8 characters with a letter and a number.
              </p>
            </div>
            <Button type="submit" variant="outline" className="rounded-full">
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
