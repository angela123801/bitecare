/**
 * BiteCare Storage Rules — adversarial tests.
 * Runs against the Storage + Firestore emulators with the real rules files.
 *
 * Run: node --test firebase/__tests__/storage.test.mjs
 * Requires FIRESTORE_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

const here = dirname(fileURLToPath(import.meta.url));
const firestoreRules = readFileSync(join(here, "..", "firestore.rules"), "utf8");
const storageRules = readFileSync(join(here, "..", "storage.rules"), "utf8");

let env;

const RES_A = "resident-a";
const RES_B = "resident-b";
const WORKER = "worker-1";
const ADMIN = "admin-1";

const verified = { email_verified: true };

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "bitecare-storage-test",
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", RES_A), { uid: RES_A, role: "resident", isActive: true });
    await setDoc(doc(db, "users", RES_B), { uid: RES_B, role: "resident", isActive: true });
    await setDoc(doc(db, "users", WORKER), { uid: WORKER, role: "health_worker", isActive: true });
    await setDoc(doc(db, "users", ADMIN), { uid: ADMIN, role: "admin", isActive: true });
    await setDoc(doc(db, "biteReports", "rep-a"), { reporterId: RES_A });
    await setDoc(doc(db, "biteReports", "rep-b"), { reporterId: RES_B });
  });
});

after(async () => {
  await env?.cleanup();
});

const storageOf = (uid, claims = verified) => env.authenticatedContext(uid, claims).storage();
const anonStorage = () => env.unauthenticatedContext().storage();

// Storage rules authorise staff via a Firebase Auth custom claim (role), which
// the provisioning function issues server-side. Tests must carry that claim.
const workerClaims = { email_verified: true, role: "health_worker" };
const adminClaims = { email_verified: true, role: "admin" };

describe("profile photos", () => {
  test("owner can upload their own profile photo", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageOf(RES_A), `profile-photos/${RES_A}/me.png`), PNG, { contentType: "image/png" })
    );
  });
  test("owner cannot write into another user's profile folder", async () => {
    await assertFails(
      uploadBytes(ref(storageOf(RES_A), `profile-photos/${RES_B}/hack.png`), PNG, { contentType: "image/png" })
    );
  });
  test("owner cannot upload a non-image", async () => {
    await assertFails(
      uploadBytes(ref(storageOf(RES_A), `profile-photos/${RES_A}/evil.html`), PNG, { contentType: "text/html" })
    );
  });
  test("owner cannot upload an oversized file", async () => {
    const big = Buffer.alloc(3 * 1024 * 1024, 1);
    await assertFails(
      uploadBytes(ref(storageOf(RES_A), `profile-photos/${RES_A}/big.png`), big, { contentType: "image/png" })
    );
  });
  test("admin can read another user's profile photo", async () => {
    await assertSucceeds(
      getDownloadURL(ref(storageOf(ADMIN, adminClaims), `profile-photos/${RES_A}/me.png`))
    );
  });
  test("anonymous cannot read a profile photo", async () => {
    await assertFails(
      getDownloadURL(ref(anonStorage(), `profile-photos/${RES_A}/me.png`))
    );
  });
});

describe("incident photos", () => {
  test("report owner can upload an incident photo", async () => {
    await assertSucceeds(
      uploadBytes(ref(storageOf(RES_A), `incident-photos/rep-a/wound.png`), PNG, { contentType: "image/png" })
    );
  });
  test("a resident cannot upload to another resident's report", async () => {
    await assertFails(
      uploadBytes(ref(storageOf(RES_A), `incident-photos/rep-b/wound.png`), PNG, { contentType: "image/png" })
    );
  });
  test("a resident cannot read another resident's incident photo", async () => {
    await assertFails(
      getDownloadURL(ref(storageOf(RES_B), `incident-photos/rep-a/wound.png`))
    );
  });
  test("staff can read an incident photo for case handling", async () => {
    await assertSucceeds(
      getDownloadURL(ref(storageOf(WORKER, workerClaims), `incident-photos/rep-a/wound.png`))
    );
  });
  test("anonymous cannot read an incident photo", async () => {
    await assertFails(
      getDownloadURL(ref(anonStorage(), `incident-photos/rep-a/wound.png`))
    );
  });
  test("report owner can delete their own incident photo", async () => {
    await assertSucceeds(
      deleteObject(ref(storageOf(RES_A), `incident-photos/rep-a/wound.png`))
    );
  });
});

describe("unmapped paths", () => {
  test("a random path is denied", async () => {
    await assertFails(
      uploadBytes(ref(storageOf(RES_A), "somewhere/else/x.png"), PNG, { contentType: "image/png" })
    );
  });
});
