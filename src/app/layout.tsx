import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";

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
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
      </body>
    </html>
  );
}
