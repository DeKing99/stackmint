import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
//import { FilePreviewer } from "@/components/file-previewer";
//import { SupabaseProvider } from "./providers/supabase-provider";

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
        <body className="font-sans">
          <main className="p-4">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
