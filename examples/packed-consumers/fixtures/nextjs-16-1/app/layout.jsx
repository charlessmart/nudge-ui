import "./styles.css";

export const metadata = {
  title: "Packed Next.js 16.1 consumer",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
