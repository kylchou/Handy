import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: "Handy for Workers",
  description: "Find and do nearby jobs helping older adults.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
