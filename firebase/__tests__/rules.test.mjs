/**
 * BiteCare Firestore Security Rules — adversarial tests.
 *
 * These run against the real Firestore emulator with the real rules file from
 * disk. The point is to prove that unauthorized operations are REJECTED by the
 * backend, not merely hidden by the UI.
 *
 * Run: node --test firebase/__tests__/rules.test.mjs
 * Requires FIRESTORE_EMULATOR_HOST to point at a running emulator.
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
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs } from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(join(here, "..", "firestore.rules"), "utf8");

let env;

const SUPER = "super-1";
const ADMIN = "admin-1";
const WORKER = "worker-1";
const RES_A = "resident-a";
const RES_B = "resident-b";
const UNVERIFIED = "unverified-1";

const verified = { email_verified: true };
const notVerified = { email_verified: false };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "bitecare-rules-test",
    firestore: { rules },
  });

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", SUPER), { uid: SUPER, role: "superadmin", isActive: true, email: "s@x.test" });
    await setDoc(doc(db, "users", ADMIN), { uid: ADMIN, role: "admin", isActive: true, email: "a@x.test" });
    await setDoc(doc(db, "users", WORKER), { uid: WORKER, role: "health_worker", isActive: true, email: "w@x.test" });
    await setDoc(doc(db, "users", RES_A), { uid: RES_A, role: "resident", isActive: true, email: "ra@x.test" });
    await setDoc(doc(db, "users", RES_B), { uid: RES_B, role: "resident", isActive: true, email: "rb@x.test" });
    await setDoc(doc(db, "users", UNVERIFIED), { uid: UNVERIFIED, role: "resident", isActive: true, email: "u@x.test" });
    // A deactivated account, to prove deactivation takes effect immediately.
    await setDoc(doc(db, "users", "disabled-1"), { uid: "disabled-1", role: "admin", isActive: false, email: "d@x.test" });

    await setDoc(doc(db, "biteReports", "rep-a"), { reporterId: RES_A, patient: { name: "A" }, status: "Submitted", createdAt: 1 });
    await setDoc(doc(db, "biteReports", "rep-b"), { reporterId: RES_B, patient: { name: "B" }, status: "Submitted", createdAt: 2 });
    await setDoc(doc(db, "auditLogs", "log-1"), { actorId: ADMIN, action: "test", createdAt: 1 });
    await setDoc(doc(db, "facilities", "fac-1"), { name: "ABTC", type: "abtc" });
  });
});

after(async () => {
  await env?.cleanup();
});

const as = (uid, claims = verified) => env.authenticatedContext(uid, claims).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("unauthenticated access is denied", () => {
  test("cannot read users", async () => {
    await assertFails(getDoc(doc(anon(), "users", RES_A)));
  });
  test("cannot read bite reports", async () => {
    await assertFails(getDocs(collection(anon(), "biteReports")));
  });
  test("cannot write", async () => {
    await assertFails(setDoc(doc(anon(), "biteReports", "hack"), { reporterId: "x" }));
  });
  test("cannot read facilities", async () => {
    await assertFails(getDoc(doc(anon(), "facilities", "fac-1")));
  });
});

describe("self-promotion is impossible", () => {
  test("a new visitor cannot sign itself up as superadmin", async () => {
    await assertFails(
      setDoc(doc(as("attacker-1"), "users", "attacker-1"), {
        uid: "attacker-1", role: "superadmin", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("a new visitor cannot sign itself up as admin", async () => {
    await assertFails(
      setDoc(doc(as("attacker-2"), "users", "attacker-2"), {
        uid: "attacker-2", role: "admin", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("a visitor CAN sign itself up as resident", async () => {
    await assertSucceeds(
      setDoc(doc(as("newbie-1"), "users", "newbie-1"), {
        uid: "newbie-1", role: "resident", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("a resident cannot change their own role", async () => {
    await assertFails(
      updateDoc(doc(as(RES_A), "users", RES_A), { role: "superadmin" })
    );
  });
  test("a resident cannot flip their own status", async () => {
    await assertFails(
      updateDoc(doc(as(RES_A), "users", RES_A), { isActive: false })
    );
  });
  test("a superadmin cannot promote themselves either", async () => {
    await assertFails(
      updateDoc(doc(as(SUPER), "users", SUPER), { role: "superadmin", isActive: false })
    );
  });
  test("a resident can still edit their own safe profile fields", async () => {
    await assertSucceeds(
      updateDoc(doc(as(RES_A), "users", RES_A), { phone: "0999", address: "Nowhere" })
    );
  });
});

describe("cross-resident privacy", () => {
  test("a resident cannot read another resident's user document", async () => {
    await assertFails(getDoc(doc(as(RES_A), "users", RES_B)));
  });
  test("a resident cannot read another resident's bite report", async () => {
    await assertFails(getDoc(doc(as(RES_A), "biteReports", "rep-b")));
  });
  test("a resident cannot list every bite report", async () => {
    await assertFails(getDocs(collection(as(RES_A), "biteReports")));
  });
  test("a resident CAN read their own bite report", async () => {
    await assertSucceeds(getDoc(doc(as(RES_A), "biteReports", "rep-a")));
  });
  test("a resident cannot modify another resident's report", async () => {
    await assertFails(
      updateDoc(doc(as(RES_A), "biteReports", "rep-b"), { status: "Closed" })
    );
  });
});

describe("role-creation matrix", () => {
  test("admin may create a health_worker account", async () => {
    await assertSucceeds(
      setDoc(doc(as(ADMIN), "users", "new-worker"), {
        uid: "new-worker", role: "health_worker", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("admin may NOT create an admin", async () => {
    await assertFails(
      setDoc(doc(as(ADMIN), "users", "new-admin"), {
        uid: "new-admin", role: "admin", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("health_worker may create a resident", async () => {
    await assertSucceeds(
      setDoc(doc(as(WORKER), "users", "new-res"), {
        uid: "new-res", role: "resident", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("health_worker may NOT create an admin", async () => {
    await assertFails(
      setDoc(doc(as(WORKER), "users", "new-admin2"), {
        uid: "new-admin2", role: "admin", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("resident may NOT create anybody", async () => {
    await assertFails(
      setDoc(doc(as(RES_A), "users", "pal"), {
        uid: "pal", role: "resident", isActive: true, verificationStatus: "verified",
      })
    );
  });
  test("superadmin may create an admin", async () => {
    await assertSucceeds(
      setDoc(doc(as(SUPER), "users", "new-admin3"), {
        uid: "new-admin3", role: "admin", isActive: true, verificationStatus: "verified",
      })
    );
  });
});

describe("clinical data is staff-only", () => {
  test("health_worker can read all reports", async () => {
    await assertSucceeds(getDocs(collection(as(WORKER), "biteReports")));
  });
  test("health_worker can record a vaccination", async () => {
    await assertSucceeds(
      setDoc(doc(as(WORKER), "vaccinations", "vax-1"), {
        ownerId: RES_A, createdBy: WORKER, vaccineType: "Anti-Rabies", doseNumber: 1,
      })
    );
  });
  test("resident can NOT record a vaccination", async () => {
    await assertFails(
      setDoc(doc(as(RES_A), "vaccinations", "vax-2"), {
        ownerId: RES_A, createdBy: RES_A, vaccineType: "Self-prescribed",
      })
    );
  });
  test("resident can NOT read the patient registry", async () => {
    await assertFails(getDocs(collection(as(RES_A), "patients")));
  });
  test("health_worker can read the patient registry", async () => {
    await assertSucceeds(getDocs(collection(as(WORKER), "patients")));
  });
});

describe("audit log is append-only and admin-readable", () => {
  test("resident cannot read audit logs", async () => {
    await assertFails(getDocs(collection(as(RES_A), "auditLogs")));
  });
  test("admin can read audit logs", async () => {
    await assertSucceeds(getDocs(collection(as(ADMIN), "auditLogs")));
  });
  test("admin cannot rewrite an existing audit entry", async () => {
    await assertFails(updateDoc(doc(as(ADMIN), "auditLogs", "log-1"), { action: "tampered" }));
  });
  test("admin cannot delete an audit entry", async () => {
    await assertFails(deleteDoc(doc(as(ADMIN), "auditLogs", "log-1")));
  });
  test("a user may append their own audit entry", async () => {
    await assertSucceeds(
      setDoc(doc(as(RES_A), "auditLogs", "log-own"), { actorId: RES_A, action: "login", createdAt: 2 })
    );
  });
  test("a user may not forge an audit entry as somebody else", async () => {
    await assertFails(
      setDoc(doc(as(RES_A), "auditLogs", "log-forged"), { actorId: ADMIN, action: "sneaky", createdAt: 3 })
    );
  });
});

describe("facilities and notifications", () => {
  test("resident cannot modify a facility", async () => {
    await assertFails(updateDoc(doc(as(RES_A), "facilities", "fac-1"), { name: "Hacked" }));
  });
  test("admin can modify a facility", async () => {
    await assertSucceeds(updateDoc(doc(as(ADMIN), "facilities", "fac-1"), { name: "ABTC Bacolod" }));
  });
  test("resident cannot read another user's notifications", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "notifications", "n-b"), { recipientId: RES_B, title: "x" });
    });
    await assertFails(getDoc(doc(as(RES_A), "notifications", "n-b")));
  });
  test("resident can read their own notification", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "notifications", "n-a"), { recipientId: RES_A, title: "y", isRead: false });
    });
    await assertSucceeds(getDoc(doc(as(RES_A), "notifications", "n-a")));
  });
});

describe("verification and deactivation take effect immediately", () => {
  test("an unverified account may read only its own profile", async () => {
    await assertSucceeds(getDoc(doc(as(UNVERIFIED, notVerified), "users", UNVERIFIED)));
  });
  test("an unverified account is denied all staff data", async () => {
    await assertFails(getDocs(collection(as(UNVERIFIED, notVerified), "biteReports")));
    await assertFails(getDoc(doc(as(UNVERIFIED, notVerified), "facilities", "fac-1")));
    await assertFails(getDoc(doc(as(UNVERIFIED, notVerified), "users", RES_A)));
  });
  test("a deactivated admin loses access at once", async () => {
    await assertFails(getDocs(collection(as("disabled-1"), "auditLogs")));
  });
});
