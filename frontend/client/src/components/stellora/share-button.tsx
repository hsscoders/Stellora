"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Copy-the-link share — no native-share dependency, works everywhere. */
export function ShareButton({ path, name }: { path: string; name: string }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied", { description: "Share it with someone special." });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not share right now.");
    }
  };

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={share}
      aria-label={`Share ${name}`}
      className="h-10 w-10 shrink-0 rounded-full border-border/70 text-muted-foreground transition hover:border-primary hover:text-primary"
    >
      {copied ? <Check className="h-4 w-4 text-primary" /> : <Share2 className="h-4 w-4" />}
    </Button>
  );
}
