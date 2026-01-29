import type { Metadata } from "next";

import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Corin Meeting Archive",
  description: "Personal meeting archive with transcripts, summaries, and Q&A."
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="/runtime-env.js"></script>
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
