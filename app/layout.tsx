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
        <body>
          <header style={{ display: "flex", justifyContent: "flex-end", padding: "1rem" }}>
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
