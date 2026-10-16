import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 py-20 text-center">
      <p className="font-serif text-[100px] font-semibold leading-none text-primary/30 tnum">404</p>
      <h1 className="mt-2 font-serif text-3xl font-medium">This page has wandered off</h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
        The page you are looking for does not exist or may have moved. Let us guide you back to
        something beautiful.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild className="rounded-full bg-primary hover:bg-primary/90">
          <Link href="/">Return home</Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/shop">Browse the shop</Link>
        </Button>
      </div>
    </div>
  );
}
