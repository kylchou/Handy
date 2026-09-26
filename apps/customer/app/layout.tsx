import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

// Loaded through next/font so it's self-hosted and always applied
// (a CSS @import after the Tailwind directives gets ignored by browsers).
const atkinson = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-atkinson",
});

export const metadata: Metadata = {
  title: "Handy",
  description: "Get everyday help, just by asking.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="min-h-screen bg-warm-fade text-ink">{children}</body>
    </html>
  );
}
