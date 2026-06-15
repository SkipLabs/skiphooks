import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import pg from "pg";
import {
  getCalendarUsers,
  getAuthToken,
  getAuthTokens,
  getGroups,
  getRoutes,
  getAllRoutes,
  resolveRouteFromDb,
} from "./db";

const hasDb = !!process.env.POSTGRESQL_ADDON_URI;

// Test fixtures — names are unique enough to not collide with real data
const TOKEN_A = { name: "test_token_direct_a", token: "abcdefghijklmnop1234" };
const TOKEN_B = { name: "test_token_group_b",  token: "qrstuvwxyz1234567890" };
const GROUP   = { name: "test_group_alpha", slashworkId: "slashwork-test-001", authToken: TOKEN_B.name };
const ROUTE_GROUP  = { name: "test_route_via_group",  groupName: GROUP.name };
const ROUTE_STREAM = { name: "test_route_via_stream", streamId: "stream-test-999", authToken: TOKEN_A.name };
const CAL_USER = { name: "test_calendar_user", calendarId: "testcal@group.calendar.google.com", targetId: "stream-cal-target" };

describe.skipIf(!hasDb)("db queries", () => {
  let db: pg.Pool;

  beforeAll(async () => {
    db = new pg.Pool({ connectionString: process.env.POSTGRESQL_ADDON_URI });

    // Clean up any leftovers from a previous failed run before inserting fresh fixtures
    await db.query("DELETE FROM routes        WHERE name = ANY($1)", [[ROUTE_GROUP.name, ROUTE_STREAM.name]]);
    await db.query("DELETE FROM groups        WHERE name = $1",      [GROUP.name]);
    await db.query("DELETE FROM auth_tokens   WHERE name = ANY($1)", [[TOKEN_A.name, TOKEN_B.name]]);
    await db.query("DELETE FROM calendar_users WHERE name = $1",     [CAL_USER.name]);

    // Insert fixtures in dependency order (auth_tokens → groups → routes)
    await db.query(
      "INSERT INTO auth_tokens (name, token) VALUES ($1, $2), ($3, $4)",
      [TOKEN_A.name, TOKEN_A.token, TOKEN_B.name, TOKEN_B.token],
    );
    await db.query(
      "INSERT INTO groups (name, slashwork_id, auth_token) VALUES ($1, $2, $3)",
      [GROUP.name, GROUP.slashworkId, GROUP.authToken],
    );
    await db.query(
      "INSERT INTO routes (name, group_name) VALUES ($1, $2)",
      [ROUTE_GROUP.name, ROUTE_GROUP.groupName],
    );
    await db.query(
      "INSERT INTO routes (name, stream_id, auth_token) VALUES ($1, $2, $3)",
      [ROUTE_STREAM.name, ROUTE_STREAM.streamId, ROUTE_STREAM.authToken],
    );
    await db.query(
      "INSERT INTO calendar_users (name, calendar_id, target_id) VALUES ($1, $2, $3)",
      [CAL_USER.name, CAL_USER.calendarId, CAL_USER.targetId],
    );
  });

  afterAll(async () => {
    await db.query("DELETE FROM routes         WHERE name = ANY($1)", [[ROUTE_GROUP.name, ROUTE_STREAM.name]]);
    await db.query("DELETE FROM groups         WHERE name = $1",      [GROUP.name]);
    await db.query("DELETE FROM auth_tokens    WHERE name = ANY($1)", [[TOKEN_A.name, TOKEN_B.name]]);
    await db.query("DELETE FROM calendar_users WHERE name = $1",      [CAL_USER.name]);
    await db.end();
  });

  test("getAuthTokens includes fixture tokens with masked format", async () => {
    const tokens = await getAuthTokens();
    const fixture = tokens.find((t) => t.name === TOKEN_A.name);
    expect(fixture).toBeDefined();
    expect(fixture!.tokenPreview).toMatch(/^.{8}\.\.\..{4}$/);
    expect(TOKEN_A.token.startsWith(fixture!.tokenPreview.slice(0, 8))).toBe(true);
    expect(TOKEN_A.token.endsWith(fixture!.tokenPreview.slice(-4))).toBe(true);
  });

  test("getAuthToken returns correct token for known name", async () => {
    const token = await getAuthToken(TOKEN_A.name);
    expect(token).toBe(TOKEN_A.token);
  });

  test("getAuthToken returns null for unknown name", async () => {
    expect(await getAuthToken("nonexistent_token_xyz")).toBeNull();
  });

  test("getGroups includes fixture group with correct fields", async () => {
    const groups = await getGroups();
    const fixture = groups.find((g) => g.name === GROUP.name);
    expect(fixture).toBeDefined();
    expect(fixture!.slashworkId).toBe(GROUP.slashworkId);
    expect(fixture!.authToken).toBe(GROUP.authToken);
  });

  test("getRoutes returns group-based route with null stream_id and auth_token", async () => {
    const routes = await getRoutes();
    const r = routes.find((r) => r.name === ROUTE_GROUP.name);
    expect(r).toBeDefined();
    expect(r!.groupName).toBe(GROUP.name);
    expect(r!.streamId).toBeNull();
    expect(r!.authToken).toBeNull();
  });

  test("getRoutes returns stream-based route with null group_name", async () => {
    const routes = await getRoutes();
    const r = routes.find((r) => r.name === ROUTE_STREAM.name);
    expect(r).toBeDefined();
    expect(r!.groupName).toBeNull();
    expect(r!.streamId).toBe(ROUTE_STREAM.streamId);
    expect(r!.authToken).toBe(TOKEN_A.name);
  });

  test("getAllRoutes resolves group-based route to slashwork ID and token", async () => {
    const routes = await getAllRoutes();
    const r = routes.find((r) => r.name === ROUTE_GROUP.name);
    expect(r).toBeDefined();
    expect(r!.targetId).toBe(GROUP.slashworkId);
    expect(r!.authToken).toBe(TOKEN_B.token);
  });

  test("getAllRoutes resolves stream-based route to stream ID and token", async () => {
    const routes = await getAllRoutes();
    const r = routes.find((r) => r.name === ROUTE_STREAM.name);
    expect(r).toBeDefined();
    expect(r!.targetId).toBe(ROUTE_STREAM.streamId);
    expect(r!.authToken).toBe(TOKEN_A.token);
  });

  test("resolveRouteFromDb resolves group-based route correctly", async () => {
    const route = await resolveRouteFromDb(ROUTE_GROUP.name);
    expect(route).not.toBeNull();
    expect(route!.targetId).toBe(GROUP.slashworkId);
    expect(route!.authToken).toBe(TOKEN_B.token);
  });

  test("resolveRouteFromDb returns null for unknown route", async () => {
    expect(await resolveRouteFromDb("nonexistent_route_xyz")).toBeNull();
  });

  test("getCalendarUsers includes fixture user with correct fields", async () => {
    const users = await getCalendarUsers();
    const fixture = users.find((u) => u.name === CAL_USER.name);
    expect(fixture).toBeDefined();
    expect(fixture!.calendarId).toBe(CAL_USER.calendarId);
    expect(fixture!.targetId).toBe(CAL_USER.targetId);
  });
});
