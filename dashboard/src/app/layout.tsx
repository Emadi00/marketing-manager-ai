import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { readPipeline, readIdeas } from "@/lib/data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Videocraft Studio",
  description: "Dashboard di gestione — Videocraft Studio",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { cards } = readPipeline();
  const { clients: ideaClients } = readIdeas();

  const reviewBadge = cards.filter((c) => c.status === "In Approvazione").length;
  const ideasBadge  = ideaClients.reduce(
    (s, c) => s + c.reels.length + c.posts.length + c.carousels.length,
    0
  );

  return (
    <html
      lang="it"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="h-full flex bg-background text-foreground" suppressHydrationWarning>
        <TooltipProvider>
          <Sidebar reviewBadge={reviewBadge} ideasBadge={ideasBadge} />
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </TooltipProvider>
      </body>
    </html>
  );
}
