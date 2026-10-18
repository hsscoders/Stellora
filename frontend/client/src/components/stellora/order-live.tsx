"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/notify";
import { useRealtimeEvent } from "@/components/stellora/realtime";

/**
 * Live order page — silently refreshes the server-rendered order the moment
 * its status/payment changes over Socket.IO, with a friendly toast.
 */
export function OrderLive({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const refreshing = useRef(false);
  const queue = useRef(0);

  const scheduleRefresh = () => {
    queue.current += 1;
    if (refreshing.current) return;
    refreshing.current = true;
    // Small debounce so bursts (payment + status together) cause one refresh.
    setTimeout(() => {
      queue.current = 0;
      router.refresh();
      refreshing.current = false;
    }, 400);
  };

  useRealtimeEvent<{ orderNumber: string; status: string }>("order:status", (p) => {
    if (!p || p.orderNumber !== orderNumber) return;
    toast.success(`Order update: ${p.status.replace("_", " ").toLowerCase()}`);
    scheduleRefresh();
  });

  useRealtimeEvent<{ orderNumber: string; paymentStatus: string }>("payment:status", (p) => {
    if (!p || p.orderNumber !== orderNumber) return;
    toast.success(`Payment marked ${p.paymentStatus.toLowerCase()}`);
    scheduleRefresh();
  });

  // Component renders nothing — it is pure behavior.
  useEffect(() => {
    void queue;
  }, []);

  return null;
}
