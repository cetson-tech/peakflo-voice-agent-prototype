import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peakflo Voice Agent",
  description: "Peakflo Voice Agent - AI-Powered Conversational Voice Assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
