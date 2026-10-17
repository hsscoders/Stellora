import type { Metadata, Viewport } from "next";
import { Playfair_Display, Manrope } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Stellora — Sterling & Artificial Jewellery, Hair Extensions, Vanity & Handbags",
    template: "%s · Stellora Admin",
  },
  description:
    "Stellora is a premium retail destination for sterling and artificial jewellery, hair extensions, vanity essentials and handbags.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#150d11" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${playfair.variable} ${manrope.variable} min-h-screen flex flex-col`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          {/* Premium toast shell — cards come from ui/notify.tsx */}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
