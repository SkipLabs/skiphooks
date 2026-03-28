import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import NavMenu from "./components/nav-menu";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata = {
  title: "Skiphooks",
  description: "GitHub webhook server for Slashwork",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en" className={inter.variable}>
        <body style={{ margin: 0, background: "#0c0c0e" }}>
          <NavMenu />
          <div className="nav-main">{children}</div>
        </body>
      </html>
    </ClerkProvider>
  );
}
