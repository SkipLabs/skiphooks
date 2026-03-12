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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
