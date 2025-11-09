import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Assistant",
  description: "Private AI assistant with Google Calendar, Tasks, and Notion integration",
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
