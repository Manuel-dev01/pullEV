import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PullEV — provably-fair gacha EV & fairness",
  description:
    "Expected-value verdicts and independent, client-side fairness verification for Renaiss Infinite Gacha packs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-neutral-950 text-neutral-100">
        {children}
        <footer className="mx-auto w-full max-w-5xl px-6 py-8 text-xs leading-relaxed text-neutral-600">
          <p>
            PullEV is an independent, unofficial tool built for the Renaiss Tech Hackathon. It is not
            affiliated with or endorsed by Renaiss. Pack data shown is mock/assumed unless badged
            OFFICIAL — never treat it as authoritative.
          </p>
          <p className="mt-2">
            Card names are shown for identification only. Pokémon and related marks are the property
            of their respective owners (The Pokémon Company / Nintendo). Card grades reference PSA/BGS.
          </p>
        </footer>
      </body>
    </html>
  );
}
