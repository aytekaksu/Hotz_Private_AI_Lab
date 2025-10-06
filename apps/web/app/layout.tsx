import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Assistant",
  description: "Private AI assistant with Google Calendar, Tasks, and Notion integration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}


