/**
 * Seeds calendar-related data into the database.
 * Run migrations first: bun scripts/migrate.ts
 */
import pg from "pg";

const connectionString = process.env.POSTGRESQL_ADDON_URI;
if (!connectionString) {
  console.error("POSTGRESQL_ADDON_URI environment variable is required");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function seed() {
  console.log("Seeding calendar data...");

  // Seed calendar auth token
  const calendarToken = process.env.SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR;
  if (calendarToken) {
    await pool.query(
      `INSERT INTO auth_tokens (name, token) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET token = EXCLUDED.token`,
      ["google_calendar", calendarToken],
    );
    console.log('  auth_token "google_calendar" seeded');
  } else {
    console.warn("  Skipping auth_token: SLASHWORK_AUTH_TOKEN_GOOGLE_CALENDAR not set");
  }

  // Seed calendar users
  const users = [
    { name: "Hugo", calendarId: "hugo@skiplabs.io", targetId: "g_cR_HOoSUCphBLt7gktCEyi" },
  ];

  for (const u of users) {
    await pool.query(
      `INSERT INTO calendar_users (name, calendar_id, target_id) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET calendar_id = EXCLUDED.calendar_id, target_id = EXCLUDED.target_id`,
      [u.name, u.calendarId, u.targetId],
    );
    console.log(`  calendar_user "${u.name}" seeded`);
  }

  console.log("Done.");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
