import { getAuthTokens, getGroups, getRoutes } from "@/src/db";

export const dynamic = "force-dynamic";

const table: React.CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
  fontSize: "0.875rem",
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "0.5rem 0.75rem",
  borderBottom: "2px solid #e5e7eb",
  fontWeight: 600,
};

const td: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  borderBottom: "1px solid #f3f4f6",
};

const mono: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: "0.8rem",
};

const section: React.CSSProperties = {
  marginBottom: "2rem",
};

const badge: React.CSSProperties = {
  display: "inline-block",
  padding: "0.125rem 0.5rem",
  borderRadius: "9999px",
  fontSize: "0.75rem",
  fontWeight: 500,
};

const groupBadge: React.CSSProperties = {
  ...badge,
  backgroundColor: "#dbeafe",
  color: "#1e40af",
};

const streamBadge: React.CSSProperties = {
  ...badge,
  backgroundColor: "#fef3c7",
  color: "#92400e",
};

export default async function ConfigPage() {
  const [authTokens, groups, routes] = await Promise.all([
    getAuthTokens(),
    getGroups(),
    getRoutes(),
  ]);

  return (
    <main style={{ maxWidth: "56rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "2rem" }}>
        Database Configuration
      </h1>

      <div style={section}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Auth Tokens
        </h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Token</th>
            </tr>
          </thead>
          <tbody>
            {authTokens.map((t) => (
              <tr key={t.name}>
                <td style={td}>{t.name}</td>
                <td style={{ ...td, ...mono }}>{t.tokenPreview}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={section}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Groups
        </h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Slashwork ID</th>
              <th style={th}>Auth Token</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.name}>
                <td style={td}>{g.name}</td>
                <td style={{ ...td, ...mono }}>{g.slashworkId}</td>
                <td style={td}>{g.authToken}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={section}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          Routes
        </h2>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Type</th>
              <th style={th}>Target</th>
              <th style={th}>Auth Token</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((r) => (
              <tr key={r.name}>
                <td style={{ ...td, ...mono }}>/github/{r.name}</td>
                <td style={td}>
                  {r.groupName ? (
                    <span style={groupBadge}>group</span>
                  ) : (
                    <span style={streamBadge}>stream</span>
                  )}
                </td>
                <td style={{ ...td, ...mono }}>
                  {r.groupName ?? r.streamId}
                </td>
                <td style={td}>
                  {r.groupName ? (
                    <span style={{ color: "#6b7280", fontStyle: "italic" }}>via group</span>
                  ) : (
                    r.authToken
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
