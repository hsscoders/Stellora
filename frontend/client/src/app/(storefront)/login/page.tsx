import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/components/stellora/auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-medium">Welcome Back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to your Stellora account
        </p>
      </div>
      <div className="mt-8 rounded-lg border border-border/70 bg-card p-6 sm:p-8">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <AuthForm mode="login" />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to Stellora?{" "}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
