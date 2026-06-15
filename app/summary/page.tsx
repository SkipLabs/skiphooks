import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { getGroups, getAuthTokens, getDiscoveredGroups } from "@/src/db";
import { listOwnerRepos } from "@/src/github-utils";
import "./summary.css";

const SummaryForm = nextDynamic(() => import("./summary-form"));

export const dynamic = "force-dynamic";

async function SummaryFormSection() {
  const dbAvailable = !!process.env.POSTGRESQL_ADDON_URI;
  const [groups, authTokens, discoveredGroups] = dbAvailable
    ? await Promise.all([getGroups(), getAuthTokens(), getDiscoveredGroups()])
    : [[], [], []];

  const allGroups = discoveredGroups
    .filter((g) => g.name.length > 0)
    .map((g) => ({ name: g.name, slashworkId: g.slashworkId }));

  const githubOwner = process.env.GITHUB_OWNER;
  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepoNames = githubOwner
    ? await listOwnerRepos(githubOwner, githubToken).catch(() => [] as string[])
    : [];
  const repos = githubRepoNames.map((repo) => ({ slug: `${githubOwner}/${repo}` }));

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
        repos={repos}
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
