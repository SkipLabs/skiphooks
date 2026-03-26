"use client";

import { useState } from "react";

interface AdminActionsProps {
  authTokenNames: string[];
  groupNames: string[];
}

export default function AdminActions({ authTokenNames, groupNames }: AdminActionsProps) {
  // Add token state
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [tokenStatus, setTokenStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [tokenSubmitting, setTokenSubmitting] = useState(false);

  // Add route state
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeType, setRouteType] = useState<"group" | "stream">("group");
  const [routeGroupName, setRouteGroupName] = useState(groupNames[0] ?? "");
  const [routeStreamId, setRouteStreamId] = useState("");
  const [routeAuthToken, setRouteAuthToken] = useState(authTokenNames[0] ?? "");
  const [routeStatus, setRouteStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [routeSubmitting, setRouteSubmitting] = useState(false);

  // Test connection state
  const [testToken, setTestToken] = useState(authTokenNames[0] ?? "");
  const [testStatus, setTestStatus] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleAddToken(e: React.FormEvent) {
    e.preventDefault();
    setTokenSubmitting(true);
    setTokenStatus(null);
    try {
      const res = await fetch("/api/admin/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: tokenName, token: tokenValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTokenStatus({ type: "ok", msg: "Token added — reloading..." });
      setTokenName("");
      setTokenValue("");
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      setTokenStatus({ type: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTokenSubmitting(false);
    }
  }

  async function handleAddRoute(e: React.FormEvent) {
    e.preventDefault();
    setRouteSubmitting(true);
    setRouteStatus(null);
    try {
      const body: Record<string, string> = { name: routeName };
      if (routeType === "group") {
        body.groupName = routeGroupName;
      } else {
        body.streamId = routeStreamId;
        body.authToken = routeAuthToken;
      }
      const res = await fetch("/api/admin/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRouteStatus({ type: "ok", msg: "Route added — reloading..." });
      setRouteName("");
      setTimeout(() => location.reload(), 1000);
    } catch (err) {
      setRouteStatus({ type: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setRouteSubmitting(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestStatus(null);
    try {
      const res = await fetch("/api/admin/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authTokenName: testToken }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestStatus({ type: "ok", msg: "Connection successful" });
      } else {
        setTestStatus({ type: "err", msg: data.message || "Connection failed" });
      }
    } catch (err) {
      setTestStatus({ type: "err", msg: err instanceof Error ? err.message : String(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="sw-admin">
      {/* Test Connection */}
      <div className="sw-admin-section">
        <div className="sw-admin-row">
          <select
            className="sw-admin-select"
            value={testToken}
            onChange={(e) => setTestToken(e.target.value)}
            aria-label="Token to test"
          >
            {authTokenNames.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button
            className="sw-admin-btn sw-admin-btn--primary"
            onClick={handleTestConnection}
            disabled={testing || authTokenNames.length === 0}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testStatus && (
            <span className={`sw-admin-inline-status sw-admin-inline-status--${testStatus.type}`}>
              {testStatus.msg}
            </span>
          )}
        </div>
      </div>

      {/* Add Token */}
      <div className="sw-admin-section">
        {!showTokenForm ? (
          <button className="sw-admin-btn sw-admin-btn--outline" onClick={() => setShowTokenForm(true)}>
            + Add Token
          </button>
        ) : (
          <form onSubmit={handleAddToken} className="sw-admin-form">
            <div className="sw-admin-row">
              <input
                className="sw-admin-input"
                placeholder="Token name"
                value={tokenName}
                onChange={(e) => setTokenName(e.target.value)}
                required
                aria-label="Token name"
              />
              <input
                className="sw-admin-input sw-admin-input--wide"
                placeholder="Token value"
                type="password"
                value={tokenValue}
                onChange={(e) => setTokenValue(e.target.value)}
                required
                aria-label="Token value"
              />
              <button className="sw-admin-btn sw-admin-btn--primary" disabled={tokenSubmitting} type="submit">
                {tokenSubmitting ? "Adding..." : "Add"}
              </button>
              <button className="sw-admin-btn sw-admin-btn--ghost" type="button" onClick={() => { setShowTokenForm(false); setTokenStatus(null); }}>
                Cancel
              </button>
            </div>
            {tokenStatus && (
              <div className={`sw-admin-status sw-admin-status--${tokenStatus.type}`}>
                {tokenStatus.msg}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Add Route */}
      <div className="sw-admin-section">
        {!showRouteForm ? (
          <button className="sw-admin-btn sw-admin-btn--outline" onClick={() => setShowRouteForm(true)}>
            + Add Route
          </button>
        ) : (
          <form onSubmit={handleAddRoute} className="sw-admin-form">
            <div className="sw-admin-row">
              <input
                className="sw-admin-input"
                placeholder="Route name (e.g. my-repo)"
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                required
                aria-label="Route name"
              />
              <select
                className="sw-admin-select"
                value={routeType}
                onChange={(e) => setRouteType(e.target.value as "group" | "stream")}
                aria-label="Route type"
              >
                <option value="group">Group-based</option>
                <option value="stream">Stream-based</option>
              </select>
            </div>
            <div className="sw-admin-row">
              {routeType === "group" ? (
                <select
                  className="sw-admin-select"
                  value={routeGroupName}
                  onChange={(e) => setRouteGroupName(e.target.value)}
                  aria-label="Target group"
                >
                  {groupNames.length === 0 && <option value="">No groups configured</option>}
                  {groupNames.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    className="sw-admin-input"
                    placeholder="Stream ID"
                    value={routeStreamId}
                    onChange={(e) => setRouteStreamId(e.target.value)}
                    required
                    aria-label="Stream ID"
                  />
                  <select
                    className="sw-admin-select"
                    value={routeAuthToken}
                    onChange={(e) => setRouteAuthToken(e.target.value)}
                    aria-label="Auth token"
                  >
                    {authTokenNames.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </>
              )}
              <button className="sw-admin-btn sw-admin-btn--primary" disabled={routeSubmitting} type="submit">
                {routeSubmitting ? "Adding..." : "Add"}
              </button>
              <button className="sw-admin-btn sw-admin-btn--ghost" type="button" onClick={() => { setShowRouteForm(false); setRouteStatus(null); }}>
                Cancel
              </button>
            </div>
            {routeStatus && (
              <div className={`sw-admin-status sw-admin-status--${routeStatus.type}`}>
                {routeStatus.msg}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

// Standalone delete button components
export function DeleteButton({ endpoint, name, label }: { endpoint: string; name: string; label: string }) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete ${label} "${name}"?`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Delete failed");
        return;
      }
      location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <button
      className="sw-delete-btn"
      onClick={handleDelete}
      disabled={deleting}
      title={`Delete ${label} "${name}"`}
      aria-label={`Delete ${label} ${name}`}
    >
      {deleting ? "..." : "x"}
    </button>
  );
}
