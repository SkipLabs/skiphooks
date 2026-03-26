"use client";

import { useState } from "react";
import Link from "next/link";
import { Show, UserButton, SignInButton } from "@clerk/nextjs";
import "./nav-menu.css";

export default function NavMenu() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={`nav-burger${open ? " nav-burger--open" : ""}`}
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
      >
        <div className="nav-burger-icon">
          <span />
          <span />
          <span />
        </div>
      </button>

      <div
        className={`nav-backdrop${open ? " nav-backdrop--visible" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <nav className={`nav-drawer${open ? " nav-drawer--open" : ""}`}>
        <div
          style={{
            padding: "20px 20px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid var(--cfg-border)",
          }}
        >
          <Link
            href="/"
            onClick={() => setOpen(false)}
            style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
          >
            <div
              className="nav-logo-icon"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "linear-gradient(135deg, #c4b5fd 0%, #7c3aed 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#0c0c0e",
                fontFamily: "var(--cfg-mono)",
                letterSpacing: "-0.05em",
              }}
            >
              S{"}"}
            </div>
            <span
              style={{
                fontFamily: "var(--cfg-mono)",
                fontSize: 18,
                fontWeight: 600,
                color: "var(--cfg-text)",
                letterSpacing: "-0.02em",
              }}
            >
              Skiphooks
            </span>
          </Link>
        </div>

        <div className="nav-links">
          <Link href="/slashwork" className="nav-link" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 1.5h3l.5 2.1 1.8.7 1.9-1.1 2.1 2.1-1.1 1.9.7 1.8 2.1.5v3l-2.1.5-.7 1.8 1.1 1.9-2.1 2.1-1.9-1.1-1.8.7-.5 2.1h-3l-.5-2.1-1.8-.7-1.9 1.1-2.1-2.1 1.1-1.9-.7-1.8L.5 9.5v-3l2.1-.5.7-1.8-1.1-1.9 2.1-2.1 1.9 1.1 1.8-.7z" />
              <circle cx="8" cy="8" r="2.5" />
            </svg>
            Slashwork
          </Link>
          <Link href="/summary" className="nav-link" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h10M3 6.5h7M3 10h10M3 13.5h5" />
            </svg>
            Weekly Summary
          </Link>
          <Link href="/digest" className="nav-link" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="2" />
              <path d="M5 5.5h6M5 8h4M5 10.5h5" />
            </svg>
            Weekly Digest
          </Link>
          <Link href="/scout" className="nav-link" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7" cy="7" r="5.5" />
              <path d="M11.5 11.5 15 15" />
            </svg>
            Reddit Scout
          </Link>
        </div>

        <div className="nav-divider" />

        <div className="nav-auth">
          <Show when="signed-out">
            <SignInButton />
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </nav>
    </>
  );
}
