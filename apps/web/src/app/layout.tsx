import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const font = Figtree({ subsets: ["latin"], variable: "--font-orbit", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Orbit", template: "%s · Orbit" },
  description: "Chat, calls and meetings for your team.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f3fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d17" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      afterSignOutUrl="/"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
      appearance={{ variables: { colorPrimary: "#5b4fe0", borderRadius: "0.9rem" } }}
    >
      <html lang="en" className={font.variable} suppressHydrationWarning>
        <body>
          <Providers>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
