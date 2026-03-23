import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "TAK Situational Demo — Command Vehicle",
  description: "MongoDB + Ditto tactical edge demo — command vehicle situational awareness dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
