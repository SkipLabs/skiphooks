import { getAuthTokens, getGroups, getRoutes, getCalendarUsers, getDiscoveredGroups } from "@/src/db";
import AdminActions, { DeleteButton } from "./admin-actions";
import DiscoveredGroupsLive from "./discovered-groups-live";
import "./slashwork.css";

export const dynamic = "force-dynamic";

export default async function SlashworkPage() {
  const [authTokens, groups, routes, calendarUsers, discoveredGroups] = await Promise.all([
    getAuthTokens(),
    getGroups(),
    getRoutes(),
    getCalendarUsers(),
    getDiscoveredGroups(),
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

        {/* Admin actions */}
        <AdminActions
          authTokenNames={authTokens.map((t) => t.name)}
          groupNames={groups.map((g) => g.name)}
        />

        <div className="sw-grid">
          {/* Auth Tokens */}
          <div className="sw-section">
            <div className="sw-section-header">
              <h2 className="sw-section-title">Auth Tokens</h2>
              <span className="sw-count">{authTokens.length}</span>
            </div>
            <table className="sw-table" aria-label="Auth tokens">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Token</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {authTokens.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="sw-empty">
                      No auth tokens configured
                    </td>
                  </tr>
                ) : (
                  authTokens.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td className="sw-token">{t.tokenPreview}</td>
                      <td className="sw-actions">
                        <DeleteButton endpoint="/api/admin/tokens" name={t.name} label="token" />
                      </td>
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
            <table className="sw-table" aria-label="Configured groups">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Slashwork ID</th>
                  <th scope="col">Auth Token</th>
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
            <table className="sw-table" aria-label="Webhook routes">
              <thead>
                <tr>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Type</th>
                  <th scope="col">Target</th>
                  <th scope="col">Auth Token</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="sw-empty">
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
                      <td className="sw-actions">
                        <DeleteButton endpoint="/api/admin/routes" name={r.name} label="route" />
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
              <table className="sw-table" aria-label="Calendar users">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Calendar ID</th>
                    <th scope="col">Target ID</th>
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
          {/* Discovered Slashwork Groups (live-streamed via Skip) */}
          <DiscoveredGroupsLive
            initialGroups={discoveredGroups.map((g) => ({
              slashworkId: g.slashworkId,
              name: g.name,
              discoveredAt: g.discoveredAt.toISOString(),
              lastSeenAt: g.lastSeenAt.toISOString(),
            }))}
            configuredGroupIds={groups.map((g) => g.slashworkId)}
          />
        </div>
      </main>
    </div>
  );
}
