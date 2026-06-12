import nextDynamic from "next/dynamic";
import { getAuthTokens, getGroups, getRoutes, getCalendarUsers, getDiscoveredGroups } from "@/src/db";
import { SkipStreamsProvider } from "@/src/skip/skip-streams-provider";
import AuthTokensLive from "./auth-tokens-live";
import GroupsLive from "./groups-live";
import RoutesLive from "./routes-live";
import DiscoveredGroupsLive from "./discovered-groups-live";
import "./slashwork.css";

const AdminActions = nextDynamic(() => import("./admin-actions"));

export const dynamic = "force-dynamic";

type PageData = Awaited<ReturnType<typeof loadPageData>>;

async function loadPageData() {
  const [authTokens, groups, routes, calendarUsers, discoveredGroups] = await Promise.all([
    getAuthTokens(),
    getGroups(),
    getRoutes(),
    getCalendarUsers(),
    getDiscoveredGroups(),
  ]);
  return { authTokens, groups, routes, calendarUsers, discoveredGroups };
}

function AdminSection({ authTokens, groups }: Pick<PageData, "authTokens" | "groups">) {
  return (
    <AdminActions
      authTokenNames={authTokens.map((t) => t.name)}
      groupNames={groups.map((g) => g.name)}
    />
  );
}

function AuthTokensSection({ authTokens }: Pick<PageData, "authTokens">) {
  return (
    <AuthTokensLive
      initialTokens={authTokens.map((t) => ({
        name: t.name,
        tokenPreview: t.tokenPreview,
      }))}
    />
  );
}

function GroupsSection({ groups }: Pick<PageData, "groups">) {
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

function RoutesSection({ routes }: Pick<PageData, "routes">) {
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

function CalendarSection({ calendarUsers }: Pick<PageData, "calendarUsers">) {
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

function DiscoveredGroupsSection({ discoveredGroups, groups }: Pick<PageData, "discoveredGroups" | "groups">) {
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


export default async function SlashworkPage() {
  const data = await loadPageData();

  return (
    <div className="sw-page">
      <main className="sw-container">
        <div className="sw-header">
          <h1 className="sw-title">
            <span>skiphooks</span> / slashwork
          </h1>
          <span className="sw-subtitle">database state</span>
        </div>

        <AdminSection authTokens={data.authTokens} groups={data.groups} />

        <SkipStreamsProvider>
          <div className="sw-grid">
            <AuthTokensSection authTokens={data.authTokens} />
            <GroupsSection groups={data.groups} />
            <RoutesSection routes={data.routes} />
            <CalendarSection calendarUsers={data.calendarUsers} />
            <DiscoveredGroupsSection discoveredGroups={data.discoveredGroups} groups={data.groups} />
          </div>
        </SkipStreamsProvider>
      </main>
    </div>
  );
}
