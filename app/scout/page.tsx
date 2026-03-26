import {
  getRecentCrawlRuns,
  getSavedThreads,
  getQueue,
  getScoutStats,
} from "@/src/lib/db/repository";
import { getScoutWarnings, hasDatabase, loadPipelineConfig } from "@/src/lib/config";
import ScoutConfigForm from "./scout-config-form";
import "./scout.css";

export const dynamic = "force-dynamic";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "\u2026" : str;
}

export default async function ScoutPage() {
  const warnings = getScoutWarnings();
  const dbAvailable = hasDatabase();

  const pipelineConfig = await loadPipelineConfig();

  const [stats, crawlRuns, threads, queue] = dbAvailable
    ? await Promise.all([
        getScoutStats(),
        getRecentCrawlRuns(10),
        getSavedThreads(20),
        getQueue({ status: "pending" }),
      ])
    : [
        { totalRuns: 0, totalThreads: 0, totalComments: 0, pendingComments: 0 },
        [],
        [],
        [],
      ];

  return (
    <div className="cfg-page">
      <main className="cfg-container">
        <div className="cfg-header">
          <h1 className="cfg-title">
            <span>skiphooks</span> / scout
          </h1>
          <span className="cfg-subtitle">reddit dashboard</span>
        </div>

        {warnings.length > 0 && (
          <div className="scout-warnings">
            <div className="scout-warnings-title">
              Setup required
            </div>
            <p className="scout-warnings-desc">
              The scout pipeline cannot run until the following environment variables are configured.
              {!dbAvailable && " Dashboard data is unavailable without a database connection."}
            </p>
            <ul className="scout-warnings-list">
              {warnings.map((w) => (
                <li key={w.variable}>
                  <code>{w.variable}</code>
                  <span> &mdash; {w.label}</span>
                  <span className="scout-warnings-hint">
                    {w.variable === "REDDIT_CLIENT_ID" || w.variable === "REDDIT_CLIENT_SECRET"
                      ? " (create an app at reddit.com/prefs/apps)"
                      : w.variable === "ANTHROPIC_API_KEY"
                        ? " (get a key at console.anthropic.com)"
                        : w.variable === "POSTGRESQL_ADDON_URI"
                          ? " (e.g. postgresql://user:pass@host:5432/dbname)"
                          : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="scout-warnings-steps">
              <p className="scout-warnings-steps-title">To get started:</p>
              <ol>
                <li>Add the missing variables to your <code>.env</code> file</li>
                <li>Restart the server (<code>bun run dev</code>)</li>
                <li>Configure the pipeline below with your target subreddits</li>
              </ol>
            </div>
          </div>
        )}

        {/* Config */}
        <div className="cfg-section">
          <div className="cfg-section-header">
            <h2 className="cfg-section-title">Pipeline Config</h2>
          </div>
          <ScoutConfigForm initialConfig={pipelineConfig} />
        </div>

        {/* Stats bar */}
        <div className="scout-stats">
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.totalRuns}</span>
            <span className="scout-stat-label">Crawl Runs</span>
          </div>
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.totalThreads}</span>
            <span className="scout-stat-label">Threads</span>
          </div>
          <div className="scout-stat">
            <span className="scout-stat-value">{stats.totalComments}</span>
            <span className="scout-stat-label">Comments</span>
          </div>
          <div className="scout-stat">
            <span className="scout-stat-value scout-stat-value--accent">
              {stats.pendingComments}
            </span>
            <span className="scout-stat-label">Pending</span>
          </div>
        </div>

        <div className="cfg-grid">
          {/* Recent Crawl Runs */}
          <div className="cfg-section cfg-section--wide">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Recent Crawl Runs</h2>
              <span className="cfg-count">{crawlRuns.length}</span>
            </div>
            <table className="cfg-table" aria-label="Recent crawl runs">
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Subreddits</th>
                  <th scope="col">Scanned</th>
                  <th scope="col">Saved</th>
                  <th scope="col">Comments</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {crawlRuns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cfg-empty">
                      No crawl runs yet
                    </td>
                  </tr>
                ) : (
                  crawlRuns.map((run) => (
                    <tr key={run.id}>
                      <td className="cfg-mono">{timeAgo(run.startedAt)}</td>
                      <td>
                        {run.subreddits.map((s) => (
                          <span key={s} className="scout-sub">
                            r/{s}
                          </span>
                        ))}
                      </td>
                      <td>{run.threadsScanned}</td>
                      <td>{run.threadsSaved}</td>
                      <td>{run.commentsSaved}</td>
                      <td>
                        {run.errorMessage ? (
                          <span className="cfg-badge scout-badge--error">
                            error
                          </span>
                        ) : run.completedAt ? (
                          <span className="cfg-badge scout-badge--done">
                            done
                          </span>
                        ) : (
                          <span className="cfg-badge scout-badge--running">
                            running
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Saved Threads */}
          <div className="cfg-section cfg-section--wide">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Saved Threads</h2>
              <span className="cfg-count">{threads.length}</span>
            </div>
            <table className="cfg-table" aria-label="Saved threads">
              <thead>
                <tr>
                  <th scope="col">Thread</th>
                  <th scope="col">Subreddit</th>
                  <th scope="col">Score</th>
                  <th scope="col">Topics</th>
                  <th scope="col">Saved</th>
                </tr>
              </thead>
              <tbody>
                {threads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="cfg-empty">
                      No saved threads yet
                    </td>
                  </tr>
                ) : (
                  threads.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <a
                          href={t.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="scout-thread-link"
                        >
                          {truncate(t.title, 80)}
                        </a>
                      </td>
                      <td>
                        <span className="scout-sub">r/{t.subreddit}</span>
                      </td>
                      <td>
                        <span className="scout-score">
                          {t.relevanceScore.toFixed(1)}
                        </span>
                      </td>
                      <td className="scout-topics">
                        {t.suggestedTopics.slice(0, 3).map((topic) => (
                          <span key={topic} className="scout-topic">
                            {topic}
                          </span>
                        ))}
                      </td>
                      <td className="cfg-mono">{timeAgo(t.savedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pending Queue */}
          <div className="cfg-section cfg-section--wide">
            <div className="cfg-section-header">
              <h2 className="cfg-section-title">Pending Queue</h2>
              <span className="cfg-count">{queue.length}</span>
            </div>
            <table className="cfg-table" aria-label="Pending queue">
              <thead>
                <tr>
                  <th scope="col">Comment</th>
                  <th scope="col">Thread</th>
                  <th scope="col">Author</th>
                  <th scope="col">Score</th>
                  <th scope="col">Urgency</th>
                  <th scope="col">Saved</th>
                </tr>
              </thead>
              <tbody>
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="cfg-empty">
                      No pending comments
                    </td>
                  </tr>
                ) : (
                  queue.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <a
                          href={item.commentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="scout-thread-link"
                        >
                          {truncate(item.commentBody, 60)}
                        </a>
                      </td>
                      <td className="scout-thread-title">
                        {truncate(item.thread.title, 40)}
                      </td>
                      <td className="cfg-mono">u/{item.author}</td>
                      <td>
                        <span className="scout-score">
                          {item.relevanceScore.toFixed(1)}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`cfg-badge scout-badge--${item.urgency}`}
                        >
                          {item.urgency}
                        </span>
                      </td>
                      <td className="cfg-mono">{timeAgo(item.savedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
