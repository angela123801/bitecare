/**
 * Move the migrated report photos from the backup's inline base64 blobs into
 * Firebase Cloud Storage, then leave only the storage path in Firestore.
 *
 * Inline base64 in a database document is why those photos were readable by
 * anyone: they sat inside a publicly-readable record. In Cloud Storage they are
 * governed by Storage Rules instead.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node firebase/migrate/photos.mjs [--dry-run]
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes("--dry-run");
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

if (!dryRun && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS is not set.");
  process.exit(1);
}
if (!dryRun && !bucketName) {
  console.error("FIREBASE_STORAGE_BUCKET is not set.");
  process.exit(1);
}

const manifest = JSON.parse(await readFile(join(here, "out", "photoManifest.json"), "utf8"));

let bucket, db;
if (!dryRun) {
  const { initializeApp, cert, applicationDefault } = await import("firebase-admin/app");
  const { getStorage } = await import("firebase-admin/storage");
  const { getFirestore } = await import("firebase-admin/firestore");
  const cred = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
    : applicationDefault();
  const app = initializeApp({
    credential: cred,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: bucketName,
  });
  bucket = getStorage(app).bucket();
  db = getFirestore(app);
}

let uploaded = 0;
const errors = [];
const results = [];

for (const item of manifest) {
  if (!item.dataBase64) continue;
  const buffer = Buffer.from(item.dataBase64, "base64");
  try {
    if (!dryRun) {
      const file = bucket.file(item.targetPath);
      await file.save(buffer, { contentType: item.mimeType, resumable: false });
      // The path is the durable reference. A download URL can be regenerated
      // later and is not stored, so access stays governed by Storage Rules
      // rather than by a long-lived token in the document.
      await db.collection("biteReports").doc(item.reportId).set(
        { photoPath: item.targetPath, photoCount: 1 },
        { merge: true }
      );
    }
    uploaded++;
    results.push({ reportId: item.reportId, path: item.targetPath, bytes: buffer.length });
  } catch (err) {
    errors.push({ reportId: item.reportId, path: item.targetPath, note: String(err.message || err) });
  }
}

console.log(dryRun ? "DRY RUN — nothing uploaded" : "Photo migration complete");
console.log(`Uploaded: ${uploaded} of ${manifest.length}`);
for (const r of results) console.log("  -", r.reportId, "->", r.path, `${r.bytes} bytes`);
if (errors.length) {
  console.log(`Errors: ${errors.length}`);
  for (const e of errors) console.log("  !", e.reportId, e.note);
} else {
  console.log("Errors: none");
}
