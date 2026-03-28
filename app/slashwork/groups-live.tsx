"use client";

import { useSkipStream } from "@/src/skip/skip-streams-provider";

interface DbGroup {
  name: string;
  slashwork_id: string;
  auth_token: string;
}

interface Group {
  name: string;
  slashworkId: string;
  authToken: string;
}

function dbToGroup(row: DbGroup): Group {
  return {
    name: row.name,
    slashworkId: row.slashwork_id,
    authToken: row.auth_token,
  };
}

export default function GroupsLive({
  initialGroups,
}: {
  initialGroups: Group[];
}) {
  const initialMap = new Map(
    initialGroups.map((g) => [g.name, {
      name: g.name,
      slashwork_id: g.slashworkId,
      auth_token: g.authToken,
    } as DbGroup]),
  );
  const { items, connected } = useSkipStream<DbGroup>(
    "groups",
    initialMap,
  );
  const groups = Array.from(items.values()).map(dbToGroup);

  return (
    <div className="sw-section">
      <div className="sw-section-header">
        <h2 className="sw-section-title">
          Groups
          {connected && (
            <span className="sw-badge sw-badge--group" style={{ marginLeft: "8px", fontSize: "0.7em" }}>
              live
            </span>
          )}
        </h2>
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
  );
}
