import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Industrial · Live monitoring",
  description: "Industrial sensor monitoring over Polkadot Statement Store",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
