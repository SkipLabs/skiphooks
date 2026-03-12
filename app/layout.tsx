import { ClerkProvider, Show, UserButton, SignInButton } from "@clerk/nextjs";

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
          <header
            style={{
              display: "flex",
              justifyContent: "flex-end",
              padding: "0.75rem 1.5rem",
              position: "fixed",
              top: 0,
              right: 0,
              zIndex: 10,
            }}
          >
            <Show when="signed-out">
              <SignInButton />
            </Show>
            <Show when="signed-in">
              <UserButton />
            </Show>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
