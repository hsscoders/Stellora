import Link from "next/link";
import { AuthForm } from "@/components/stellora/auth-form";

export const metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-medium">Create Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Join Stellora for orders, wishlist and faster checkout
        </p>
      </div>
      <div className="mt-8 rounded-lg border border-border/70 bg-card p-6 sm:p-8">
        <AuthForm mode="register" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
