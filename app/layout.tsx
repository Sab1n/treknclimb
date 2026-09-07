import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  Instrument_Sans,
  IBM_Plex_Mono,
} from "next/font/google";
import "./globals.css";

// Headlines only, 800 weight. Variable font, so one file covers every weight.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

// Body, UI, buttons, labels.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

// Prices, altitudes and metrics only. Not a variable font, so weights are
// listed explicitly — each one is a separate file to download.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://treknclimb.com"),
  title: {
    default:
      "Trek & Climb Adventure — Trekking and Peak Climbing in Nepal, India, Tibet and Bhutan",
    template: "%s | Trek & Climb Adventure",
  },
  description:
    "Guided treks, peak climbs and cultural journeys across Nepal, India, Tibet and Bhutan, run from Pokhara. Send your dates and get a day-by-day itinerary and a final price.",
  openGraph: {
    siteName: "Trek & Climb Adventure",
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${instrumentSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
