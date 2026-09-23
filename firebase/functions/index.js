/**
 * BiteCare privileged operations.
 *
 * These exist because they must write fields the client is forbidden to write
 * (role, isActive) and must do so atomically with an audit entry. Everything
 * else in BiteCare is plain client SDK access governed by Firestore Rules.
 *
 * Security model: the caller is never trusted. Their role is read from
 * users/{uid} server-side and checked against the same creation matrix the
 * rules enforce.
 *
 * Deploy: firebase deploy --only functions
 * Requires a Blaze (billing-enabled) plan.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
const db = getFirestore();

const ROLES = ["superadmin", "admin", "health_worker", "resident"];

/** The role-creation matrix, mirroring firestore.rules. */
const CAN_GRANT = {
  superadmin: ["superadmin", "admin", "health_worker", "resident"],
  admin: ["health_worker", "resident"],
  health_worker: ["resident"],
  resident: [],
};

async function requireCaller(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  if (!request.auth.token.email_verified) {
    throw new HttpsError("failed-precondition", "Your email must be verified.");
  }
  const snap = await db.collection("users").doc(request.auth.uid).get();
  if (!snap.exists) {
    throw new HttpsError("permission-denied", "No application profile for this account.");
  }
  const me = snap.data();
  if (me.isActive !== true) {
    throw new HttpsError("permission-denied", "This account is deactivated.");
  }
  return { uid: request.auth.uid, ...me };
}

function assertCanGrant(caller, targetRole) {
  const allowed = CAN_GRANT[caller.role] || [];
  if (!allowed.includes(targetRole)) {
    throw new HttpsError(
      "permission-denied",
      `A ${caller.role} account cannot create or assign the ${targetRole} role.`
    );
  }
}

async function audit(actor, action, targetType, targetId, details) {
  await db.collection("auditLogs").add({
    actorId: actor.uid,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    details: details || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

/** Create a real Authentication account plus its users/{uid} document. */
exports.createManagedAccount = onCall(async (request) => {
  const caller = await requireCaller(request);

  const { email, password, name, role, phone = "", barangayId = null } = request.data || {};
  if (!email || typeof email !== "string" || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email is required.");
  }
  if (!password || String(password).length < 6) {
    throw new HttpsError("invalid-argument", "A password of at least 6 characters is required.");
  }
  if (!ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Unknown role.");
  }
  assertCanGrant(caller, role);

  let userRecord;
  try {
    userRecord = await getAuth().createUser({
      email: email.toLowerCase(),
      password,
      displayName: name || "",
      emailVerified: false,
    });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "An account with this email already exists.");
    }
    throw new HttpsError("internal", "Could not create the account.");
  }

  const now = FieldValue.serverTimestamp();
  await db.collection("users").doc(userRecord.uid).set({
    uid: userRecord.uid,
    name: name || "",
    email: email.toLowerCase(),
    phone,
    address: "",
    barangayId,
    photoPath: null,
    role,
    isActive: true,
    verificationStatus: "unverified",
    createdAt: now,
    updatedAt: now,
  });

  // The role claim is what lets Storage Rules authorise staff reads.
  await getAuth().setCustomUserClaims(userRecord.uid, { role });

  await audit(caller, "account_created", "user", userRecord.uid, { role });

  return { uid: userRecord.uid, email: email.toLowerCase(), role };
});

/** Change another account's role. Self-change is refused outright. */
exports.setUserRole = onCall(async (request) => {
  const caller = await requireCaller(request);
  const { uid, role } = request.data || {};

  if (!uid || !ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "A uid and a known role are required.");
  }
  if (uid === caller.uid) {
    throw new HttpsError("permission-denied", "You cannot change your own role.");
  }
  assertCanGrant(caller, role);

  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) {
    throw new HttpsError("not-found", "That account does not exist.");
  }
  // An admin may not act on an administrator account; only a superadmin may.
  const targetRole = target.data().role;
  if (caller.role !== "superadmin" && ["admin", "superadmin"].includes(targetRole)) {
    throw new HttpsError("permission-denied", "Only a superadmin can manage administrator accounts.");
  }

  await db.collection("users").doc(uid).set(
    { role, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await getAuth().setCustomUserClaims(uid, { role });
  await audit(caller, "role_change", "user", uid, { from: targetRole, to: role });

  return { uid, role };
});

/** Activate or deactivate another account. */
exports.setUserActive = onCall(async (request) => {
  const caller = await requireCaller(request);
  const { uid, isActive } = request.data || {};

  if (!uid || typeof isActive !== "boolean") {
    throw new HttpsError("invalid-argument", "A uid and isActive are required.");
  }
  if (uid === caller.uid) {
    throw new HttpsError("permission-denied", "You cannot change your own account status.");
  }
  if (!["admin", "superadmin"].includes(caller.role)) {
    throw new HttpsError("permission-denied", "Insufficient privileges.");
  }

  const target = await db.collection("users").doc(uid).get();
  if (!target.exists) {
    throw new HttpsError("not-found", "That account does not exist.");
  }
  const targetRole = target.data().role;
  if (caller.role !== "superadmin" && ["admin", "superadmin"].includes(targetRole)) {
    throw new HttpsError("permission-denied", "Only a superadmin can manage administrator accounts.");
  }

  await db.collection("users").doc(uid).set(
    { isActive, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  // Revoke sign-in immediately so an open session cannot outlive the change.
  if (isActive === false) {
    await getAuth().revokeRefreshTokens(uid);
  }
  await audit(caller, isActive ? "account_activated" : "account_deactivated", "user", uid, {});

  return { uid, isActive };
});
