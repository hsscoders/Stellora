"use client";

import { useState } from "react";
import { toast } from "@/components/ui/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const payload = Object.fromEntries(new FormData(e.currentTarget).entries());
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      setSent(true);
      toast.success("Message sent. We will get back to you soon.");
    } else {
      setErrors(json.error?.fields ?? {});
      toast.error(json.error?.message ?? "Could not send your message");
    }
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-primary/40 bg-accent/40 p-8 text-center">
        <p className="font-serif text-xl font-medium text-accent-foreground">Message received</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you for reaching out. Our team reads every message and will reply as soon as
          possible.
        </p>
        <Button variant="outline" className="mt-5 rounded-full" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required minLength={2} />
          {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
          {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
        </div>
      </div>
      <div>
        <Label htmlFor="subject">Subject</Label>
        <Input id="subject" name="subject" required placeholder="Order question, product help…" />
        {errors.subject && <p className="mt-1 text-xs text-destructive">{errors.subject}</p>}
      </div>
      <div>
        <Label htmlFor="message">Message</Label>
        <Textarea id="message" name="message" required rows={6} minLength={10} />
        {errors.message && <p className="mt-1 text-xs text-destructive">{errors.message}</p>}
      </div>
      <Button
        type="submit"
        disabled={busy}
        className="rounded-full bg-primary px-8 hover:bg-primary/90"
      >
        {busy ? "Sending…" : "Send Message"}
      </Button>
    </form>
  );
}
