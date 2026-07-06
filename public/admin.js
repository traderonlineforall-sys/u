
import { supabase } from "./supabase-client.js";
import { ADMIN_NAME } from "./supabase-config.js";

const overlay = document.getElementById("adminOverlay");
const closeBtn = document.getElementById("adminCloseBtn");

const authBox = document.getElementById("adminAuthBox");
const panel = document.getElementById("adminPanel");
const passInput = document.getElementById("adminPasswordInput");
const loginBtn = document.getElementById("adminLoginBtn");
const authStatus = document.getElementById("adminAuthStatus");
const adminStatus = document.getElementById("adminStatus");

const tabBtns = Array.from(document.querySelectorAll(".admin-tab"));
const tabSuggestions = document.getElementById("adminTabSuggestions");
const tabSupport = document.getElementById("adminTabSupport");
const tabBlocks = document.getElementById("adminTabBlocks");
const tabAnnouncements = document.getElementById("adminTabAnnouncements");

let adminPassword = ""; // kept only during the admin-login request; never sent after login

const URGENT_ARABIC_TTS_VOICES = [
  ["ar-EG-SalmaNeural", "Salma — Egyptian Arabic — Female"],
  ["ar-EG-ShakirNeural", "Shakir — Egyptian Arabic — Male"],
  ["ar-SA-ZariyahNeural", "Zariyah — Saudi Arabic — Female"],
  ["ar-SA-HamedNeural", "Hamed — Saudi Arabic — Male"],
  ["ar-AE-FatimaNeural", "Fatima — UAE Arabic — Female"],
  ["ar-AE-HamdanNeural", "Hamdan — UAE Arabic — Male"],
  ["ar-JO-SanaNeural", "Sana — Jordanian Arabic — Female"],
  ["ar-JO-TaimNeural", "Taim — Jordanian Arabic — Male"],
  ["ar-KW-NouraNeural", "Noura — Kuwaiti Arabic — Female"],
  ["ar-KW-FahedNeural", "Fahed — Kuwaiti Arabic — Male"],
  ["ar-QA-AmalNeural", "Amal — Qatari Arabic — Female"],
  ["ar-QA-MoazNeural", "Moaz — Qatari Arabic — Male"],
  ["ar-BH-LailaNeural", "Laila — Bahraini Arabic — Female"],
  ["ar-BH-AliNeural", "Ali — Bahraini Arabic — Male"],
  ["ar-IQ-RanaNeural", "Rana — Iraqi Arabic — Female"],
  ["ar-IQ-BasselNeural", "Bassel — Iraqi Arabic — Male"],
  ["ar-LB-LaylaNeural", "Layla — Lebanese Arabic — Female"],
  ["ar-LB-RamiNeural", "Rami — Lebanese Arabic — Male"],
  ["ar-MA-MounaNeural", "Mouna — Moroccan Arabic — Female"],
  ["ar-MA-JamalNeural", "Jamal — Moroccan Arabic — Male"],
  ["ar-OM-AyshaNeural", "Aysha — Omani Arabic — Female"],
  ["ar-OM-AbdullahNeural", "Abdullah — Omani Arabic — Male"],
  ["ar-SY-AmanyNeural", "Amany — Syrian Arabic — Female"],
  ["ar-SY-LaithNeural", "Laith — Syrian Arabic — Male"],
  ["ar-TN-ReemNeural", "Reem — Tunisian Arabic — Female"],
  ["ar-TN-HediNeural", "Hedi — Tunisian Arabic — Male"],
  ["ar-YE-MaryamNeural", "Maryam — Yemeni Arabic — Female"],
  ["ar-YE-SalehNeural", "Saleh — Yemeni Arabic — Male"]
];
const DEFAULT_URGENT_ARABIC_TTS_VOICE = "ar-EG-SalmaNeural";
function normalizeUrgentArabicVoice(v=""){
  const val = String(v || "").trim();
  return URGENT_ARABIC_TTS_VOICES.some(([id]) => id === val) ? val : DEFAULT_URGENT_ARABIC_TTS_VOICE;
}
function renderUrgentArabicVoiceOptions(selected=""){
  const active = normalizeUrgentArabicVoice(selected);
  return URGENT_ARABIC_TTS_VOICES.map(([id, label]) => `<option value="${id}"${id === active ? " selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function show(el){ el.style.display = "flex"; }
function hide(el){ el.style.display = "none"; }
function escapeHtml(s=""){ return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }
function fmtTime(ts){ try { return new Date(ts).toLocaleString(); } catch { return ""; } }
function setAuthStatus(t, type="info"){ authStatus.textContent=t||""; authStatus.dataset.type=type; }
function setAdminStatus(t, type="info"){ adminStatus.textContent=t||""; adminStatus.dataset.type=type; }

// Consistent per-user colors (matches Support UI)
function hueFromString(str = "") {
  let h = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}
function colorForUserId(userId = "") {
  const hue = hueFromString(userId);
  return `hsl(${hue}, 85%, 60%)`;
}

async function apiAdmin(path, body){
  const res = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

async function apiAdminLogin(password){
  const res = await fetch("/api/admin-login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_password: password }),
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data?.error || "Admin login failed");
  return data;
}

async function apiAdminLogout(){
  try {
    await fetch("/api/admin-logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}
}

function openAdmin(){
  // reset auth UI
  passInput.value = "";
  adminPassword = "";
  authBox.style.display = "block";
  panel.style.display = "none";
  setAuthStatus("");
  setAdminStatus("");
  show(overlay);
  setTimeout(()=>passInput.focus(), 50);
}

function closeAdmin(){
  adminPassword = "";
  try { passInput.value = ""; } catch {}
  apiAdminLogout();
  hide(overlay);
}

try {
  window.__srOpenAdminPanel = openAdmin;
  window.addEventListener("sr:open-admin", openAdmin);
} catch {}

closeBtn?.addEventListener("click", closeAdmin);
overlay?.addEventListener("click", (e)=>{ if(e.target===overlay) closeAdmin(); });
document.addEventListener("keydown", (e)=>{ if(e.key==="Escape" && overlay.style.display!=="none") closeAdmin(); });

loginBtn?.addEventListener("click", async ()=>{
  const p = (passInput.value || "").trim();
  if(!p) return;
  adminPassword = p;
  // quick auth check by calling list blocks endpoint (light)
  try{
    setAuthStatus("Checking…");
    await apiAdminLogin(p);
    adminPassword = "";
    try { passInput.value = ""; } catch {}
    await apiAdmin("/api/admin-ping", {});
    setAuthStatus("");
    authBox.style.display = "none";
    panel.style.display = "block";
    await refreshAll();
  }catch(err){
    console.error(err);
    adminPassword = "";
    setAuthStatus("Invalid password. Please contact Admin.", "error");
  }
});

tabBtns.forEach(btn=>{
  btn.addEventListener("click", ()=>{
    tabBtns.forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    tabSuggestions.style.display = (tab==="suggestions") ? "block" : "none";
    tabSupport.style.display = (tab==="support") ? "block" : "none";
    tabBlocks.style.display = (tab==="blocks") ? "block" : "none";
    if(tabAnnouncements) tabAnnouncements.style.display = (tab==="announcements") ? "block" : "none";
  });
});

async function refreshSuggestions(){
  const { data, error } = await supabase
    .from("suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if(error){
    tabSuggestions.innerHTML = `<div class="admin-empty">Could not load suggestions. Please contact ${ADMIN_NAME}.</div>`;
    return;
  }
  if(!data || data.length===0){
    tabSuggestions.innerHTML = `<div class="admin-empty">No suggestions yet.</div>`;
    return;
  }
  tabSuggestions.innerHTML = data.map(r => `
  <div class="admin-row">
    <div class="admin-row-main">
      <div class="admin-row-meta">${escapeHtml(fmtTime(r.created_at))} • ID ${escapeHtml(String(r.id))} • User ${escapeHtml(String(r.user_id || ""))}</div>
      <div class="admin-row-text">${escapeHtml(r.text || "")}</div>
    </div>
    <div class="admin-row-actions">
      <button class="admin-action" data-action="delete-suggestion" data-id="${escapeHtml(String(r.id))}">Delete</button>
      <button class="admin-action danger" data-action="delete-block-suggestion" data-id="${escapeHtml(String(r.id))}" data-user="${escapeHtml(String(r.user_id||""))}">Delete + Block</button>
    </div>
  </div>
`).join("");

tabSuggestions.querySelectorAll("button[data-action='delete-suggestion']").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-id");
    if(!id) return;
    try{
      setAdminStatus("Deleting…");
      await apiAdmin("/api/admin-delete", { table: "suggestions", id: Number(id) });
      setAdminStatus("Deleted ✅");
      await refreshSuggestions();
      window.dispatchEvent(new CustomEvent("sr:suggestions-changed"));
    }catch(err){
      console.error(err);
      setAdminStatus(`Could not delete. Please contact ${ADMIN_NAME}.`, "error");
    }
  });
});

tabSuggestions.querySelectorAll("button[data-action='delete-block-suggestion']").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    const id = btn.getAttribute("data-id");
    const userId = btn.getAttribute("data-user");
    if(!id) return;
    if(!userId){
      setAdminStatus("Missing user id on this record. Please contact Admin.", "error");
      return;
    }
    const minutesStr = prompt("Block duration in minutes:", "60");
    if(!minutesStr) return;
    const minutes = Number(minutesStr);
    if(!Number.isFinite(minutes) || minutes <= 0) return;

    try{
      setAdminStatus("Blocking…");
      const out = await apiAdmin("/api/admin-block", { user_id: userId, minutes });
      setAdminStatus(`Blocked until ${fmtTime(out.expires_at)}. Deleting…`);
      await apiAdmin("/api/admin-delete", { table: "suggestions", id: Number(id) });
      setAdminStatus(`Deleted + Blocked until ${fmtTime(out.expires_at)} ✅`);
      await refreshSuggestions();
      window.dispatchEvent(new CustomEvent("sr:suggestions-changed"));
      await refreshBlocks();
    }catch(err){
      console.error(err);
      setAdminStatus(`Could not apply action. Please contact ${ADMIN_NAME}.`, "error");
    }
  });
});

}

async function refreshSupport(){
  const { data, error } = await supabase
    .from("support_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    tabSupport.innerHTML = `<div class="admin-empty">Could not load chat messages. Please contact ${ADMIN_NAME}.</div>`;
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  const publicMsgs = rows.filter((r) => r && r.room_type === "public");
  const privateMsgs = rows.filter((r) => r && r.room_type !== "public");

  function renderBulkBar(groupKey, title) {
    return `
      <div class="admin-bulkbar" data-group="${escapeHtml(groupKey)}">
        <span class="admin-bulk-title">${escapeHtml(title)}</span>
        <button class="admin-bulkbtn" type="button" data-bulk="select-all" data-group="${escapeHtml(groupKey)}">Select all</button>
        <button class="admin-bulkbtn" type="button" data-bulk="clear" data-group="${escapeHtml(groupKey)}">Clear</button>
        <button class="admin-bulkbtn danger" type="button" data-bulk="delete-selected" data-group="${escapeHtml(groupKey)}">Delete selected</button>
        <span class="admin-bulk-count" data-count-for="${escapeHtml(groupKey)}"></span>
      </div>
    `;
  }

  function renderRows(list, groupKey) {
    if (!list || list.length === 0) {
      return `<div class="admin-empty">No messages.</div>`;
    }
    return list
      .map(
        (r) => `
      <div class="admin-row" data-group="${escapeHtml(groupKey)}">
        <label class="admin-check" title="Select">
          <input class="admin-msg-check" type="checkbox" data-group="${escapeHtml(groupKey)}" data-id="${escapeHtml(String(r.id))}" />
        </label>
        <div class="admin-row-main">
          <div class="admin-row-meta">
            ${escapeHtml(fmtTime(r.created_at))} • ${escapeHtml(r.room_id)} •
            <b>${escapeHtml(r.sender_name || "User")}</b> (${escapeHtml(r.sender_id || "")})
          </div>
          <div class="admin-row-text">${escapeHtml(r.message || "")}</div>
        </div>
        <div class="admin-row-actions">
          <button class="admin-action" type="button" data-action="delete-chat" data-id="${escapeHtml(String(r.id))}">Delete</button>
          <button class="admin-action danger" type="button" data-action="block-user" data-user="${escapeHtml(String(r.sender_id || ""))}">Block</button>
        </div>
      </div>
    `
      )
      .join("");
  }

  // --- Optional: user profiles (names + Step 4.3 device-confidence summary) ---
  let userProfilesHtml = `<div class="admin-empty">User names table not configured (optional).</div>`;
  try {
    const deviceData = await apiAdmin("/api/admin-device-profiles", {});
    const rows = Array.isArray(deviceData?.rows) ? deviceData.rows : [];
    if (rows.length === 0) {
      userProfilesHtml = `<div class="admin-empty">No saved user names yet.</div>`;
    } else {
      userProfilesHtml = rows
        .map((u) => {
          const col = colorForUserId(u.user_id || "");
          const reset = !!u.nickname_reset_required;
          const nameLabel = reset ? "Needs new nickname" : (u.display_name || "User");
          const dev = u.device || {};
          const summary = dev.summary || {};
          const conf = Number(dev.best_confidence || 0);
          const confLabel = conf ? `${conf}%` : "not learned yet";
          const activeDevices = Number(dev.active || 0);
          const lastSeen = dev.last_seen_at ? fmtTime(dev.last_seen_at) : "not seen yet";
          const details = [
            summary.platform || "",
            summary.screen ? `screen ${summary.screen}` : "",
            summary.timezone || "",
            summary.graphics || "",
            summary.network ? `net ${summary.network}` : "",
            summary.media_devices ? `media ${summary.media_devices}` : "",
          ].filter(Boolean).join(" • ");
          return `
            <div class="admin-row">
              <div class="admin-row-main">
                <div class="admin-row-meta">
                  <span class="admin-color-dot" style="--u:${escapeHtml(col)}"></span>
                  <b>${escapeHtml(nameLabel)}</b> • ${escapeHtml(u.user_id || "")}
                  ${reset ? '<span style="margin-inline-start:8px;opacity:.8;">reset pending</span>' : ''}
                </div>
                <div class="admin-row-text" style="opacity:.82;font-size:12px;line-height:1.55;">
                  Device confidence: <b>${escapeHtml(confLabel)}</b> • Active devices: ${escapeHtml(String(activeDevices))} • Last seen: ${escapeHtml(lastSeen)}
                  ${dev.device_short ? ` • Signature: ${escapeHtml(dev.device_short)}` : ""}
                  ${details ? `<br>${escapeHtml(details)}` : ""}
                </div>
              </div>
              <div class="admin-row-actions">
                <button class="admin-action" type="button" data-action="delete-username" data-user-id="${escapeHtml(u.user_id || "")}">Reset nickname</button>
              </div>
            </div>
          `;
        })
        .join("");
    }
    if(deviceData && deviceData.devices_available === false){
      userProfilesHtml += `<div class="admin-empty" style="margin-top:8px;">Device confidence SQL is not installed yet.</div>`;
    }
  } catch (e) {
    userProfilesHtml = `<div class="admin-empty">Could not load user names/device confidence: ${escapeHtml(e?.message || String(e || ""))}</div>`;
  }

  tabSupport.innerHTML = `
    <div style="margin:6px 0 12px; font-weight:800;">Public Support</div>
    ${renderBulkBar("public", "Bulk")}
    <div id="adminPublicSupportList">${renderRows(publicMsgs, "public")}</div>

    <hr style="opacity:0.15;margin:16px 0;" />

    <div style="margin:6px 0 12px; font-weight:800;">Private Support (DM)</div>
    ${renderBulkBar("private", "Bulk")}
    <div id="adminPrivateSupportList">${renderRows(privateMsgs, "private")}</div>

    <hr style="opacity:0.15;margin:16px 0;" />

    <div style="margin:6px 0 12px; font-weight:800;">User Names (Public)</div>
    <div id="adminSupportUsersList">${userProfilesHtml}</div>
  `;

  // ----- Single row actions -----
  tabSupport.querySelectorAll("button[data-action='delete-chat']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      if (!id) return;
      try {
        setAdminStatus("Deleting…");
        await apiAdmin("/api/admin-delete", { table: "support_messages", id: Number(id) });
        setAdminStatus("Deleted ✅");
        await refreshSupport();
      } catch (err) {
        console.error(err);
        setAdminStatus(`Could not delete. Please contact ${ADMIN_NAME}.`, "error");
      }
    });
  });

  tabSupport.querySelectorAll("button[data-action='block-user']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const userId = btn.getAttribute("data-user");
      if (!userId) return;
      const minutesStr = prompt("Block duration in minutes:", "60");
      if (!minutesStr) return;
      const minutes = Number(minutesStr);
      if (!Number.isFinite(minutes) || minutes <= 0) return;

      try {
        setAdminStatus("Blocking…");
        const out = await apiAdmin("/api/admin-block", { user_id: userId, minutes });
        setAdminStatus(`Blocked until ${fmtTime(out.expires_at)} ✅`);
        await refreshBlocks();
      } catch (err) {
        console.error(err);
        setAdminStatus(`Could not block user. Please contact ${ADMIN_NAME}.`, "error");
      }
    });
  });

  tabSupport.querySelectorAll("button[data-action='delete-username']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uid = btn.getAttribute("data-user-id");
      if (!uid) return;
      const ok = confirm(`Delete name for user_id\n${uid}\n\nThis forces the user to choose a new name next time.`);
      if (!ok) return;
      try {
        setAdminStatus("Resetting nickname…");
        await apiAdmin("/api/admin-delete-support-user", { user_id: uid });
        setAdminStatus("Nickname reset ✅");
        await refreshSupport();
      } catch (err) {
        console.error(err);
        setAdminStatus(`Could not reset nickname. Please contact ${ADMIN_NAME}.`, "error");
      }
    });
  });

  // ----- Bulk actions -----
  function updateBulkCount(groupKey) {
    const checks = Array.from(tabSupport.querySelectorAll(`input.admin-msg-check[data-group='${groupKey}']`));
    const selected = checks.filter((c) => c.checked).length;
    const el = tabSupport.querySelector(`.admin-bulk-count[data-count-for='${groupKey}']`);
    if (el) el.textContent = selected ? `${selected} selected` : "";
  }

  ["public", "private"].forEach((g) => {
    tabSupport.querySelectorAll(`input.admin-msg-check[data-group='${g}']`).forEach((c) => {
      c.addEventListener("change", () => updateBulkCount(g));
    });
    updateBulkCount(g);
  });

  tabSupport.querySelectorAll("button[data-bulk='select-all']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-group") || "";
      tabSupport.querySelectorAll(`input.admin-msg-check[data-group='${g}']`).forEach((c) => (c.checked = true));
      updateBulkCount(g);
    });
  });

  tabSupport.querySelectorAll("button[data-bulk='clear']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const g = btn.getAttribute("data-group") || "";
      tabSupport.querySelectorAll(`input.admin-msg-check[data-group='${g}']`).forEach((c) => (c.checked = false));
      updateBulkCount(g);
    });
  });

  tabSupport.querySelectorAll("button[data-bulk='delete-selected']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const g = btn.getAttribute("data-group") || "";
      const ids = Array.from(tabSupport.querySelectorAll(`input.admin-msg-check[data-group='${g}']`))
        .filter((c) => c.checked)
        .map((c) => Number(c.getAttribute("data-id")))
        .filter((n) => Number.isFinite(n));
      if (ids.length === 0) return;
      const ok = confirm(`Delete ${ids.length} messages?`);
      if (!ok) return;
      try {
        setAdminStatus("Bulk deleting…");
        await apiAdmin("/api/admin-bulk-delete", { table: "support_messages", ids });
        setAdminStatus("Bulk delete ✅");
        await refreshSupport();
      } catch (err) {
        console.error(err);
        // Fallback: delete one by one
        try {
          for (const id of ids) {
            await apiAdmin("/api/admin-delete", { table: "support_messages", id });
          }
          setAdminStatus("Bulk delete ✅");
          await refreshSupport();
        } catch (err2) {
          console.error(err2);
          setAdminStatus(`Could not bulk delete. Please contact ${ADMIN_NAME}.`, "error");
        }
      }
    });
  });
}

async function refreshBlocks(){
  // The blocks table schema can vary across deployments.
  // Preferred column: expires_at
  // Compat/legacy column: blocked_until
  let res = await supabase
    .from("blocks")
    .select("*")
    .order("expires_at", { ascending: false })
    .limit(200);

  if(res.error && (String(res.error.message || "").includes("expires_at") || String(res.error.details || "").includes("expires_at"))) {
    res = await supabase
      .from("blocks")
      .select("*")
      .order("blocked_until", { ascending: false })
      .limit(200);
  }

  const data = res.data;
  const error = res.error;

  if(error){
    tabBlocks.innerHTML = `<div class="admin-empty">Could not load blocks. Please contact ${ADMIN_NAME}.</div>`;
    return;
  }
  if(!data || data.length===0){
    tabBlocks.innerHTML = `<div class="admin-empty">No active blocks.</div>`;
    return;
  }

  tabBlocks.innerHTML = data.map(r => {
    const until = r.expires_at || r.blocked_until || "";
    return `
    <div class="admin-row">
      <div class="admin-row-main">
        <div class="admin-row-meta">
          User: <b>${escapeHtml(r.user_id||"")}</b> • Until: ${escapeHtml(fmtTime(until))}
        </div>
        <div class="admin-row-text">${escapeHtml(r.reason || "")}</div>
      </div>
      <div class="admin-row-actions">
        <button class="admin-action" data-action="unblock" data-user="${escapeHtml(r.user_id||"")}">Unblock</button>
      </div>
    </div>
  `;
  }).join("");

  tabBlocks.querySelectorAll("button[data-action='unblock']").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const userId = btn.getAttribute("data-user");
      if(!userId) return;
      try{
        setAdminStatus("Unblocking…");
        await apiAdmin("/api/admin-unblock", { user_id: userId });
        setAdminStatus("Unblocked ✅");
        await refreshBlocks();
      }catch(err){
        console.error(err);
        setAdminStatus(`Could not unblock. Please contact ${ADMIN_NAME}.`, "error");
      }
    });
  });
}

async function refreshAll(){
  await refreshSuggestions();
  await refreshSupport();
  await refreshBlocks();
  await refreshAnnouncements();
}

async function refreshAnnouncements(){
  if(!tabAnnouncements) return;

  // Fetch latest announcement via server (service role) so Admin works even if RLS hides the table.
  // Supports both legacy single-text format and the newer { envelope, urgent, urgent_enabled } JSON format.
  let current = { envelope_text: "", urgent_text: "", urgent_enabled: false, urgent_voice: DEFAULT_URGENT_ARABIC_TTS_VOICE, created_at: null, text: "" };

  try{
    const res = await fetch("/api/admin-announcement", { method: "GET" });
    const data = await res.json().catch(()=>({}));
    if(res.ok){
      current = {
        envelope_text: String(data?.envelope_text ?? data?.text ?? ""),
        urgent_text: String(data?.urgent_text ?? ""),
        urgent_enabled: !!(data?.urgent_enabled),
        urgent_voice: normalizeUrgentArabicVoice(data?.urgent_voice),
        created_at: data?.created_at || null,
        text: String(data?.text ?? "")
      };
    }
  }catch(e){
    // Fallback to direct Supabase read (best-effort)
    try{
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if(!error && Array.isArray(data) && data.length > 0){
        const item = data[0] || {};
        const raw = String(item.text || "");
        let envelope_text = "";
        let urgent_text = "";
        let urgent_enabled = false;
        let urgent_voice = DEFAULT_URGENT_ARABIC_TTS_VOICE;

        try{
          const obj = JSON.parse(raw);
          if(obj && typeof obj === "object"){
            envelope_text = String(obj.envelope || "");
            urgent_text = String(obj.urgent || "");
            urgent_enabled = !!obj.urgent_enabled;
            urgent_voice = normalizeUrgentArabicVoice(obj.urgent_voice);
          }else{
            envelope_text = raw;
          }
        }catch{
          const prefix = "URGENT_TICKER::";
          if(raw.startsWith(prefix)){
            urgent_enabled = true;
            urgent_text = raw.slice(prefix.length).trim();
          }else{
            envelope_text = raw;
          }
        }
        current = { envelope_text, urgent_text, urgent_enabled, urgent_voice: normalizeUrgentArabicVoice(urgent_voice), created_at: item.created_at || null, text: raw };
      }
    }catch(_){}
  }

  const when = current.created_at ? fmtTime(current.created_at) : "";
  const lastEnvelope = String(current.envelope_text || "").trim();
  const lastUrgent = String(current.urgent_text || "").trim();
  const lastUrgentEnabled = !!current.urgent_enabled;
  const lastUrgentVoice = normalizeUrgentArabicVoice(current.urgent_voice);

  tabAnnouncements.innerHTML = `
    <div class="admin-row">
      <div class="admin-row-main">
        <div class="admin-row-meta">${when ? `Last update at ${escapeHtml(when)}` : "No announcement posted"}</div>
        <div class="admin-row-text"><b>Envelope message:</b><br>${escapeHtml(lastEnvelope) || "<span style='opacity:.6'>(empty)</span>"}</div>
        <div class="admin-row-text" style="margin-top:10px;"><b>Urgent moving banner:</b> ${lastUrgentEnabled ? "<span style='color:#00e676'>(enabled)</span>" : "<span style='opacity:.7'>(disabled)</span>"}<br>${escapeHtml(lastUrgent) || "<span style='opacity:.6'>(empty)</span>"}</div>
      </div>
    </div>

    <div class="admin-row">
      <div class="admin-row-main">
        <div style="font-weight:700;margin-bottom:6px;">Envelope message (shows inside the envelope)</div>
        <textarea id="adminAnnouncementEnvelopeInput" class="admin-input" rows="4" placeholder="Write envelope message..."></textarea>

        <div style="font-weight:700;margin-top:14px;margin-bottom:6px;">Urgent moving banner (right → left)</div>
        <textarea id="adminAnnouncementUrgentInput" class="admin-input" rows="3" placeholder="Write urgent message..."></textarea>

        <div style="font-weight:700;margin-top:10px;margin-bottom:6px;">Arabic voice for urgent reading</div>
        <select id="adminAnnouncementUrgentVoiceSelect" class="admin-input" style="height:42px;cursor:pointer;">
          ${renderUrgentArabicVoiceOptions(lastUrgentVoice)}
        </select>
        <div style="font-size:12px;opacity:.75;margin-top:6px;">Free Edge TTS voice used only when the urgent message contains Arabic.</div>

        <label class="admin-check" style="margin-top:10px;">
          <input type="checkbox" id="adminAnnouncementUrgentChk" />
          <span>Enable urgent moving banner (will not disappear until user clicks “فهمت”)</span>
        </label>
      </div>
      <div class="admin-row-actions">
        <button id="adminAnnouncementSaveBtn" class="admin-action">Save</button>
      </div>
    </div>
  `;

  const envInput = tabAnnouncements.querySelector("#adminAnnouncementEnvelopeInput");
  if(envInput) envInput.value = lastEnvelope;

  const urgInput = tabAnnouncements.querySelector("#adminAnnouncementUrgentInput");
  if(urgInput) urgInput.value = lastUrgent;

  const urgentChk = tabAnnouncements.querySelector("#adminAnnouncementUrgentChk");
  if(urgentChk) urgentChk.checked = lastUrgentEnabled;

  const urgentVoiceSelect = tabAnnouncements.querySelector("#adminAnnouncementUrgentVoiceSelect");
  if(urgentVoiceSelect) urgentVoiceSelect.value = lastUrgentVoice;

  const saveBtn = tabAnnouncements.querySelector("#adminAnnouncementSaveBtn");
  if(saveBtn){
    saveBtn.addEventListener("click", async ()=>{
      const envelopeVal = (envInput?.value || "").trim();
      const urgentVal = (urgInput?.value || "").trim();
      const urgentOn = !!urgentChk?.checked;
      const urgentVoice = normalizeUrgentArabicVoice(urgentVoiceSelect?.value);

      if(!envelopeVal && !(urgentOn && urgentVal)){
        setAdminStatus("Write an envelope message or enable urgent with a message.", "warn");
        return;
      }
      if(urgentOn && !urgentVal){
        setAdminStatus("Urgent banner is enabled but its message is empty.", "warn");
        return;
      }

      try{
        setAdminStatus("Saving…");
        await apiAdmin("/api/admin-announcement", {
          envelope_text: envelopeVal,
          urgent_text: urgentVal,
          urgent_enabled: urgentOn,
          urgent_voice: urgentVoice
        });
        setAdminStatus("Saved ✅");
        await refreshAnnouncements();
      }catch(err){
        console.error(err);
        setAdminStatus(`Could not save announcement. ${String(err?.message||"")}`, "error");
      }
    });
  }
}

// ---------- Hidden trigger: click logo 5 times ----------
let clickCount = 0;
let clickTimer = null;

function armLogo(el){
  if(!el || el.dataset.adminBound === "1") return;
  el.dataset.adminBound = "1";
  try {
    el.style.cursor = "pointer";
    el.style.pointerEvents = "auto";
    el.setAttribute("title", "Click 5 times to open Admin");
  } catch(e){}
  el.addEventListener("click", (evt)=>{
    try { evt.stopPropagation(); } catch(e){}
    clickCount += 1;
    if(clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(()=>{ clickCount = 0; }, 1800);
    if(clickCount >= 5){
      clickCount = 0;
      openAdmin();
    }
  });
}

function findAndArm(){
  // Required: open Admin by clicking the UA07 logo 5 times.
  // The UA07 logo is injected by app.js with id MNDO_UA07_LOGO3.
  const logoWrap =
    document.getElementById("UA07_LUX_LOGO_BETWEEN") ||
    document.getElementById("MNDO_UA07_LOGO3") ||
    document.getElementById("MNDO_UA07_LOGO");

  if(!logoWrap) return;

  // Support both the old SVG logo and the new image-based logo.
  const clickTarget =
    logoWrap.querySelector(".mndo-uwk07-logo-img") ||
    logoWrap.querySelector("img") ||
    logoWrap.querySelector("svg") ||
    logoWrap;

  try {
    logoWrap.style.pointerEvents = "auto";
    logoWrap.style.cursor = "pointer";
    clickTarget.style.pointerEvents = "auto";
    clickTarget.style.cursor = "pointer";
  } catch(e){}

  armLogo(logoWrap);
  if(clickTarget !== logoWrap) armLogo(clickTarget);
}

findAndArm();
setInterval(findAndArm, 800);