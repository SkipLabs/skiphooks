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

// These tests require POSTGRESQL_ADDON_URI to be set and the DB to be migrated+seeded.
// They read existing data — no writes, no cleanup needed.

const hasDb = !!process.env.POSTGRESQL_ADDON_URI;

describe.skipIf(!hasDb)("db queries", () => {
  test("getAuthTokens returns entries with masked tokens", async () => {
    const tokens = await getAuthTokens();
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) {
      expect(t.name).toBeTruthy();
      expect(t.tokenPreview).toMatch(/^.{8}\.\.\..{4}$/);
    }
  });

  test("getAuthToken returns token for known name", async () => {
    const token = await getAuthToken("skipper");
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  test("getAuthToken returns null for unknown name", async () => {
    const token = await getAuthToken("nonexistent_token_xyz");
    expect(token).toBeNull();
  });

  test("getGroups returns entries with required fields", async () => {
    const groups = await getGroups();
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.name).toBeTruthy();
      expect(g.slashworkId).toBeTruthy();
      expect(g.authToken).toBeTruthy();
    }
  });

  test("getRoutes returns entries with correct shape", async () => {
    const routes = await getRoutes();
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.name).toBeTruthy();
      // Each route is either group-based or stream-based
      if (r.groupName) {
        expect(r.streamId).toBeNull();
        expect(r.authToken).toBeNull();
      } else {
        expect(r.streamId).toBeTruthy();
        expect(r.authToken).toBeTruthy();
      }
    }
  });

  test("getAllRoutes resolves target IDs and auth tokens", async () => {
    const routes = await getAllRoutes();
    expect(routes.length).toBeGreaterThan(0);
    for (const r of routes) {
      expect(r.name).toBeTruthy();
      expect(r.targetId).toBeTruthy();
      expect(r.authToken).toBeTruthy();
    }
  });

  test("resolveRouteFromDb returns resolved route for known name", async () => {
    const route = await resolveRouteFromDb("skipper");
    expect(route).not.toBeNull();
    expect(route!.targetId).toBeTruthy();
    expect(route!.authToken).toBeTruthy();
  });

  test("resolveRouteFromDb returns null for unknown route", async () => {
    const route = await resolveRouteFromDb("nonexistent_route_xyz");
    expect(route).toBeNull();
  });

  test("getCalendarUsers returns entries with required fields", async () => {
    const users = await getCalendarUsers();
    expect(users.length).toBeGreaterThan(0);
    for (const u of users) {
      expect(u.name).toBeTruthy();
      expect(u.calendarId).toBeTruthy();
      expect(u.targetId).toBeTruthy();
    }
  });

  test("getAuthToken returns calendar token", async () => {
    const token = await getAuthToken("google_calendar");
    expect(token).toBeTruthy();
  });
});
