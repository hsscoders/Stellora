"use client";

import { useState } from "react";
import { MapPin, CheckCircle2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/utils";

/**
 * Pincode delivery estimator — pure client logic (all 6-digit pincodes are
 * "serviceable"; metro prefixes get the faster window). Shows the delivery
 * window and free-shipping eligibility, the two questions every shopper asks.
 */
export function DeliveryEstimator({ unitPrice }: { unitPrice: number }) {
  const [pin, setPin] = useState("");
  const [result, setResult] = useState<{
    days: string;
    free: boolean;
    cod: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    const p = pin.trim();
    if (!/^\d{6}$/.test(p)) {
      setError("Enter a valid 6-digit pincode.");
      setResult(null);
      return;
    }
    setError(null);
    // Metro/urban prefixes ship faster; everything else gets the standard window.
    const metro = /^(1[1-6]|2|3|4[0-9]|5[0-6]|6[0-9]|7[0-8])/;
    const fast = metro.test(p.slice(0, 2)) || ["110", "400", "600", "700"].includes(p.slice(0, 3));
    setResult({
      days: fast ? "2–4 days" : "4–7 days",
      free: unitPrice >= 1999,
      cod: true,
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <MapPin className="h-4 w-4 text-primary" />
        Check delivery &amp; services
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ""));
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && check()}
          placeholder="Enter pincode e.g. 110001"
          aria-label="Delivery pincode"
          className="tnum"
        />
        <Button
          type="button"
          variant="outline"
          onClick={check}
          className="btn-press shrink-0 rounded-full border-primary/50 px-5 font-medium"
        >
          Check
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {result && (
        <div className="anim-fade-up mt-3 space-y-1.5 text-sm">
          <p className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Delivery by <span className="font-semibold">{result.days}</span>
            <span className="text-muted-foreground">· to {pin}</span>
          </p>
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {result.free ? (
              <>
                <span className="font-semibold">Free shipping</span> on this order
              </>
            ) : (
              <>
                Free shipping on orders over {formatINR(1999)}
                {result.cod && <span className="text-muted-foreground"> · COD available</span>}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
