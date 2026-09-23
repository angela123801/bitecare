/**
 * Transform the Firebase RTDB backup into Firestore-shaped documents.
 *
 * Realtime Database is one big nested tree with no types and no per-record
 * timestamps in places. Firestore wants flat-ish documents with real types.
 * This script does that translation and writes import-ready JSON.
 *
 * What it deliberately does NOT carry over:
 *   - Super_Admin / health_workers plaintext `access_code` values
 *   - anything password-like (Firebase Auth owns credentials)
 *   - inline base64 photo blobs (a manifest is emitted instead, so the files
 *     get re-uploaded to Cloud Storage rather than stored as document data —
 *     Firestore documents cap at ~1 MiB and a report photo would blow that)
 *
 * Usage: node firebase/migrate/transform.mjs <backup.json>
 * Output: firebase/migrate/out/*.json  (contains PII — gitignored)
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "out");

const backupPath = process.argv[2];
if (!backupPath) {
  console.error("Usage: node firebase/migrate/transform.mjs <backup.json>");
  process.exit(1);
}

const backup = JSON.parse(await readFile(backupPath, "utf8"));
const c = backup.collections;

/** RTDB ids are strings; Firestore doc ids cannot contain '/'. */
const safeId = (id) => String(id).replace(/\//g, "_");

const toIso = (v) => {
  if (!v) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Legacy role names → the four roles this system actually uses. */
const ROLE_MAP = {
  superadmin: "superadmin",
  super_admin: "superadmin",
  admin: "admin",
  staff: "health_worker",
  health_worker: "health_worker",
  health: "health_worker",
  worker: "health_worker",
  user: "resident",
  resident: "resident",
};

const normalizeRole = (r) => ROLE_MAP[String(r || "").toLowerCase()] || "resident";

const out = {
  users: [],
  reports: [],
  appointments: [],
  facilities: [],
  notifications: [],
  auditLogs: [],
  dtrRecords: [],
  photoManifest: [],
};
const warnings = [];

// ---------- users ----------
// RTDB "users" is keyed by the user id and already carries role/status fields.
for (const [uid, u] of Object.entries(c.users || {})) {
  if (!u || typeof u !== "object") continue;
  const role = normalizeRole(u.role);
  out.users.push({
    _id: safeId(uid),                 // Firebase Auth UID when it exists
    uid: safeId(uid),
    name: u.name || u.fullName || u.full_name || "",
    email: (u.email || "").toLowerCase() || null,
    phone: u.phone || "",
    address: u.address || "",
    barangayName: u.barangay || u.barangay_name || "",
    barangayId: u.barangayId || u.barangay_id || null,
    photoPath: u.photoPath || null,
    role,
    isActive: u.active === false || u.disabled === true ? false : true,
    verificationStatus: u.verification_status || (u.verified ? "verified" : "unverified"),
    createdAt: toIso(u.created_at || u.createdAt) || new Date().toISOString(),
    updatedAt: toIso(u.updated_at || u.updatedAt) || new Date().toISOString(),
  });
  // A user with no email cannot be given a Firebase Auth account.
  if (!u.email) {
    warnings.push({ kind: "user_without_email", id: uid, note: "admin-created account; must set a real email before provisioning" });
  }
}

// ---------- staff lists ----------
// These are lookup tables of staff identities. Plaintext access codes are DROPPED.
for (const [key, list] of [["Super_Admin", c.Super_Admin], ["health_workers", c.health_workers]]) {
  for (const [id, s] of Object.entries(list || {})) {
    if (!s || typeof s !== "object") continue;
    if (s.access_code !== undefined || s.accessCode !== undefined) {
      warnings.push({ kind: "access_code_dropped", id: `${key}/${id}`, note: "plaintext code not migrated" });
    }
  }
}

// ---------- reports + embedded patient + photos ----------
for (const [rid, r] of Object.entries(c.reports || {})) {
  if (!r || typeof r !== "object") continue;
  const docId = safeId(rid);
  const patientName = r.full_name || r.patient_name || r.victim_name || r.name || "";

  out.reports.push({
    _id: docId,
    reporterId: safeId(r.user_id || r.reporter_id || r.uid || ""),
    patientId: null,            // linked during the dedupe pass below
    patient: {
      name: patientName,
      age: r.age ?? r.patient_age ?? null,
      sex: r.sex ?? r.patient_sex ?? r.gender ?? null,
      phone: r.phone ?? r.patient_phone ?? "",
      address: r.address ?? r.patient_address ?? "",
      barangayId: r.barangay_id ?? r.patient_barangay_id ?? null,
      barangayName: r.barangay || "",
    },
    biteDate: r.bite_date || r.date || null,
    biteTime: r.bite_time || r.time || null,
    animal: {
      type: r.animal_type || r.animal || "Unknown",
      other: r.animal_type_other || "",
      status: r.animal_status || "",
      vaccinated: r.animal_vaccinated ?? null,
    },
    wound: {
      site: r.bite_site || r.body_part || "",
      type: r.wound_type || "",
      category: r.category || null,
      count: r.number_of_wounds ?? null,
      provoked: r.provoked ?? null,
    },
    incident: {
      location: r.incident_location || r.location || "",
      latitude: (typeof r.latitude === "number" ? r.latitude : (typeof r.lat === "number" ? r.lat : null)),
      longitude: (typeof r.longitude === "number" ? r.longitude : (typeof r.lng === "number" ? r.lng : null)),
    },
    status: r.status || "Submitted",
    severity: r.severity || null,
    assignedWorkerId: safeId(r.assigned_worker_id || "") || null,
    assignedFacilityId: safeId(r.assigned_facility_id || r.center_id || "") || null,
    firstAid: { given: r.first_aid ?? null, details: r.first_aid_details || r.first_aid_notes || "" },
    notes: r.notes || "",
    createdAt: toIso(r.timestamp || r.created_at) || new Date().toISOString(),
    updatedAt: toIso(r.updated_at || r.timestamp) || new Date().toISOString(),
  });

  // Photo blob → manifest entry, never document data.
  const blob = r.bite_pic || r.photo || r.image;
  if (typeof blob === "string" && blob.length > 0) {
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/i.exec(blob);
    if (m) {
      out.photoManifest.push({
        reportId: docId,
        mimeType: m[1],
        ext: m[1].split("/")[1].replace("jpeg", "jpg"),
        bytesApprox: Math.floor(m[2].length * 0.75),
        dataBase64: m[2],
        targetPath: `incident-photos/${docId}/migrated.${m[1].split("/")[1].replace("jpeg", "jpg")}`,
      });
    } else {
      warnings.push({ kind: "photo_unrecognised", id: rid, note: "photo field was not a data URI; skipped" });
    }
  }
}

// ---------- patient dedupe ----------
// One patient document per real person, not one per report.
const patientIndex = new Map();
const patients = [];
for (const rep of out.reports) {
  const p = rep.patient;
  if (!p.name) {
    warnings.push({ kind: "report_without_patient_name", id: rep._id, note: "cannot link to a patient record" });
    continue;
  }
  const key = [p.name.trim().toLowerCase(), p.age ?? "", (p.barangayName || p.barangayId || "").trim().toLowerCase()].join("|");
  if (!patientIndex.has(key)) {
    const id = `pat_${patientIndex.size + 1}_${key.replace(/[^a-z0-9]/g, "").slice(0, 12)}`;
    patientIndex.set(key, id);
    patients.push({
      _id: id,
      name: p.name,
      age: p.age,
      sex: p.sex,
      phone: p.phone,
      address: p.address,
      barangayId: p.barangayId,
      barangayName: p.barangayName,
      ownerId: rep.reporterId || null,
      createdAt: rep.createdAt,
      updatedAt: rep.updatedAt,
    });
  }
  rep.patientId = patientIndex.get(key);
}
out.patients = patients;

// ---------- appointments ----------
for (const [aid, a] of Object.entries(c.appointments || {})) {
  if (!a || typeof a !== "object") continue;
  out.appointments.push({
    _id: safeId(aid),
    ownerId: safeId(a.ownerId || a.user_id || a.patient_id || a.uid || ""),
    title: a.title || a.type || "Appointment",
    facilityId: safeId(a.facility_id || a.center_id || "") || null,
    scheduledAt: toIso(a.scheduledAt || a.scheduled_at || a.date) || null,
    scheduledDate: a.date || a.scheduled_date || null,
    scheduledTime: a.time || a.scheduled_time || null,
    status: a.status || "Scheduled",
    notes: a.notes || "",
    createdBy: safeId(a.created_by || "") || null,
    createdAt: toIso(a.created_at) || new Date().toISOString(),
    updatedAt: toIso(a.updated_at || a.created_at) || new Date().toISOString(),
  });
  if (!(a.ownerId || a.user_id || a.patient_id || a.uid)) {
    warnings.push({ kind: "orphan_appointment", id: aid, note: "no owner id — will not be visible to any resident until assigned" });
  }
}

// ---------- facilities (from RTDB "centers") ----------
for (const [fid, f] of Object.entries(c.centers || {})) {
  if (!f || typeof f !== "object") continue;
  const lat = typeof f.lat === "number" ? f.lat : (typeof f.latitude === "number" ? f.latitude : null);
  const lng = typeof f.lng === "number" ? f.lng : (typeof f.longitude === "number" ? f.longitude : null);
  if (lat === null || lng === null) {
    warnings.push({ kind: "facility_without_coordinates", id: fid, note: "no coordinates; will not appear on the map" });
  }
  out.facilities.push({
    _id: safeId(fid),
    name: f.name || "",
    type: f.type || "clinic",
    address: f.address || "",
    barangayName: f.barangay || "",
    latitude: lat,
    longitude: lng,
    phone: f.phone || f.contact || "",
    email: f.email || "",
    operatingHours: f.hours || f.operating_hours || "",
    services: f.services || [],
    isActive: f.active === false ? false : true,
    createdAt: toIso(f.created_at) || new Date().toISOString(),
    updatedAt: toIso(f.updated_at || f.created_at) || new Date().toISOString(),
  });
}

// ---------- notifications ----------
// RTDB stores these under notifications/{userId}/{id}.
for (const [uid, bucket] of Object.entries(c.notifications || {})) {
  for (const [nid, n] of Object.entries(bucket || {})) {
    if (!n || typeof n !== "object") continue;
    out.notifications.push({
      _id: `${safeId(uid)}_${safeId(nid)}`,
      recipientId: safeId(uid),
      title: n.title || "",
      message: n.message || "",
      type: n.type || "general",
      referenceType: n.reference_type || null,
      referenceId: n.reference_id || null,
      isRead: n.isRead === true || n.is_read === true,
      createdAt: toIso(n.timestamp || n.created_at) || new Date().toISOString(),
    });
  }
}

// ---------- dtr / staff logs ----------
for (const [id, d] of Object.entries(c.dtr_records || {})) {
  if (!d || typeof d !== "object") continue;
  out.dtrRecords.push({
    _id: safeId(id),
    uid: safeId(d.user_id || d.uid || ""),
    name: d.name || "",
    action: d.action || d.type || "",
    timestamp: toIso(d.timestamp || d.created_at) || null,
    createdAt: toIso(d.created_at || d.timestamp) || new Date().toISOString(),
  });
}

await mkdir(outDir, { recursive: true });
for (const [name, rows] of Object.entries(out)) {
  await writeFile(join(outDir, `${name}.json`), JSON.stringify(rows, null, 2), "utf8");
}

const summary = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]));
console.log("Transformed from:", basename(backupPath));
console.log("Document counts:", summary);
console.log("Warnings:", warnings.length);
for (const w of warnings.slice(0, 20)) console.log("  -", w.kind, w.id, "—", w.note);
if (warnings.length > 20) console.log(`  ...and ${warnings.length - 20} more`);
