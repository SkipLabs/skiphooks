"use client";

import { useSkipStream } from "@/src/skip/skip-streams-provider";
import { DeleteButton } from "./admin-actions";

interface DbAuthToken {
  name: string;
  token: string;
}

interface AuthToken {
  name: string;
  tokenPreview: string;
}

function dbToToken(row: DbAuthToken): AuthToken {
  return {
    name: row.name,
    tokenPreview: row.token.slice(0, 8) + "..." + row.token.slice(-4),
  };
}

export default function AuthTokensLive({
  initialTokens,
}: {
  initialTokens: AuthToken[];
}) {
  const initialMap = new Map(
    initialTokens.map((t) => [t.name, { name: t.name, token: "" } as DbAuthToken]),
  );
  const { items, connected } = useSkipStream<DbAuthToken>(
    "authTokens",
    initialMap,
  );
  const tokens = Array.from(items.values()).map(dbToToken);

  return (
    <div className="sw-section">
      <div className="sw-section-header">
        <h2 className="sw-section-title">
          Auth Tokens
          {connected && (
            <span className="sw-badge sw-badge--group" style={{ marginLeft: "8px", fontSize: "0.7em" }}>
              live
            </span>
          )}
        </h2>
        <span className="sw-count">{tokens.length}</span>
      </div>
      <table className="sw-table" aria-label="Auth tokens">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Token</th>
            <th scope="col"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {tokens.length === 0 ? (
            <tr>
              <td colSpan={3} className="sw-empty">
                No auth tokens configured
              </td>
            </tr>
          ) : (
            tokens.map((t) => (
              <tr key={t.name}>
                <td>{t.name}</td>
                <td className="sw-token">{t.tokenPreview}</td>
                <td className="sw-actions">
                  <DeleteButton endpoint="/api/admin/tokens" name={t.name} label="token" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
