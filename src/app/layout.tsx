import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";
import { PwaRegister } from "@/components/pwa-register";

const manrope = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "СУНЦ Инфо — меню, расписание, дежурства и погода ФМШ",
  description:
    "Единый портал ученика СУНЦ НГУ (ФМШ): меню столовой на каждый день, расписание звонков и занятий, график дежурств, ночные вожатые, погода в Академгородке и новости школы.",
  keywords: ["СУНЦ НГУ", "ФМШ", "меню столовой", "расписание звонков", "расписание занятий", "дежурства", "ночные вожатые", "погода Академгородок", "новости"],
  applicationName: "СУНЦ Инфо",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "СУНЦ Инфо",
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "СУНЦ Инфо",
    title: "СУНЦ Инфо — портал ученика ФМШ",
    description: "Меню столовой, расписание, дежурства, вожатые, погода и новости СУНЦ НГУ в одном месте.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1917" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
        <Toaster />
        <PwaRegister />
      </body>
    </html>
  );
}
