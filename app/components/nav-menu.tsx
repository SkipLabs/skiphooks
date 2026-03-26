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
      />

      <nav className={`nav-drawer${open ? " nav-drawer--open" : ""}`}>
        <Link href="/" className="nav-logo" onClick={() => setOpen(false)}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="28" height="28">
            <defs>
              <linearGradient id="nav-logo-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c4b5fd"/>
                <stop offset="100%" stopColor="#7c3aed"/>
              </linearGradient>
            </defs>
            <rect width="32" height="32" rx="6" fill="url(#nav-logo-g)"/>
            <text x="16" y="22" textAnchor="middle" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="14" fill="#0c0c0e">S&#125;</text>
          </svg>
          <span>skiphooks</span>
        </Link>

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
