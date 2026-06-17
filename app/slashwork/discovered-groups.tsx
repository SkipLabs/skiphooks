interface SlashworkGroup {
  slashworkId: string;
  name: string;
}

export default function DiscoveredGroups({
  groups,
  configuredGroupIds,
}: {
  groups: SlashworkGroup[];
  configuredGroupIds: string[];
}) {
  const configuredSet = new Set(configuredGroupIds);

  return (
    <div className="sw-section sw-section--wide">
      <div className="sw-section-header">
        <h2 className="sw-section-title">Slashwork Groups</h2>
        <span className="sw-count">{groups.length}</span>
      </div>
      <table className="sw-table" aria-label="Slashwork groups">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Slashwork ID</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={3} className="sw-empty">
                No groups found — check SLASHWORK_GRAPHQL_URL and auth token
              </td>
            </tr>
          ) : (
            groups.map((g) => (
              <tr key={g.slashworkId}>
                <td>{g.name}</td>
                <td className="sw-mono">{g.slashworkId}</td>
                <td>
                  {configuredSet.has(g.slashworkId) ? (
                    <span className="sw-badge sw-badge--group">configured</span>
                  ) : (
                    <span className="sw-badge sw-badge--stream">unlinked</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
