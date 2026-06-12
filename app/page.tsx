import Link from "next/link";
import "./home.css";

export default function Home() {
  return (
    <main className="home">
      <div className="home-hero">
        <div className="home-logo">S{"}"}</div>
        <h1 className="home-title">Skiphooks</h1>
        <p className="home-subtitle">GitHub webhooks, AI summaries, and more for Slashwork</p>
      </div>

      <nav className="home-links">
        <Link href="/slashwork" className="home-link">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6.5 1.5h3l.5 2.1 1.8.7 1.9-1.1 2.1 2.1-1.1 1.9.7 1.8 2.1.5v3l-2.1.5-.7 1.8 1.1 1.9-2.1 2.1-1.9-1.1-1.8.7-.5 2.1h-3l-.5-2.1-1.8-.7-1.9 1.1-2.1-2.1 1.1-1.9-.7-1.8L.5 9.5v-3l2.1-.5.7-1.8-1.1-1.9 2.1-2.1 1.9 1.1 1.8-.7z" />
            <circle cx="8" cy="8" r="2.5" />
          </svg>
          Slashwork
        </Link>
        <Link href="/summary" className="home-link">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h10M3 6.5h7M3 10h10M3 13.5h5" />
          </svg>
          Weekly Summary
        </Link>
        <Link href="/digest" className="home-link">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <path d="M5 5.5h6M5 8h4M5 10.5h5" />
          </svg>
          Weekly Digest
        </Link>
      </nav>
    </main>
  );
}
