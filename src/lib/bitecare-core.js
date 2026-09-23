/**
 * BiteCare shared helpers: RBAC, audit, notifications, PEP schedules,
 * image validation, report references, and Bacolod barangay list.
 */
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { ref, get, set, push, update, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

export const REPORT_STATUSES = [
    "Submitted",
    "Under Review",
    "Verified",
    "In Progress",
    "Needs Additional Information",
    "Rejected",
    "Referred",
    "Resolved",
    "Closed"
];

/** Legacy statuses still present in existing records */
export const LEGACY_STATUS_MAP = {
    Pending: "Submitted",
    Treated: "In Progress"
};

export const BACOLOD_BARANGAYS = [
    "Barangay 1", "Barangay 2", "Barangay 3", "Barangay 4", "Barangay 5",
    "Barangay 6", "Barangay 7", "Barangay 8", "Barangay 9", "Barangay 10",
    "Barangay 11", "Barangay 12", "Barangay 13", "Barangay 14", "Barangay 15",
    "Barangay 16", "Barangay 17", "Barangay 18", "Barangay 19", "Barangay 20",
    "Barangay 21", "Barangay 22", "Barangay 23", "Barangay 24", "Barangay 25",
    "Barangay 26", "Barangay 27", "Barangay 28", "Barangay 29", "Barangay 30",
    "Barangay 31", "Barangay 32", "Barangay 33", "Barangay 34", "Barangay 35",
    "Barangay 36", "Barangay 37", "Barangay 38", "Barangay 39", "Barangay 40",
    "Barangay 41",
    "Alangilan", "Alijis", "Banago", "Bata", "Cabug", "Estefania", "Felisa",
    "Granada", "Handumanan", "Mandalagan", "Mansilingan", "Montevista",
    "Pahanocoy", "Singcang-Airport", "Sum-ag", "Taculing", "Tangub",
    "Villamonte", "Vista Alegre", "Other / Not listed"
];

/** WHO-aligned PEP day offsets used as the default configurable schedule. */
export const DEFAULT_PEP_SCHEDULE = [
    { dose_number: 1, day_offset: 0, label: "Day 0" },
    { dose_number: 2, day_offset: 3, label: "Day 3" },
    { dose_number: 3, day_offset: 7, label: "Day 7" },
    { dose_number: 4, day_offset: 14, label: "Day 14" },
    { dose_number: 5, day_offset: 28, label: "Day 28" }
];

export const DEFAULT_EDUCATION = [
    {
        slug: "rabies-prevention",
        title: "Rabies Prevention",
        category: "Rabies",
        status: "published",
        summary: "How rabies spreads and how communities in Bacolod can reduce risk.",
        content: "Rabies is a vaccine-preventable viral disease. Avoid contact with unfamiliar animals, vaccinate pets, and seek care immediately after a bite or scratch. BiteCare supports reporting and tracking — it does not replace professional medical care."
    },
    {
        slug: "bite-prevention",
        title: "Preventing Animal Bites",
        category: "Prevention",
        status: "published",
        summary: "Practical steps for families and pet owners.",
        content: "Do not approach stray animals. Supervise children around pets. Do not disturb animals that are eating, sleeping, or caring for young. Report aggressive animals to local authorities when it is safe to do so."
    },
    {
        slug: "wound-care",
        title: "Wound Care After a Bite",
        category: "First Aid",
        status: "published",
        summary: "Immediate steps before professional evaluation.",
        content: "Wash the wound with soap and running water for at least 15 minutes. Apply pressure if bleeding. Cover with a clean dressing. Seek medical evaluation promptly for rabies risk assessment and tetanus status. Do not apply traditional remedies that delay care."
    },
    {
        slug: "pet-ownership",
        title: "Responsible Pet Ownership",
        category: "Community",
        status: "published",
        summary: "Vaccination, confinement, and community safety.",
        content: "Register and vaccinate dogs and cats against rabies as required. Keep pets confined or leashed in public. Seek veterinary care for sick animals. Never abandon pets."
    },
    {
        slug: "when-to-seek-care",
        title: "When to Seek Medical Attention",
        category: "Safety",
        status: "published",
        summary: "Warning signs that require urgent care.",
        content: "Seek care immediately after any mammal bite or scratch that breaks the skin, especially on the head, neck, hands, or if the animal is unvaccinated, unknown, or behaving unusually. Difficulty swallowing, hydrophobia, or neurological symptoms are emergencies."
    }
];

const STAFF_SESSION_MS = 8 * 60 * 60 * 1000;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function generateReportRef() {
    const d = new Date();
    const stamp = [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
    ].join("");
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `BC-${stamp}-${rand}`;
}

export function normalizeStatus(status) {
    if (!status) return "Submitted";
    return LEGACY_STATUS_MAP[status] || status;
}

export async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(text)));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function accessCodeMatches(stored, provided) {
    if (stored == null || provided == null) return false;
    const plain = String(stored);
    const input = String(provided);
    if (plain === input) return true;
    const hashed = await sha256Hex(input);
    if (plain.toLowerCase() === hashed) return true;
    const storedHash = stored.access_code_hash || stored.hash;
    if (storedHash && String(storedHash).toLowerCase() === hashed) return true;
    return false;
}

