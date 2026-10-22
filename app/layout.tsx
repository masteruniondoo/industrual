import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Industrial · Verifiable machines",
  description:
    "Industrial devices that verify Polkadot finality themselves, and research into proving process compliance with zero-knowledge proofs",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
