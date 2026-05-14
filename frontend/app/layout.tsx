import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RNA Ladder Alignment",
  description:
    "Upload ladder data and theoretical sequences to run the RNA ladder alignment pipeline.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
