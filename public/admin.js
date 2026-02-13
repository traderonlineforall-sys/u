
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

let adminPassword = "";

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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, admin_password: adminPassword }),
  });
  const data = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(data?.error || "Request failed");
  return data;
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
  hide(overlay);
}

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

  // --- Optional: user profiles (names) ---
  let userProfilesHtml = `<div class="admin-empty">User names table not configured (optional).</div>`;
  try {
    const resUsers = await supabase
      .from("support_users")
      .select("user_id, display_name")
      .order("display_name", { ascending: true })
      .limit(500);
    if (!resUsers.error && Array.isArray(resUsers.data)) {
      if (resUsers.data.length === 0) {
        userProfilesHtml = `<div class="admin-empty">No saved user names yet.</div>`;
      } else {
        userProfilesHtml = resUsers.data
          .map((u) => {
            const col = colorForUserId(u.user_id || "");
            return `
              <div class="admin-row">
                <div class="admin-row-main">
                  <div class="admin-row-meta">
                    <span class="admin-color-dot" style="--u:${escapeHtml(col)}"></span>
                    <b>${escapeHtml(u.display_name || "User")}</b> • ${escapeHtml(u.user_id || "")}
                  </div>
                </div>
                <div class="admin-row-actions">
                  <button class="admin-action" type="button" data-action="delete-username" data-user-id="${escapeHtml(u.user_id || "")}">Delete name</button>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }
  } catch {}

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
        setAdminStatus("Deleting name…");
        await apiAdmin("/api/admin-delete-support-user", { user_id: uid });
        setAdminStatus("Deleted name ✅");
        await refreshSupport();
      } catch (err) {
        console.error(err);
        setAdminStatus(`Could not delete name. Please contact ${ADMIN_NAME}.`, "error");
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
  // Fetch latest announcement via serverless function (uses service role on the server).
  // This makes the admin UI work even if announcements are not publicly readable by RLS.
  let current = { text: "", created_at: null };
  try{
    const res = await fetch("/api/admin-announcement", { method: "GET" });
    const data = await res.json().catch(()=>({}));
    if(res.ok){
      current = { text: String(data?.text || ""), created_at: data?.created_at || null };
    }
  }catch(e){
    // Fallback to direct Supabase read (best-effort)
    try{
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1);
      if(!error && Array.isArray(data) && data.length > 0) current = data[0] || current;
    }catch(_){}
  }
  const when = current.created_at ? fmtTime(current.created_at) : "";
  const message = current.text || "";
  // Build UI
  tabAnnouncements.innerHTML = `
    <div class="admin-row">
      <div class="admin-row-main">
        <div class="admin-row-meta">${when ? `Last announcement at ${escapeHtml(when)}` : "No announcement posted"}</div>
        <div class="admin-row-text">${escapeHtml(message) || ""}</div>
      </div>
    </div>
    <div class="admin-row">
      <div class="admin-row-main">
        <textarea id="adminAnnouncementInput" class="admin-input" rows="4" placeholder="Write a new announcement..."></textarea>
      </div>
      <div class="admin-row-actions">
        <button id="adminAnnouncementSaveBtn" class="admin-action">Save</button>
      </div>
    </div>
  `;
  // Set initial value of textarea to current message for convenience
  const input = tabAnnouncements.querySelector("#adminAnnouncementInput");
  if(input) input.value = message;
  const saveBtn = tabAnnouncements.querySelector("#adminAnnouncementSaveBtn");
  if(saveBtn){
    saveBtn.addEventListener("click", async ()=>{
      const val = (input?.value || "").trim();
      if(!val){
        setAdminStatus("Please write a message before saving.", "warn");
        return;
      }
      try{
        setAdminStatus("Saving…");
        await apiAdmin("/api/admin-announcement", { text: val });
        setAdminStatus("Saved ✅");
        await refreshAnnouncements();
      }catch(err){
        console.error(err);
        setAdminStatus(`Could not save announcement. Please contact ${ADMIN_NAME}.`, "error");
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
  el.style.cursor = "pointer";
  el.addEventListener("click", ()=>{
    clickCount += 1;
    if(clickTimer) clearTimeout(clickTimer);
    clickTimer = setTimeout(()=>{ clickCount = 0; }, 1200);
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

  // NOTE: The logo wrapper is styled with `pointer-events: none` in CSS.
  // To keep the layout and avoid blocking other UI, we arm the inner SVG
  // and force it to be clickable.
  const clickTarget = logoWrap.querySelector("svg") || logoWrap;
  try { clickTarget.style.pointerEvents = "auto"; } catch(e){}
  armLogo(clickTarget);
}

findAndArm();
setInterval(findAndArm, 800);