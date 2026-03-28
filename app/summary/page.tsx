import { Suspense } from "react";
import { getGroups, getAuthTokens, getDiscoveredGroups } from "@/src/db";
import { hasDatabase } from "@/src/lib/config";
import SummaryForm from "./summary-form";
import "./summary.css";

export const dynamic = "force-dynamic";

async function SummaryFormSection() {
  const dbAvailable = hasDatabase();
  const [groups, authTokens, discoveredGroups] = dbAvailable
    ? await Promise.all([getGroups(), getAuthTokens(), getDiscoveredGroups()])
    : [[], [], []];

  const allGroups = discoveredGroups
    .filter((g) => g.name.length > 0)
    .map((g) => ({ name: g.name, slashworkId: g.slashworkId }));

  return (
    <>
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
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="sw-skeleton" style={{ height: "12rem", borderRadius: "6px" }} />
  );
}

export default function SummaryPage() {
  return (
    <div className="sum-page">
      <main className="sum-container">
        <div className="sum-header">
          <h1 className="sum-title">
            <span>skiphooks</span> / summary
          </h1>
          <span className="sum-subtitle">weekly digest</span>
        </div>

        <Suspense fallback={<FormSkeleton />}>
          <SummaryFormSection />
        </Suspense>
      </main>
    </div>
  );
}
