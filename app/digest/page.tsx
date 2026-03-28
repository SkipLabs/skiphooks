import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { getAuthTokens, getDiscoveredGroups, getDigestConfig } from "@/src/db";
import { hasDatabase } from "@/src/lib/config";
import "./digest.css";

const DigestForm = nextDynamic(() => import("./digest-form"), { ssr: false });

export const dynamic = "force-dynamic";

async function DigestFormSection() {
  const dbAvailable = hasDatabase();
  const [authTokens, discoveredGroups, digestConfig] = dbAvailable
    ? await Promise.all([getAuthTokens(), getDiscoveredGroups(), getDigestConfig()])
    : [[], [], null];

  const groups = discoveredGroups
    .filter((g) => g.name.length > 0)
    .map((g) => ({ name: g.name, slashworkId: g.slashworkId }));

  return (
    <>
      {!dbAvailable && (
        <div className="dig-warning">
          Database not configured.
        </div>
      )}

      <DigestForm
        groups={groups}
        groupCount={groups.length}
        authTokenNames={authTokens.map((t) => t.name)}
        initialConfig={digestConfig ? {
          targetGroupId: digestConfig.targetGroupId,
          authToken: digestConfig.authToken,
          enabled: digestConfig.enabled,
          lastRunAt: digestConfig.lastRunAt?.toISOString() ?? null,
        } : null}
      />
    </>
  );
}

function FormSkeleton() {
  return (
    <div className="sw-skeleton" style={{ height: "12rem", borderRadius: "6px" }} />
  );
}

export default function DigestPage() {
  return (
    <div className="dig-page">
      <main className="dig-container">
        <div className="dig-header">
          <h1 className="dig-title">
            <span>skiphooks</span> / digest
          </h1>
          <span className="dig-subtitle">weekly cross-group summary</span>
        </div>

        <Suspense fallback={<FormSkeleton />}>
          <DigestFormSection />
        </Suspense>
      </main>
    </div>
  );
}
