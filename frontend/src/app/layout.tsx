import "./globals.css";
import Link from "next/link";
import NotificationBell from "@/components/NotificationBell";

export const metadata = {
  title: "Nettle Basic",
  description: "Risk engineering platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <nav className="bg-zinc-900 border-b border-zinc-800 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-8">
            <Link href="/" className="font-bold text-lg text-zinc-100">
              Nettle
            </Link>
            <div className="flex gap-6 text-sm">
              <Link
                href="/portfolio"
                className="text-zinc-400 hover:text-zinc-100"
              >
                Portfolio
              </Link>
              <Link
                href="/assessments"
                className="text-zinc-400 hover:text-zinc-100"
              >
                Assessments
              </Link>
              <Link
                href="/reports"
                className="text-zinc-400 hover:text-zinc-100"
              >
                Reports
              </Link>
              <Link
                href="/templates"
                className="text-zinc-400 hover:text-zinc-100"
              >
                Templates
              </Link>
              <Link
                href="/client-fields"
                className="text-zinc-400 hover:text-zinc-100"
              >
                Client Fields
              </Link>
            </div>
            <NotificationBell />
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
