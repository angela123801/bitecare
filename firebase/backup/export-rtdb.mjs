/**
 * Read-only export of the current Firebase Realtime Database.
 *
 * Purpose: take a backup BEFORE any security-rule change, so no records are
 * lost when the database is locked down. Reads each top-level collection
 * individually (root reads are denied once rules are tightened).
 *
 * Usage: node firebase/backup/export-rtdb.mjs
 * Output: firebase/backup/rtdb-backup-<timestamp>.json  (contains PII — do not commit)
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DB = "https://bitecare-deb9d-default-rtdb.asia-southeast1.firebasedatabase.app";

const COLLECTIONS = [
  "users", "pending_users", "reports", "incident_photos",
  "appointments", "vaccinations", "report_vaccinations",
  "notifications", "hw_notifications", "vaccination_reminders_sent",
  "centers", "health_workers", "Super_Admin",
  "education_resources", "announcements",
  "audit_logs", "staff_logs", "dtr_records", "system_settings",
];

const outDir = join(dirname(fileURLToPath(import.meta.url)));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outFile = join(outDir, `rtdb-backup-${stamp}.json`);

const backup = { exportedAt: new Date().toISOString(), source: DB, collections: {} };
const problems = [];

for (const name of COLLECTIONS) {
  try {
    const res = await fetch(`${DB}/${name}.json`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      problems.push({ collection: name, status: res.status, note: "not readable" });
      continue;
    }
    const data = await res.json();
    backup.collections[name] = data ?? null;
  } catch (err) {
    problems.push({ collection: name, note: String(err) });
  }
}

backup.problems = problems;
await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(backup, null, 2), "utf8");

const counts = Object.fromEntries(
  Object.entries(backup.collections).map(([k, v]) => [
    k,
    v && typeof v === "object" ? Object.keys(v).length : 0,
  ])
);

console.log("Backup written:", outFile);
console.log("Record counts:", counts);
if (problems.length) console.log("Problems:", problems);
