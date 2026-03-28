"use client";

import { useSkipStream } from "@/src/skip/skip-streams-provider";
import { DeleteButton } from "./admin-actions";

interface DbRoute {
  name: string;
  group_name: string | null;
  stream_id: string | null;
  auth_token: string | null;
}

interface Route {
  name: string;
  groupName: string | null;
  streamId: string | null;
  authToken: string | null;
}

function dbToRoute(row: DbRoute): Route {
  return {
    name: row.name,
    groupName: row.group_name,
    streamId: row.stream_id,
    authToken: row.auth_token,
  };
}

export default function RoutesLive({
  initialRoutes,
}: {
  initialRoutes: Route[];
}) {
  const initialMap = new Map(
    initialRoutes.map((r) => [r.name, {
      name: r.name,
      group_name: r.groupName,
      stream_id: r.streamId,
      auth_token: r.authToken,
    } as DbRoute]),
  );
  const { items, connected } = useSkipStream<DbRoute>(
    "routes",
    initialMap,
  );
  const routes = Array.from(items.values()).map(dbToRoute);

  return (
    <div className="sw-section sw-section--wide">
      <div className="sw-section-header">
        <h2 className="sw-section-title">
          Routes
          {connected && (
            <span className="sw-badge sw-badge--group" style={{ marginLeft: "8px", fontSize: "0.7em" }}>
              live
            </span>
          )}
        </h2>
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
                    <span className="sw-badge sw-badge--group">group</span>
                  ) : (
                    <span className="sw-badge sw-badge--stream">stream</span>
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
  );
}
