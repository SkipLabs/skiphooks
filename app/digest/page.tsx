import { Suspense } from "react";
import nextDynamic from "next/dynamic";
import { getAuthTokens, getAuthToken, getDigestConfig } from "@/src/db";
import { fetchSlashworkGroups } from "@/src/slashwork-sync";
import "./digest.css";

const DigestForm = nextDynamic(() => import("./digest-form"));

export const dynamic = "force-dynamic";

async function DigestFormSection() {
  const dbAvailable = !!process.env.POSTGRESQL_ADDON_URI;
  const [authTokens, digestConfig] = dbAvailable
    ? await Promise.all([getAuthTokens(), getDigestConfig()])
    : [[], null];

  const graphqlUrl = process.env.SLASHWORK_GRAPHQL_URL;
  const firstTokenName = authTokens[0]?.name;
  const firstToken = firstTokenName ? await getAuthToken(firstTokenName) : null;
  const groups = graphqlUrl && firstToken
    ? await fetchSlashworkGroups({ graphqlUrl, authToken: firstToken }).catch(() => [])
    : [];

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
