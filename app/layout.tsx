import { ClerkProvider } from "@clerk/nextjs";
import NavMenu from "./components/nav-menu";
import "./globals.css";

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
      <html lang="en">
        <body style={{ margin: 0, background: "#0c0c0e" }}>
          <NavMenu />
          <div className="nav-main">{children}</div>
        </body>
      </html>
    </ClerkProvider>
  );
}
