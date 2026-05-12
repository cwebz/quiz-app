import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { Topbar } from "@/components/Topbar";
import "./globals.css";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Smarter Than The Internet",
  description: "Daily 5-question trivia quiz with comparison-based scoring.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Enables `env(safe-area-inset-*)` so we can dodge the iOS notch/home indicator.
  viewportFit: "cover",
  // Match the lavender background so iOS tints its status bar to blend in.
  themeColor: "#F4F1FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable}`}
      data-theme="lavender"
    >
      <body>
        <div className="app">
          <Topbar />
          <main className="page">{children}</main>
        </div>
      </body>
    </html>
  );
}
