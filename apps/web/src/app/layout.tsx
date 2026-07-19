import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airline Points Search",
  description: "Find the best award availability across loyalty programs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <a href="/" className="brand">
            Airline Points Search
          </a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
