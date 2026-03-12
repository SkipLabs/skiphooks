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
        <div className="nav-links">
          <Link href="/config" className="nav-link" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6.5 1.5h3l.5 2.1 1.8.7 1.9-1.1 2.1 2.1-1.1 1.9.7 1.8 2.1.5v3l-2.1.5-.7 1.8 1.1 1.9-2.1 2.1-1.9-1.1-1.8.7-.5 2.1h-3l-.5-2.1-1.8-.7-1.9 1.1-2.1-2.1 1.1-1.9-.7-1.8L.5 9.5v-3l2.1-.5.7-1.8-1.1-1.9 2.1-2.1 1.9 1.1 1.8-.7z" />
              <circle cx="8" cy="8" r="2.5" />
            </svg>
            Config
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
