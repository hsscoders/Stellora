"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "@/components/ui/notify";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Footer newsletter signup — posts to the public /api/newsletter endpoint. */
export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "footer" }),
      });
      const json = await res.json();
      if (json.ok) {
        setDone(true);
        toast.success(json.data?.message ?? "You're on the list!");
      } else {
        toast.error(json.error?.message ?? "Could not subscribe right now.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="rounded-md bg-accent/50 px-4 py-3 text-sm text-accent-foreground">
        Welcome to the list — watch your inbox for new pieces and early access.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-xs gap-2">
      <Input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email address"
        aria-label="Email address for newsletter"
        className="bg-background"
      />
      <Button
        type="submit"
        disabled={busy}
        size="icon"
        aria-label="Subscribe"
        className="btn-press shrink-0 rounded-md bg-primary hover:bg-primary/90"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
