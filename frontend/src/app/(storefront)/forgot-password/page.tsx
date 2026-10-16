import Link from "next/link";
import { AuthForm } from "@/components/stellora/auth-form";

export const metadata = { title: "Forgot Password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-medium">Reset Password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your account email and we will generate a reset link.
        </p>
      </div>
      <div className="mt-8 rounded-lg border border-border/70 bg-card p-6 sm:p-8">
        <AuthForm mode="forgot" />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
