import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCallerUser } from "@/lib/auth";
import { getShellCountsForCaller } from "@/lib/repositories/test-run";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Signed-out visitors (e.g. /sign-in) get zero counts — AppShell's own
  // SHELL_LESS_ROUTES check skips rendering the chrome for those routes entirely, but the
  // counts still need a value to pass down since this layout wraps every route including
  // that one.
  const callerUser = await getCallerUser(await headers());
  const counts = callerUser ? await getShellCountsForCaller(callerUser.id) : { liveRunCount: 0, pendingApprovalCount: 0 };

  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <QAForgeProvider>
          <AppShell
            liveRunCount={counts.liveRunCount}
            pendingApprovalCount={counts.pendingApprovalCount}
            user={callerUser ? { name: callerUser.name, email: callerUser.email } : undefined}
          >
            {children}
          </AppShell>
        </QAForgeProvider>
      </body>
    </html>
  );
}
