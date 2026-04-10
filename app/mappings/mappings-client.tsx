"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UserMapping {
  githubUsername: string;
  slashworkUsername: string;
}

export default function MappingsClient({
  initialMappings,
}: {
  initialMappings: UserMapping[];
}) {
  const router = useRouter();
  const [githubUsername, setGithubUsername] = useState("");
  const [slashworkUsername, setSlashworkUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!githubUsername.trim() || !slashworkUsername.trim()) return;

    setSubmitting(true);
    setStatus(null);

    try {
      const res = await fetch("/api/admin/user-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUsername: githubUsername.trim(),
          slashworkUsername: slashworkUsername.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: "err", text: data.error ?? "Failed to add mapping" });
        return;
      }

      setGithubUsername("");
      setSlashworkUsername("");
      setStatus({ type: "ok", text: "Mapping added" });
      router.refresh();
    } catch (err) {
      setStatus({ type: "err", text: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(github: string) {
    try {
      const res = await fetch(
        `/api/admin/user-mappings?githubUsername=${encodeURIComponent(github)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: "err", text: data.error ?? "Failed to delete" });
        return;
      }
      setStatus({ type: "ok", text: "Mapping deleted" });
      router.refresh();
    } catch (err) {
      setStatus({ type: "err", text: String(err) });
    }
  }

  async function handleEditSave(github: string) {
    if (!editValue.trim()) {
      setEditingRow(null);
      return;
    }

    try {
      const res = await fetch("/api/admin/user-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          githubUsername: github,
          slashworkUsername: editValue.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: "err", text: data.error ?? "Failed to update" });
        return;
      }

      setStatus({ type: "ok", text: "Mapping updated" });
      setEditingRow(null);
      router.refresh();
    } catch (err) {
      setStatus({ type: "err", text: String(err) });
    }
  }

  return (
    <>
      <form className="map-form" onSubmit={handleAdd}>
        <input
          className="map-input"
          type="text"
          placeholder="GitHub username"
          value={githubUsername}
          onChange={(e) => setGithubUsername(e.target.value)}
          disabled={submitting}
        />
        <span className="map-arrow">→</span>
        <input
          className="map-input"
          type="text"
          placeholder="Slashwork username"
          value={slashworkUsername}
          onChange={(e) => setSlashworkUsername(e.target.value)}
          disabled={submitting}
        />
        <button className="map-btn" type="submit" disabled={submitting}>
          Add
        </button>
        {status && (
          <span className={`map-status map-status--${status.type}`}>{status.text}</span>
        )}
      </form>

      <div className="map-section">
        <div className="map-section-header">
          <h2 className="map-section-title">Mappings</h2>
          <span className="map-count">{initialMappings.length}</span>
        </div>

        {initialMappings.length === 0 ? (
          <div className="map-empty">No user mappings configured</div>
        ) : (
          <table className="map-table" aria-label="User mappings">
            <thead>
              <tr>
                <th scope="col">GitHub</th>
                <th scope="col" />
                <th scope="col">Slashwork</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {initialMappings.map((m) => (
                <tr key={m.githubUsername}>
                  <td className="map-mono">{m.githubUsername}</td>
                  <td className="map-arrow">→</td>
                  <td className="map-mono">
                    {editingRow === m.githubUsername ? (
                      <input
                        className="map-edit-input"
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleEditSave(m.githubUsername)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave(m.githubUsername);
                          if (e.key === "Escape") setEditingRow(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <span
                        style={{ cursor: "pointer" }}
                        title="Click to edit"
                        onClick={() => {
                          setEditingRow(m.githubUsername);
                          setEditValue(m.slashworkUsername);
                        }}
                      >
                        {m.slashworkUsername}
                      </span>
                    )}
                  </td>
                  <td>
                    <button
                      className="map-delete-btn"
                      onClick={() => handleDelete(m.githubUsername)}
                      title="Delete mapping"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
