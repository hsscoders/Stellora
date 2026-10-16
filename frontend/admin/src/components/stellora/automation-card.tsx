"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, RefreshCw, Play, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/notify";

/**
 * Auto-pilot — live status of the store's unattended automation sweeps
 * (stale-order auto-cancel + back-in-stock auto-notify) with manual
 * "run now" controls for each job.
 */

interface JobRun {
  at: string;
  durationMs: number;
  affected: number;
  ok: boolean;
  error?: string;
}

interface JobInfo {
  id: string;
  label: string;
  intervalMinutes: number;
  running: boolean;
  totalProcessed: number;
  lastRun: JobRun | null;
}

interface AutomationPayload {
  jobs: JobInfo[];
  config: { staleOrderHours: number };
  stalePending: number;
  pendingRestockAlerts: number;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function AutomationCard() {
  const [data, setData] = useState<AutomationPayload | null>(null);
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    fetch("/api/admin/automation", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (alive.current && j.ok) setData(j.data as AutomationPayload);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    alive.current = true;
    load();
    const poll = setInterval(load, 60_000); // stay live without hammering
    return () => {
      alive.current = false;
      clearInterval(poll);
    };
  }, [load]);

  async function run(job: string) {
    setBusyJob(job);
    try {
      const res = await fetch("/api/admin/automation/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job }),
      });
      const json = await res.json();
      if (json.ok) {
        const r = json.data.result as JobRun;
        if (r.ok) {
          toast.success(
            r.affected > 0
              ? `${json.data.job}: ${r.affected} item${r.affected === 1 ? "" : "s"} processed`
              : `${json.data.job}: nothing to do`
          );
        } else {
          toast.error(`${json.data.job} failed: ${r.error ?? "unknown error"}`);
        }
      } else {
        toast.error(json.error?.message ?? "Could not run job");
      }
    } catch {
      toast.error("Could not reach the automation engine");
    } finally {
      if (alive.current) setBusyJob(null);
      load();
    }
  }

  const stalePending = data?.stalePending ?? 0;
  const pendingAlerts = data?.pendingRestockAlerts ?? 0;

  return (
    <section className="rounded-lg border border-border/70 bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-serif text-lg font-medium">
            <Bot className="h-4 w-4 text-primary" />
            Auto-pilot
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Always on
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The store runs itself — stale orders auto-cancel, back-in-stock alerts auto-send.
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {(data?.jobs ?? []).map((job) => (
          <div key={job.id} className="flex flex-col gap-2 bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {job.label}
                  <span className="flex items-center gap-1 text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                    <Clock className="h-3 w-3" /> every {job.intervalMinutes}m
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {job.lastRun
                    ? job.lastRun.ok
                      ? job.lastRun.affected > 0
                        ? `Last run ${timeAgo(job.lastRun.at)} — ${job.lastRun.affected} processed`
                        : `Last run ${timeAgo(job.lastRun.at)} — all clear`
                      : `Last run ${timeAgo(job.lastRun.at)} — failed`
                    : "First sweep in progress…"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full"
                disabled={busyJob === job.id || job.running}
                onClick={() => run(job.id)}
              >
                <Play className="h-3.5 w-3.5" />
                {busyJob === job.id ? "Running…" : "Run now"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {job.lastRun?.ok ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Healthy
                </span>
              ) : job.lastRun ? (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" /> {job.lastRun.error ?? "Failed"}
                </span>
              ) : null}
              <span className="tnum text-muted-foreground">
                {job.totalProcessed} all-time
              </span>
            </div>
          </div>
        ))}

        {!data && (
          <>
            <div className="bg-card p-5 text-sm text-muted-foreground">Loading auto-pilot…</div>
            <div className="bg-card p-5 text-sm text-muted-foreground">Loading auto-pilot…</div>
          </>
        )}
      </div>

      {data && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span>
            <span className={`tnum font-semibold ${stalePending > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
              {stalePending}
            </span>{" "}
            pending order{stalePending === 1 ? "" : "s"} older than {data.config.staleOrderHours}h (next sweep cancels + restocks)
          </span>
          <span>
            <span className={`tnum font-semibold ${pendingAlerts > 0 ? "text-primary" : "text-foreground"}`}>
              {pendingAlerts}
            </span>{" "}
            back-in-stock request{pendingAlerts === 1 ? "" : "s"} waiting for inventory
          </span>
        </div>
      )}
    </section>
  );
}
