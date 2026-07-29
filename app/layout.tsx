import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const metadataBase = host ? new URL(`${protocol}://${host}`) : undefined;

  return {
    metadataBase,
    title: {
      default: "Seed Journal",
      template: "%s · Seed Journal",
    },
    description:
      "A private reflection ritual that nurtures a living sakura tree.",
    applicationName: "Seed Journal",
    openGraph: {
      title: "Seed Journal",
      description: "Nurture what grows within.",
      type: "website",
      images: metadataBase ? [{ url: new URL("/og.png", metadataBase) }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: "Seed Journal",
      description: "Nurture what grows within.",
      images: metadataBase ? [new URL("/og.png", metadataBase)] : [],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${newsreader.variable}`}>
        {children}
      </body>
    </html>
  );
}
