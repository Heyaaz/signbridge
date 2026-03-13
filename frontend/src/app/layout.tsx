import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignBridge",
  description: "Accessible communication platform skeleton"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

