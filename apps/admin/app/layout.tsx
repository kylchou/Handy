import type { Metadata } from "next";
import { Atkinson_Hyperlegible } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-atkinson" });

export const metadata: Metadata = {
  title: "Handy Admin",
  description: "Keep an eye on requests, jobs, and workers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={atkinson.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
