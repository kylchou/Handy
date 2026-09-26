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

// Applies saved display settings (lib/display.ts) before first paint. Kept tiny and inline on purpose.
const applyDisplayScript = `try{var d=JSON.parse(localStorage.getItem("handy_display")||"{}"),c=document.documentElement.classList;if(d.textSize==="LARGE")c.add("text-size-large");if(d.textSize==="LARGEST")c.add("text-size-largest");if(d.highContrast)c.add("pref-high-contrast")}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the script below adds display classes before React loads.
    <html lang="en" className={atkinson.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyDisplayScript }} />
      </head>
      <body className="min-h-screen bg-warm-fade text-ink">{children}</body>
    </html>
  );
}
