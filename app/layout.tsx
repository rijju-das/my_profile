import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "Riju Das — Affective Computing & Computer Vision",
    description: "Researching how visual AI can recognise, describe and explain affective information.",
    openGraph: {
      title: "Riju Das — Affective Computing & Computer Vision",
      description: "An interactive portfolio in affective computing and computer vision.",
      type: "website",
      images: [{ url: new URL("/og.png", base).toString(), width: 1600, height: 900, alt: "Riju Das research portfolio" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Riju Das — Affective Computing & Computer Vision",
      description: "An interactive portfolio in affective computing and computer vision.",
      images: [new URL("/og.png", base).toString()],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
