import { getGroups, getAuthTokens, getDiscoveredGroups } from "@/src/db";
import { hasDatabase } from "@/src/lib/config";
import SummaryForm from "./summary-form";
import "./summary.css";

export const dynamic = "force-dynamic";

export default async function SummaryPage() {
  const dbAvailable = hasDatabase();
  const [groups, authTokens, discoveredGroups] = dbAvailable
    ? await Promise.all([getGroups(), getAuthTokens(), getDiscoveredGroups()])
    : [[], [], []];

  // Use discovered groups for the dropdown, filtering out unnamed ones
  const allGroups = discoveredGroups
    .filter((g) => g.name.length > 0)
    .map((g) => ({ name: g.name, slashworkId: g.slashworkId }));

  return (
    <div className="sum-page">
      <main className="sum-container">
        <div className="sum-header">
          <h1 className="sum-title">
            <span>skiphooks</span> / summary
          </h1>
          <span className="sum-subtitle">weekly digest</span>
        </div>

        {!dbAvailable && (
          <div className="sum-warning">
            Database not configured. Cannot load groups.
          </div>
        )}

        <SummaryForm
          groups={allGroups}
          configuredGroups={groups.map((g) => g.name)}
          authTokenNames={authTokens.map((t) => t.name)}
        />
      </main>
    </div>
  );
}
