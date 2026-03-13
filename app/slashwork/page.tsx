import { getAuthTokens, getGroups, getRoutes, getCalendarUsers } from "@/src/db";
import "./slashwork.css";

export const dynamic = "force-dynamic";

export default async function SlashworkPage() {
  const [authTokens, groups, routes, calendarUsers] = await Promise.all([
    getAuthTokens(),
    getGroups(),
    getRoutes(),
    getCalendarUsers(),
  ]);

  return (
    <div className="sw-page">
      <main className="sw-container">
        <div className="sw-header">
          <h1 className="sw-title">
            <span>skiphooks</span> / slashwork
          </h1>
          <span className="sw-subtitle">database state</span>
        </div>

        <div className="sw-grid">
          {/* Auth Tokens */}
          <div className="sw-section">
            <div className="sw-section-header">
              <h2 className="sw-section-title">Auth Tokens</h2>
              <span className="sw-count">{authTokens.length}</span>
            </div>
            <table className="sw-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Token</th>
                </tr>
              </thead>
              <tbody>
                {authTokens.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="sw-empty">
                      No auth tokens configured
                    </td>
                  </tr>
                ) : (
                  authTokens.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className="sw-token">{t.tokenPreview}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Groups */}
          <div className="sw-section">
            <div className="sw-section-header">
              <h2 className="sw-section-title">Groups</h2>
              <span className="sw-count">{groups.length}</span>
            </div>
            <table className="sw-table">
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
                    <td colSpan={3} className="sw-empty">
                      No groups configured
                    </td>
                  </tr>
                ) : (
                  groups.map((g) => (
                    <tr key={g.name}>
                      <td>{g.name}</td>
                      <td className="sw-mono">{g.slashworkId}</td>
                      <td>{g.authToken}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Routes */}
          <div className="sw-section sw-section--wide">
            <div className="sw-section-header">
              <h2 className="sw-section-title">Routes</h2>
              <span className="sw-count">{routes.length}</span>
            </div>
            <table className="sw-table">
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
                    <td colSpan={4} className="sw-empty">
                      No routes configured
                    </td>
                  </tr>
                ) : (
                  routes.map((r) => (
                    <tr key={r.name}>
                      <td className="sw-path">/github/{r.name}</td>
                      <td>
                        {r.groupName ? (
                          <span className="sw-badge sw-badge--group">
                            group
                          </span>
                        ) : (
                          <span className="sw-badge sw-badge--stream">
                            stream
                          </span>
                        )}
                      </td>
                      <td className="sw-mono">{r.groupName ?? r.streamId}</td>
                      <td>
                        {r.groupName ? (
                          <span className="sw-muted">via group</span>
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
            <div className="sw-section sw-section--wide">
              <div className="sw-section-header">
                <h2 className="sw-section-title">Calendar Users</h2>
                <span className="sw-count">{calendarUsers.length}</span>
              </div>
              <table className="sw-table">
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
                      <td className="sw-mono">{u.calendarId}</td>
                      <td className="sw-mono">{u.targetId}</td>
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
