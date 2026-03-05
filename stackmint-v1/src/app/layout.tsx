import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, IBM_Plex_Mono } from "next/font/google";
//import { Analytics } from "@vercel/analytics/next";
//import { FilePreviewer } from "@/components/file-previewer";
//import { SupabaseProvider } from "./providers/supabase-provider";
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Stackmint - sustainability compliance software",
  description: " A Marvis Inc Product",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${inter.variable} ${ibmPlexMono.variable} font-sans antialiased`}>
          <main className="p-4">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
