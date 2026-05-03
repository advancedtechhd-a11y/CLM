import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LifecycleAI",
  description: "AI + ML customer lifecycle management for e-commerce, SaaS, and course creators.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
