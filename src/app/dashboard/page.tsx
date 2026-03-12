import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getQueue } from "@/src/lib/db/repository";
import { getScoutWarnings, hasDatabase } from "@/src/lib/config";
import type { QueueFilter } from "@/src/types/storage";
import QueueList from "./components/QueueList";
import FilterBar from "./components/FilterBar";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) return redirect("/sign-in");

  const warnings = getScoutWarnings();
  const dbAvailable = hasDatabase();

  const params = await searchParams;
  const filter: QueueFilter = {};

  const status = typeof params.status === "string" ? params.status : undefined;
  if (status) filter.status = status as QueueFilter["status"];

  const urgency =
    typeof params.urgency === "string" ? params.urgency : undefined;
  if (urgency) filter.urgency = urgency as QueueFilter["urgency"];

  const subreddit =
    typeof params.subreddit === "string" ? params.subreddit : undefined;
  if (subreddit) filter.subreddit = subreddit;

  const minScore =
    typeof params.minScore === "string" ? params.minScore : undefined;
  if (minScore) filter.minScore = parseFloat(minScore);

  const items = dbAvailable ? await getQueue(filter) : [];

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "40px 20px",
        fontFamily: "var(--cfg-sans)",
        color: "var(--cfg-text)",
      }}
    >
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 24,
          fontFamily: "var(--cfg-mono)",
          color: "var(--cfg-accent)",
        }}
      >
        Reddit Scout Queue
      </h1>
      {warnings.length > 0 && (
        <div className="scout-warnings">
          <div className="scout-warnings-title">
            Missing environment variables
          </div>
          <p className="scout-warnings-desc">
            The scout pipeline cannot run until these are configured.
            {!dbAvailable && " Queue data is unavailable without a database connection."}
          </p>
          <ul className="scout-warnings-list">
            {warnings.map((w) => (
              <li key={w.variable}>
                <code>{w.variable}</code>
                <span> &mdash; {w.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <FilterBar
        currentStatus={status}
        currentUrgency={urgency}
        currentSubreddit={subreddit}
      />
      <QueueList initialItems={items} />
    </div>
  );
}
