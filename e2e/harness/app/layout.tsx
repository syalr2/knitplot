import "../../../app/globals.css";
import { knitplotFonts } from "../../../app/fonts";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={knitplotFonts}>
      <body>{children}</body>
    </html>
  );
}
