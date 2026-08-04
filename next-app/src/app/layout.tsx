import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { BRAND } from "@/lib/branding";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "INLAY",
  title: {
    default: "INLAY",
    template: "%s | INLAY",
  },
  description: "Secure creative review, approval, payment, and file delivery.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col antialiased">{children}</body>
    </html>
  );
}
