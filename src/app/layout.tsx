import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AnimatedToastHost } from "@/components/toast/animated-toast-host";
import { THEME_SCRIPT } from "@/lib/theme-script";

// Dialog type system: Inter for body/UI and display headings (the Bevel
// display classes all resolve to the same system+Inter stack — one font,
// zero dead font downloads).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Recruitment Management Information System (RMIS)",
  description:
    "Recruitment Management Information System of the Metals Industry Research and Development Center (DOST-MIRDC). Browse positions, apply online, and track your application.",
  icons: { icon: "/MIRDC-mark.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased bg-background text-foreground`}>
        {/* Pre-paint theme: applies the saved .dark class BEFORE the first
            frame so a dark choice never flashes light on reload (Task 35). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
        <AnimatedToastHost />
      </body>
    </html>
  );
}
