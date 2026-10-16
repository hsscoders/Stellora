import { Skeleton } from "@/components/ui/skeleton";

/** Instant skeleton while the shop page streams — no blank flash. */
export default function ShopLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-px w-24" />
      </div>
      <div className="mt-8 flex items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-[190px] rounded-full" />
      </div>
      <div className="mt-6 flex gap-8">
        <Skeleton className="hidden w-64 shrink-0 rounded-xl lg:block" />
        <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[4/5] w-full rounded-lg" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
