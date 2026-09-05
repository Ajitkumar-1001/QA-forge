import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { QAForgeProvider } from "@/components/qaforge/provider";
import { AppShell } from "@/components/qaforge/app-shell";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QAForge",
  description: "Autonomous QA + debugging agent console, Built by Ajitkumar Senthil Kumar - https://www.ajitkumar.io",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QAForgeProvider>
          <AppShell>{children}</AppShell>
        </QAForgeProvider>
      </body>
    </html>
  );
}