export async function writeAuditLog(db, payload) {
    try {
        const logRef = push(ref(db, "audit_logs"));
        await set(logRef, {
            actor_id: payload.actor_id || "unknown",
            actor_name: payload.actor_name || "",
            actor_role: payload.actor_role || "",
            action: payload.action || "",
            target_type: payload.target_type || "",
            target_id: payload.target_id || "",
            result: payload.result || "success",
            details: payload.details || "",
            timestamp: Date.now(),
            created_at: new Date().toISOString()
        });
    } catch (err) {
        console.warn("Audit log skipped", err);
    }
}

export async function notifyUser(db, userId, title, message, type = "general") {
    if (!userId) return;
    const nRef = push(ref(db, `notifications/${userId}`));
    await set(nRef, {
        title,
        message,
        type,
        timestamp: Date.now(),
        created_at: new Date().toISOString(),
        isRead: false,
        is_read: false
    });
}

export async function notifyAllHealthWorkers(db, title, message, type = "staff") {
    const snap = await get(ref(db, "health_workers"));
    if (!snap.exists()) return;
    const workers = snap.val();
    const jobs = Object.keys(workers).map((hwId) => {
        const nRef = push(ref(db, `hw_notifications/${hwId}`));
        return set(nRef, {
            title,
            message,
            type,
            timestamp: Date.now(),
            isRead: false
        });
    });
    await Promise.all(jobs);
}

export function requireStaffSession(kind) {
    const key = kind === "superadmin" ? "super_admin_logged_in" : "health_worker_logged_in";
    const expiresKey = kind === "superadmin" ? "super_admin_session_expires" : "health_session_expires";
    const id = localStorage.getItem(key);
    const expires = Number(localStorage.getItem(expiresKey) || 0);
    if (!id) return null;
    if (expires && Date.now() > expires) {
        localStorage.removeItem(key);
        localStorage.removeItem(expiresKey);
        return null;
    }
    return id;
}

export function startStaffSession(kind, id, name) {
    const expires = String(Date.now() + STAFF_SESSION_MS);
    if (kind === "superadmin") {
        localStorage.setItem("super_admin_logged_in", id);
        localStorage.setItem("super_admin_name", name || "Super Admin");
        localStorage.setItem("super_admin_session_expires", expires);
    } else {
        localStorage.setItem("health_worker_logged_in", id);
        localStorage.setItem("health_worker_name", name || "Health Worker");
        localStorage.setItem("health_session_expires", expires);
    }
}

