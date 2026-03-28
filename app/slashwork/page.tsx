import { Suspense } from "react";
import { getAuthTokens, getGroups, getRoutes, getCalendarUsers, getDiscoveredGroups } from "@/src/db";
import AdminActions from "./admin-actions";
import AuthTokensLive from "./auth-tokens-live";
import GroupsLive from "./groups-live";
import RoutesLive from "./routes-live";
import DiscoveredGroupsLive from "./discovered-groups-live";
import "./slashwork.css";

export const dynamic = "force-dynamic";

async function AdminSection() {
  const [authTokens, groups] = await Promise.all([getAuthTokens(), getGroups()]);
  return (
    <AdminActions
      authTokenNames={authTokens.map((t) => t.name)}
      groupNames={groups.map((g) => g.name)}
    />
  );
}

async function AuthTokensSection() {
  const authTokens = await getAuthTokens();
  return (
    <AuthTokensLive
      initialTokens={authTokens.map((t) => ({
        name: t.name,
        tokenPreview: t.tokenPreview,
      }))}
    />
  );
}

async function GroupsSection() {
  const groups = await getGroups();
  return (
    <GroupsLive
      initialGroups={groups.map((g) => ({
        name: g.name,
        slashworkId: g.slashworkId,
        authToken: g.authToken,
      }))}
    />
  );
}

async function RoutesSection() {
  const routes = await getRoutes();
  return (
    <RoutesLive
      initialRoutes={routes.map((r) => ({
        name: r.name,
        groupName: r.groupName,
        streamId: r.streamId,
        authToken: r.authToken,
      }))}
    />
  );
}

async function CalendarSection() {
  const calendarUsers = await getCalendarUsers();
  if (calendarUsers.length === 0) return null;
  return (
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
  );
}

async function DiscoveredGroupsSection() {
  const [discoveredGroups, groups] = await Promise.all([
    getDiscoveredGroups(),
    getGroups(),
  ]);
  return (
    <DiscoveredGroupsLive
      initialGroups={discoveredGroups.map((g) => ({
        slashworkId: g.slashworkId,
        name: g.name,
        discoveredAt: g.discoveredAt.toISOString(),
        lastSeenAt: g.lastSeenAt.toISOString(),
      }))}
      configuredGroupIds={groups.map((g) => g.slashworkId)}
    />
  );
}

function SectionSkeleton() {
  return (
    <div className="sw-section">
      <div className="sw-section-header">
        <div className="sw-skeleton sw-skeleton--title" />
      </div>
      <div className="sw-skeleton sw-skeleton--table" />
    </div>
  );
}

function WideSectionSkeleton() {
  return (
    <div className="sw-section sw-section--wide">
      <div className="sw-section-header">
        <div className="sw-skeleton sw-skeleton--title" />
      </div>
      <div className="sw-skeleton sw-skeleton--table" />
    </div>
  );
}

export default function SlashworkPage() {
  return (
    <div className="sw-page">
      <main className="sw-container">
        <div className="sw-header">
          <h1 className="sw-title">
            <span>skiphooks</span> / slashwork
          </h1>
          <span className="sw-subtitle">database state</span>
        </div>

        <Suspense fallback={<div className="sw-skeleton sw-skeleton--admin" />}>
          <AdminSection />
        </Suspense>

        <div className="sw-grid">
          <Suspense fallback={<SectionSkeleton />}>
            <AuthTokensSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton />}>
            <GroupsSection />
          </Suspense>

          <Suspense fallback={<SectionSkeleton />}>
            <RoutesSection />
          </Suspense>

          <Suspense fallback={<WideSectionSkeleton />}>
            <CalendarSection />
          </Suspense>

          <Suspense fallback={<WideSectionSkeleton />}>
            <DiscoveredGroupsSection />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
