"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaymentModal } from "@/components/stellora/payment-modal";
import { formatINR } from "@/lib/utils";

/** Re-opens the secure checkout for an order whose payment is still pending. */
export function PayNowButton({ orderNumber, amount }: { orderNumber: string; amount: number }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <Button onClick={() => setOpen(true)} className="rounded-full bg-primary hover:bg-primary/90">
        <CreditCard className="mr-2 h-4 w-4" /> Complete payment · {formatINR(amount)}
      </Button>
      <PaymentModal
        open={open}
        onOpenChange={setOpen}
        orderNumber={orderNumber}
        amount={amount}
        onSuccess={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
