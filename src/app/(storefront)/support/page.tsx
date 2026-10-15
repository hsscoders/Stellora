import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PackageSearch, MessageCircle, RotateCcw } from "lucide-react";

export const metadata = { title: "Customer Support" };

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-4xl font-medium">Customer Support</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Here is the fastest way to resolve the most common needs.
        </p>
        <div className="mx-auto mt-5 h-px w-24 gold-line" />
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: PackageSearch,
            title: "Track an order",
            text: "See live, server-verified status with your order number and email.",
            href: "/track-order",
            cta: "Track order",
          },
          {
            icon: RotateCcw,
            title: "Returns & refunds",
            text: "Review eligibility and the process under our return policy.",
            href: "/policies/returns",
            cta: "Read policy",
          },
          {
            icon: MessageCircle,
            title: "Talk to us",
            text: "Send a message — a real person reads and replies to every one.",
            href: "/contact",
            cta: "Contact us",
          },
        ].map((c) => (
          <div key={c.title} className="flex flex-col items-center rounded-lg border border-border/70 bg-card p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent">
              <c.icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <h3 className="mt-4 font-serif text-lg font-medium">{c.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{c.text}</p>
            <Button asChild variant="outline" size="sm" className="mt-4 rounded-full">
              <Link href={c.href}>{c.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
