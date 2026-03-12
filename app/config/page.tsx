import { getAuthTokens, getGroups, getRoutes, getCalendarUsers } from "@/src/db";
import "./config.css";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const [authTokens, groups, routes, calendarUsers] = await Promise.all([
    getAuthTokens(),
    getGroups(),
    getRoutes(),
    getCalendarUsers(),
  ]);

  return (
    <div className="cfg-page">
      <main className="cfg-container">
        <div className="cfg-header">
          <h1 className="cfg-title">
            <span>skiphooks</span> / config
          </h1>
          <span className="cfg-subtitle">database state</span>
        </div>

        <div className="cfg-grid">
          {/* Auth Tokens */}
          <div className="cfg-section">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Auth Tokens</h2>
              <span className="cfg-count">{authTokens.length}</span>
            </div>
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {authTokens.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="cfg-empty">
                      No auth tokens configured
                    </td>
                  </tr>
                ) : (
                  authTokens.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className="cfg-token">{t.tokenPreview}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Groups */}
          <div className="cfg-section">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Groups</h2>
              <span className="cfg-count">{groups.length}</span>
            </div>
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slashwork ID</th>
                  <th>Auth Token</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="cfg-empty">
                      No groups configured
                    </td>
                  </tr>
                ) : (
                  groups.map((g) => (
                    <tr key={g.name}>
                      <td>{g.name}</td>
                      <td className="cfg-mono">{g.slashworkId}</td>
                      <td>{g.authToken}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Routes */}
          <div className="cfg-section cfg-section--wide">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Routes</h2>
              <span className="cfg-count">{routes.length}</span>
            </div>
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th>Type</th>
                  <th>Target</th>
                  <th>Auth Token</th>
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="cfg-empty">
                      No routes configured
                    </td>
                  </tr>
                ) : (
                  routes.map((r) => (
                    <tr key={r.name}>
                      <td className="cfg-path">/github/{r.name}</td>
                      <td>
                        {r.groupName ? (
                          <span className="cfg-badge cfg-badge--group">
                            group
                          </span>
                        ) : (
                          <span className="cfg-badge cfg-badge--stream">
                            stream
                          </span>
                        )}
                      </td>
                      <td className="cfg-mono">{r.groupName ?? r.streamId}</td>
                      <td>
                        {r.groupName ? (
                          <span className="cfg-muted">via group</span>
                        ) : (
                          r.authToken
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Calendar Users */}
          {calendarUsers.length > 0 && (
            <div className="cfg-section cfg-section--wide">
              <div className="cfg-section-header">
                <h2 className="cfg-section-title">Calendar Users</h2>
                <span className="cfg-count">{calendarUsers.length}</span>
              </div>
              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Calendar ID</th>
                    <th>Target ID</th>
                  </tr>
                </thead>
                <tbody>
                  {calendarUsers.map((u) => (
                    <tr key={u.name}>
                      <td>{u.name}</td>
                      <td className="cfg-mono">{u.calendarId}</td>
                      <td className="cfg-mono">{u.targetId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