export function clearStaffSession() {
    localStorage.removeItem("health_worker_logged_in");
    localStorage.removeItem("health_worker_name");
    localStorage.removeItem("health_session_expires");
    localStorage.removeItem("super_admin_logged_in");
    localStorage.removeItem("super_admin_name");
    localStorage.removeItem("super_admin_session_expires");
}

export function accountIsActive(record) {
    if (!record) return false;
    if (record.active === false || record.disabled === true) return false;
    if (record.account_status === "deactivated" || record.account_status === "inactive") return false;
    return true;
}

export function validateImageFile(file, { required = true, maxBytes = MAX_IMAGE_BYTES } = {}) {
    if (!file) return required ? "Please select an image." : null;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Only JPEG, PNG, WebP, or GIF images are allowed.";
    if (file.size > maxBytes) return "Image must be 2 MB or smaller.";
    const name = (file.name || "").toLowerCase();
    if (/\.(exe|js|html|php|svg|htm)$/.test(name)) return "This file type is not allowed.";
    return null;
}

export async function fileLooksLikeImage(file) {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = header[0] === 0xff && header[1] === 0xd8;
    const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    const isGif = header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
    const isWebp = header[0] === 0x52 && header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
    return isJpeg || isPng || isGif || isWebp;
}

function uniqueFileName(originalName) {
    const ext = (originalName.match(/\.(jpe?g|png|webp|gif)$/i) || [".jpg"])[0].toLowerCase().replace("jpeg", "jpg");
    const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${id}${ext}`;
}

export async function uploadValidatedImage(app, pathPrefix, file) {
    const typeError = validateImageFile(file);
    if (typeError) throw new Error(typeError);
    if (!(await fileLooksLikeImage(file))) throw new Error("The file does not appear to be a valid image.");
    const safeName = uniqueFileName(file.name || "upload.jpg");
    const path = `${pathPrefix}/${safeName}`;
    try {
        const storage = getStorage(app);
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, file, { contentType: file.type });
        const url = await getDownloadURL(sRef);
        return { url, path, storage: "firebase" };
    } catch (err) {
        const dataUrl = await compressToDataUrl(file);
        return { url: dataUrl, path, storage: "inline" };
    }
}

function compressToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const max = 1200;
            let { width, height } = img;
            if (width > max || height > max) {
                const scale = Math.min(max / width, max / height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext("2d").drawImage(img, 0, 0, width, height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL("image/jpeg", 0.72));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        };
        img.src = url;
    });
}

export async function appendStatusHistory(db, reportId, actor, status, note = "") {
    const hRef = push(ref(db, `reports/${reportId}/status_history`));
    await set(hRef, {
        status,
        note,
        actor_id: actor.id || "",
        actor_name: actor.name || "",
        timestamp: Date.now(),
        created_at: new Date().toISOString()
    });
}

export async function getPepSchedule(db) {
    try {
        const snap = await get(ref(db, "system_settings/pep_schedule"));
        if (snap.exists() && Array.isArray(snap.val())) return snap.val();
        if (snap.exists() && typeof snap.val() === "object") return Object.values(snap.val());
    } catch (e) { /* use default */ }
    return DEFAULT_PEP_SCHEDULE;
}

export function computeDoseDates(startIsoDate, schedule) {
    const start = new Date(`${startIsoDate}T00:00:00`);
    return schedule.map((s) => {
        const d = new Date(start);
        d.setDate(d.getDate() + Number(s.day_offset || 0));
        return {
            ...s,
            scheduled_date: d.toISOString().slice(0, 10),
            status: s.dose_number === 1 ? "Dose Scheduled" : "Dose Scheduled",
            completed_at: null
        };
    });
}

export function vaccinationOverallStatus(doses) {
    if (!doses || !doses.length) return "Not Started";
    const today = new Date().toISOString().slice(0, 10);
    const completed = doses.filter((d) => d.status === "Completed").length;
    if (completed === doses.length) return "Completed";
    const missed = doses.some((d) => d.status !== "Completed" && d.scheduled_date < today);
    if (missed) return "Missed/Overdue";
    if (completed > 0) return "Partially Completed";
    return "Dose Scheduled";
}

export async function createVaccinationPlan(db, { userId, reportId, startDate, vaccineName, actor }) {
    const schedule = await getPepSchedule(db);
    const doses = computeDoseDates(startDate, schedule);
    const record = {
        user_id: userId,
        report_id: reportId,
        vaccine_name: vaccineName || "Anti-Rabies PEP",
        start_date: startDate,
        doses,
        status: vaccinationOverallStatus(doses),
        notes: "",
        created_by: actor?.id || "",
        created_by_name: actor?.name || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    const vRef = push(ref(db, `vaccinations/${userId}`));
    await set(vRef, record);
    await set(ref(db, `report_vaccinations/${reportId}`), { user_id: userId, vaccination_id: vRef.key });
    return { id: vRef.key, ...record };
}

export async function processVaccinationReminders(db, userId) {
    const snap = await get(ref(db, `vaccinations/${userId}`));
    if (!snap.exists()) return;
    const today = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);

    for (const [id, rec] of Object.entries(snap.val())) {
        const doses = rec.doses || [];
        for (const dose of doses) {
            if (dose.status === "Completed") continue;
            let title = "";
            let message = "";
            if (dose.scheduled_date === today) {
                title = "Vaccination due today";
                message = `${rec.vaccine_name || "Vaccine"} ${dose.label || "dose"} is due today. Please visit an Animal Bite Treatment Center. This is a reminder only — not medical advice.`;
            } else if (dose.scheduled_date === tomorrow) {
                title = "Upcoming vaccination";
                message = `${rec.vaccine_name || "Vaccine"} ${dose.label || "dose"} is scheduled for tomorrow.`;
            } else if (dose.scheduled_date < today) {
                title = "Missed vaccination dose";
                message = `${rec.vaccine_name || "Vaccine"} ${dose.label || "dose"} appears overdue. Contact a health facility for guidance.`;
            }
            if (!title) continue;
            const flagPath = `vaccination_reminders_sent/${userId}/${id}/${dose.dose_number}/${dose.scheduled_date}`;
            const sent = await get(ref(db, flagPath));
            if (sent.exists()) continue;
            await notifyUser(db, userId, title, message, "vaccination_reminder");
            await set(ref(db, flagPath), { sent_at: Date.now() });
        }
    }
}

export async function seedEducationIfEmpty(db, author = "system") {
    const snap = await get(ref(db, "education_resources"));
    if (snap.exists()) return;
    const now = new Date().toISOString();
    const updates = {};
    DEFAULT_EDUCATION.forEach((item, i) => {
        updates[`education_resources/${item.slug}`] = {
            ...item,
            author,
            created_at: now,
            updated_at: now,
            sort: i
        };
    });
    await update(ref(db), updates);
}

export function barangaySelectHtml(selected = "") {
    return BACOLOD_BARANGAYS.map((b) =>
        `<option value="${escapeHtml(b)}" ${b === selected ? "selected" : ""}>${escapeHtml(b)}</option>`
    ).join("");
}

export function statusSelectHtml(selected = "Submitted") {
    const current = normalizeStatus(selected);
    const extras = current && !REPORT_STATUSES.includes(current) ? [current] : [];
    return [...extras, ...REPORT_STATUSES].map((s) =>
        `<option value="${escapeHtml(s)}" ${s === current ? "selected" : ""}>${escapeHtml(s)}</option>`
    ).join("");
}

export function anonymizeReportForPublicMap(report) {
    return {
        id: report.id,
        animal_type: report.animal_type || "Unknown",
        barangay: report.barangay || "",
        latitude: report.latitude,
        longitude: report.longitude,
        bite_date: report.bite_date || "",
        status: normalizeStatus(report.status),
        timestamp: report.timestamp || ""
    };
}

export function userOwnsReport(report, uid) {
    return report && report.user_id === uid;
}

export { query, orderByChild, equalTo };
