import { themeInitScript } from "@culinova/ui";
import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--cn-font-display",
  display: "swap",
  axes: ["SOFT", "opsz"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--cn-font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Culinova", template: "%s · Culinova" },
  description: "De l'idée à l'assiette, avec l'IA.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6ef" },
    { media: "(prefers-color-scheme: dark)", color: "#13100e" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
