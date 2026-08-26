import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ALPHA HUB",
  description: "ALPHA case management hub"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
