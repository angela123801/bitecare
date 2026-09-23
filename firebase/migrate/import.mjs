/**
 * Import the transformed documents into Cloud Firestore.
 *
 * Uses firebase-admin, which bypasses Security Rules by design — this is the
 * controlled migration path, not application access.
 *
 * IDEMPOTENT: every write uses set() on a known document id, so re-running
 * updates rather than duplicating. Safe to run more than once.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node firebase/migrate/import.mjs
 *   Add --dry-run to validate without writing.
 *
 * Requires: a real Firebase project with Firestore enabled, and a service
 * account key. Both must come from the project owner.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");
const dryRun = process.argv.includes("--dry-run");

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !dryRun) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set. Provide a service account key.");
  process.exit(1);
}
if (!process.env.FIREBASE_PROJECT_ID && !dryRun) {
  console.error("FIREBASE_PROJECT_ID is not set.");
  process.exit(1);
}

// Collections written, in dependency order (referenced data first).
const PLAN = [
  { file: "users.json", collection: "users" },
  { file: "patients.json", collection: "patients" },
  { file: "facilities.json", collection: "facilities" },
  { file: "reports.json", collection: "biteReports" },
  { file: "appointments.json", collection: "appointments" },
  { file: "notifications.json", collection: "notifications" },
  { file: "dtrRecords.json", collection: "dtrRecords" },
];

const load = async (f) => JSON.parse(await readFile(join(outDir, f), "utf8"));

const report = { written: {}, skipped: [], errors: [] };

let db;
if (!dryRun) {
  const { initializeApp, cert, applicationDefault } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const cred = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  initializeApp({ credential: cred, projectId: process.env.FIREBASE_PROJECT_ID });
  db = getFirestore();
}

for (const { file, collection } of PLAN) {
  let rows;
  try {
    rows = await load(file);
  } catch {
    report.skipped.push({ file, note: "no transformed output for this collection" });
    continue;
  }

  let written = 0;
  for (const row of rows) {
    const { _id, ...data } = row;
    if (!_id) {
      report.errors.push({ collection, row, note: "missing _id" });
      continue;
    }
    // Firestore rejects `undefined`; normalise it away.
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );
    if (dryRun) { written++; continue; }
    try {
      await db.collection(collection).doc(String(_id)).set(clean, { merge: true });
      written++;
    } catch (err) {
      report.errors.push({ collection, id: _id, note: String(err.message || err) });
    }
  }
  report.written[collection] = written;
}

console.log(dryRun ? "DRY RUN — nothing written" : "Import complete");
console.log("Written per collection:", report.written);
if (report.skipped.length) console.log("Skipped:", report.skipped);
if (report.errors.length) {
  console.log(`Errors: ${report.errors.length}`);
  for (const e of report.errors.slice(0, 20)) console.log("  -", e.collection, e.id ?? "", e.note);
} else {
  console.log("Errors: none");
}
