
/* Inject visual-only CSS for header + tabs (keeps everything else original) */
(function(){
  try {
    var id = "mndo-header-tabs-style";
    var old = document.getElementById(id);
    if(old) old.remove();
    var s = document.createElement("style");
    s.id = id;
    s.textContent = "/* === HEADER + TABS (EXACT POLISH SAFE LOOK) \u2014 VISUAL ONLY === */\n:root{\n  --mndo-radius: 14px;\n  --mndo-radius-pill: 999px;\n  --mndo-border: rgba(255,255,255,.14);\n  --mndo-border-strong: rgba(255,255,255,.22);\n  --mndo-bg-soft: rgba(255,255,255,.06);\n  --mndo-bg-soft-2: rgba(255,255,255,.09);\n  --mndo-shadow: 0 14px 40px rgba(0,0,0,.42);\n  --mndo-shadow-soft: 0 10px 26px rgba(0,0,0,.30);\n  --mndo-focus: rgba(124,124,255,.35);\n  --mndo-focus-2: rgba(94,234,212,.25);\n}\n\n/* Inputs (only top header inputs) */\n#arabiccNumber, #arabicNumber, #searchInput {\n  border-radius: var(--mndo-radius-pill);\n  border: 1px solid var(--mndo-border);\n  background: var(--mndo-bg-soft);\n  color: rgba(255,255,255,.92);\n  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);\n  transition: box-shadow .16s ease, border-color .16s ease, transform .16s ease;\n}\n#arabiccNumber, #arabicNumber, #searchInput::placeholder {\n  color: rgba(255,255,255,.55);\n}\n#arabiccNumber, #arabicNumber, #searchInput:focus {\n  outline: none;\n  border-color: var(--mndo-border-strong);\n  box-shadow: 0 0 0 3px var(--mndo-focus), 0 10px 24px rgba(0,0,0,.25);\n}\n\n/* Prevent Chrome autofill from turning search white */\n#arabiccNumber, #arabicNumber, #searchInput:-webkit-autofill,\n#arabiccNumber, #arabicNumber, #searchInput:-webkit-autofill:hover,\n#arabiccNumber, #arabicNumber, #searchInput:-webkit-autofill:focus {\n  -webkit-text-fill-color: inherit;\n  transition: background-color 9999s ease-out 0s;\n  box-shadow: 0 0 0px 1000px rgba(0,0,0,0) inset;\n}\n\n/* Buttons + Tabs (only top header actions + tab buttons) */\n#copyBtn, #copyBtn1, #tabs .tablinks, a.RSR2 {\n  border-radius: var(--mndo-radius-pill);\n  border: 1px solid var(--mndo-border);\n  box-shadow: var(--mndo-shadow-soft);\n  transition: transform .14s ease, box-shadow .14s ease, filter .14s ease;\n}\n#copyBtn, #copyBtn1, #tabs .tablinks, a.RSR2:hover {\n  transform: translateY(-1px);\n  filter: brightness(1.05);\n  box-shadow: 0 16px 36px rgba(0,0,0,.38);\n}\n#copyBtn, #copyBtn1, #tabs .tablinks, a.RSR2:active {\n  transform: translateY(0px) scale(.99);\n  box-shadow: 0 10px 22px rgba(0,0,0,.30);\n}\n\n/* Tabs: keep original layout but polish edges */\n#tabs {\n  border-radius: var(--mndo-radius);\n}\n#tabs .tablinks {\n  border-radius: 12px;\n}";
    document.head.appendChild(s);
  } catch(e) {}
})();



/* Fix: search results dropdown should not get covered by the tabs row (and should not overflow/cover the right tabs) */
(function(){
  try{
    var id="mndo-search-dropdown-fix";
    var old=document.getElementById(id);
    if(old) old.remove();
    var s=document.createElement("style");
    s.id=id;
    s.textContent = `
/* Ensure dropdown stacks above tabs/modals */
.search-container{ position: relative !important; z-index: 2147483646 !important; }
#searchResults, .search-results{
  z-index: 2147483647 !important;
  width: 100% !important;
  box-sizing: border-box !important;
  margin-top: 8px !important;
}
/* Keep tabs below dropdown (without changing look) */
#tabs{ position: relative; z-index: 5; }
`;
    document.head.appendChild(s);
  }catch(e){}
})();



(function() {
  function pickSearchInput() {
    var candidates = Array.from(document.querySelectorAll('input[type="search"], input[id*="search" i], input[class*="search" i]'));
    if (!candidates.length) return null;

    // Prefer the one that looks like the main global search (center/top)
    function score(el) {
      var s = 0;
      var ph = (el.getAttribute('placeholder') || '').toLowerCase();
      var id = (el.id || '').toLowerCase();
      var cl = (el.className || '').toString().toLowerCase();
      if (ph.includes('search') || ph.includes('بحث') || ph.includes('ابحث')) s += 5;
      if (id.includes('search')) s += 3;
      if (cl.includes('search')) s += 2;

      // Prefer wider inputs
      var r = el.getBoundingClientRect();
      if (r.width > 250) s += 2;
      if (r.width > 350) s += 2;

      // Prefer inputs near the top
      if (r.top < 120) s += 2;
      if (r.top < 60) s += 2;

      return s;
    }

    candidates.sort(function(a,b){ return score(b)-score(a); });
    return candidates[0] || null;
  }

  function apply() {
    var input = pickSearchInput();
    if (!input) return;

    var container = input.closest('.search-container') || input.parentElement;
    if (container) {
      container.style.marginTop = '0px';
      container.style.paddingTop = '4px';
    }

    // Nudge the nearest header wrapper up if there's empty top space
    var header = input.closest('header, .top-bar, .header-wrapper, .header, .topHeader');
    if (header) {
      header.style.marginTop = '0px';
      header.style.paddingTop = '4px';
    }

    // Final nudge: if still not at top, translate the container up by the extra gap (max 40px)
    try {
      var el = (container || input);
      // Reset any previous nudge (important for BFCache/tab restore)
      el.style.top = '0px';
      el.style.position = '';
      el.style.transform = '';
      el.style.marginTop = '';
      var rect = (container || input).getBoundingClientRect();
      var gap = rect.top - 8; // keep a tiny breathing room
      if (gap > 4 && gap < 45) {
        (container || input).style.transform = '';
        (container || input).style.position = 'relative';
        (container || input).style.top = (-gap) + 'px';
        (container || input).style.marginTop = '';
      }
    } catch(e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }
  // Re-apply shortly after in case the header renders late
  setTimeout(apply, 250);
  setTimeout(apply, 800);

  // Keep AHT / Tags / header icons stable when the tab was inactive (BFCache/visibility)
  // - Browsers may pause rAF/timers in background tabs, and restore pages from BFCache without a full reload.
  // - Web fonts can also load late and cause layout shifts.
  var __mndoApplyT = null;
  function __mndoScheduleApply(){
    try{ apply(); }catch(e){}
    // Run again after the next paint + a short delay to catch late fonts/layout
    try{ requestAnimationFrame(function(){ try{ apply(); }catch(e){} }); }catch(e){}
    setTimeout(function(){ try{ apply(); }catch(e){} }, 120);
  }

  window.addEventListener("pageshow", function(){
    setTimeout(__mndoScheduleApply, 0);
  });

  document.addEventListener("visibilitychange", function(){
    if(!document.hidden){
      setTimeout(__mndoScheduleApply, 60);
    }
  });

  window.addEventListener("resize", function(){
    if(__mndoApplyT) clearTimeout(__mndoApplyT);
    __mndoApplyT = setTimeout(__mndoScheduleApply, 120);
  });

  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){
      setTimeout(__mndoScheduleApply, 50);
    }).catch(function(){});
  }
})();



/* === ONLY INPUTS LOGIC (STRONG) ===
- If landline (bottom) is cleared -> clear FBB (top) automatically.
- Also wraps convertNumber() so even if it refills FBB after clearing, we wipe it.
*/
(function(){
  const landlineId = "arabicNumber";   // bottom
  const fbbId      = "arabiccNumber";  // top
  const get = (id)=>document.getElementById(id);

  function isEmpty(v){
    return (v == null) || (String(v).replace(/\s+/g,'') === "");
  }

  function fbbHasRealNumber(v){
    // treat "FBB" alone (or "FBB " / "FBB\t") as empty
    const s = String(v || "");
    const stripped = s.replace(/\s+/g,'');
    if(stripped === "") return false;
    if(/^FBB$/i.test(stripped)) return false;
    if(/^FBB\d*$/i.test(stripped)) return stripped.length > 3; // has digits
    return true;
  }

  function enforceClear(){
    const l = get(landlineId);
    const t = get(fbbId);
    if(!l || !t) return;

    const landEmpty = isEmpty(l.value);
    const tv = t.value || "";

    if(landEmpty){
      if(!isEmpty(tv)){
        t.value = "";
        // trigger any listeners inside the tool
        t.dispatchEvent(new Event("input", {bubbles:true}));
        t.dispatchEvent(new Event("change", {bubbles:true}));
        try{ t.dispatchEvent(new KeyboardEvent("keyup", {bubbles:true, key:"Backspace"})); }catch(e){}
      }
    }
  }

  function bind(){
    const l = get(landlineId);
    const t = get(fbbId);
    if(!l || !t) return false;

    const afterTick = ()=>setTimeout(enforceClear, 0); // run after inline handlers
    ["input","keyup","change","blur"].forEach(evt=>{
      l.addEventListener(evt, afterTick, {passive:true});
    });

    // Wrap convertNumber if exists (it's the function that sets FBB = "FBB" + englishNumber)
    function tryWrap(){
      const fn = window.convertNumber;
      if(typeof fn === "function" && !fn.__mndoWrapped){
        const wrapped = function(){
          try{ return fn.apply(this, arguments); }
          finally{ enforceClear(); }
        };
        wrapped.__mndoWrapped = true;
        window.convertNumber = wrapped;
      }
    }
    tryWrap();
    setInterval(tryWrap, 200);

    // safety net (if any other code refills FBB later)
    setInterval(enforceClear, 60);

    // run once
    enforceClear();
    return true;
  }

  // Wait until tool DOM exists (because it's created via document.write)
  const timer = setInterval(()=>{
    if(bind()){
      clearInterval(timer);
    }
  }, 60);
})();



/* TT + SR buttons next to Copy (no layout changes, no tool logic changes) */
(function(){
  const BASE_TT = "https://bss.te.eg:12900/csp/pbh/business.action?BMEBusiness=pbhRelativeProcess&subsNumber=";
  const BASE_SR = "https://bss.te.eg:12900/csp/pbh/business.action?BMEBusiness=srQueryAction&subsNumber=";

  function openLink(base, val){
    const v = (val || "").trim();
    window.open(base + encodeURIComponent(v), "_blank");
  }

  function fmtDDMMYYYY(d){
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return dd + '/' + mm + '/' + yyyy;
  }

  function startTimeSevenMonthsBack(){
    const d = new Date();
    d.setMonth(d.getMonth() - 7);
    return fmtDDMMYYYY(d);
  }

  function ensureBtn(id, label, base, getVal){
    if(document.getElementById(id)) return true;

    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "toolsStyle"; // same style as Copy
    btn.textContent = label;

    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      e.stopPropagation();
      if(id === "mndoSRTop" && base === BASE_SR){
        const v = (getVal() || "").trim();
        const start = startTimeSevenMonthsBack();
        const url = base + encodeURIComponent(v) + "&startTime=" + encodeURIComponent(start);
        window.open(url, "_blank");
      }else{
        openLink(base, getVal());
      }
    });

    document.body.appendChild(btn);
    return true;
  }

  function bind(){
    const topCopy = document.getElementById("copyBtn");   // upper copy
    const botCopy = document.getElementById("copyBtn1");  // lower copy
    const fbbInp  = document.getElementById("arabiccNumber"); // top input (FBB)
    const fvInp   = document.getElementById("arabicNumber");  // bottom input (FV/landline)

    if(!topCopy || !botCopy || !fbbInp || !fvInp) return false;

    ensureBtn("mndoTTTop", "TT", BASE_TT, ()=> fbbInp.value || "");
    ensureBtn("mndoSRTop", "SR", BASE_SR, ()=> fbbInp.value || "");

    ensureBtn("mndoTTBottom", "FV tt", BASE_TT, ()=> fvInp.value || "");
    ensureBtn("mndoSRBottom", "sr v", BASE_SR, ()=> fvInp.value || "");

    return true;
  }

  const t = setInterval(()=>{
    if(bind()){
      clearInterval(t);
    }
  }, 80);
})();



/* === Query Timer (8 min warning) ===
   Starts on number input, resets on change, stays 00:00 when empty.
   Placed next to Tags using the SAME positioning rules as Tags (no scroll tracking).
*/
(function(){
  "use strict";

  var timerEl = null;
  var timerTimeEl = null;
  var intervalId = null;
  var startTs = 0;
  var lastVal = "";
  var activeInput = null;
  var CAUTION_AT = 7 * 60; // seconds
  var DANGER_AT  = 8 * 60; // seconds

  function pad2(n){ return (n < 10 ? "0" : "") + n; }
  function formatMMSS(totalSec){
    totalSec = Math.max(0, totalSec|0);
    var mm = Math.floor(totalSec / 60);
    var ss = totalSec % 60;
    return pad2(mm) + ":" + pad2(ss);
  }

  function getInputs(){
    var a = document.getElementById("arabicNumber");
    var b = document.getElementById("arabiccNumber");
    var out = [];
    if(a) out.push(a);
    if(b && b !== a) out.push(b);
    return out;
  }

  function findTags(){
    return document.getElementById("bat2") || null;
  }

  function ensureEl(){
    if(timerEl && document.body.contains(timerEl)) return timerEl;
    timerEl = document.getElementById("mndoQueryTimer");
    if(timerEl) return timerEl;

    var tags = findTags();
    if(!tags || !tags.parentNode) return null;

    var el = document.createElement("span");
    el.id = "mndoQueryTimer";
    el.innerHTML = '<span class="mndoTimerTime">00:00</span><span class="mndoTimerLbl">AHT</span>';
    timerTimeEl = el.querySelector(".mndoTimerTime");
    el.className = "toolsStyle";
    tags.parentNode.insertBefore(el, tags);
    timerEl = el;

    // Position once (and re-run a couple of times shortly to survive late layout/fonts)
    positionOnce();
    setTimeout(positionOnce, 120);
    setTimeout(positionOnce, 350);

    // Re-position on tab restore / resize (prevents AHT from drifting down after idle)
    var __mndoPosT = null;
    function __mndoKickPos(){
      try{ positionOnce(); }catch(e){}
      setTimeout(function(){ try{ positionOnce(); }catch(e){} }, 120);
    }
    window.addEventListener("pageshow", function(){ setTimeout(__mndoKickPos, 0); });
    document.addEventListener("visibilitychange", function(){
      if(!document.hidden) setTimeout(__mndoKickPos, 60);
    });
    window.addEventListener("resize", function(){
      if(__mndoPosT) clearTimeout(__mndoPosT);
      __mndoPosT = setTimeout(__mndoKickPos, 120);
    });

    return timerEl;
  }

  function positionOnce(){
    try{
      var tags = findTags();
      if(!tags || !timerEl) return;

      var cs = window.getComputedStyle(tags);
      var gap = 10;
      var tw  = timerEl.offsetWidth || 72;

      // Match Tags vertical placement
      // Prefer top if defined, else use margin-top like in your CSS
      if(cs.top && cs.top !== "auto") timerEl.style.top = cs.top;
      if(cs.marginTop && cs.marginTop !== "0px") timerEl.style.marginTop = cs.marginTop;

      // Mirror Tags positioning method:
      // 1) If Tags uses right => compute timer.right
      // 2) Else if Tags uses left => compute timer.left
      // 3) Else fallback to margin-left (your file uses margin-left for Tags)
      if(cs.right && cs.right !== "auto"){
        var r = parseFloat(cs.right) || 0;
        timerEl.style.right = (r + (tags.offsetWidth || 150) + gap) + "px";
        timerEl.style.left = "auto";
        timerEl.style.marginLeft = "0px";
      } else if(cs.left && cs.left !== "auto"){
        var l = parseFloat(cs.left) || 0;
        timerEl.style.left  = (l - tw - gap) + "px";
        timerEl.style.right = "auto";
        timerEl.style.marginLeft = "0px";
      } else {
        var ml = parseFloat(cs.marginLeft) || 0;
        // If margin-left is 0, fall back to offsetLeft
        if(!ml && tags.offsetLeft) ml = tags.offsetLeft;
        var newMl = (ml - tw - gap);
        if(newMl < 0) newMl = 0;
        timerEl.style.marginLeft = newMl + "px";
        timerEl.style.left = "0px";   // anchor for margin-left
        timerEl.style.right = "auto";
      }
    }catch(e){}
  }

  function setState(sec){
    if(!timerEl) return;
    var danger = sec >= DANGER_AT;
    var warn = (!danger && sec >= CAUTION_AT);
    timerEl.classList.toggle("mndoDanger", danger);
    timerEl.classList.toggle("mndoWarn", warn);
  }

  function setTime(sec){
    if(!timerEl) return;
    if(!timerTimeEl){ timerTimeEl = timerEl.querySelector(".mndoTimerTime"); }
    if(timerTimeEl) timerTimeEl.textContent = formatMMSS(sec);
    else timerEl.textContent = formatMMSS(sec);
    setState(sec);
  }

  function stop(){
    if(intervalId){ clearInterval(intervalId); intervalId = null; }
    startTs = 0;
    setTime(0);
  }

  function start(){
    if(intervalId) clearInterval(intervalId);
    intervalId = setInterval(function(){
      if(!startTs) return;
      var now = Date.now();
      var sec = Math.floor((now - startTs)/1000);
      setTime(sec);
    }, 250);
  }

  function resetFromInput(inp){
    ensureEl();
    activeInput = inp;
    lastVal = (inp.value || "").trim();

    if(!lastVal){
      stop();
      return;
    }
    startTs = Date.now();
    setTime(0);
    start();
  }

  function onInput(e){
    var inp = e && e.target ? e.target : null;
    if(!inp) return;

    var val = (inp.value || "").trim();

    // If empty => keep 00:00
    if(!val){
      ensureEl();
      stop();
      lastVal = "";
      activeInput = inp;
      return;
    }

    // First non-empty or changed => reset + start
    if(activeInput !== inp || val !== lastVal){
      resetFromInput(inp);
    }
  }

  function anyNonEmpty(){
    var ins = getInputs();
    for(var i=0;i<ins.length;i++){
      if((ins[i].value || "").trim()) return ins[i];
    }
    return null;
  }

  function bind(){
    var ins = getInputs();
    if(!ins.length) return false;

    ensureEl();
    if(!timerEl) return false;

    for(var i=0;i<ins.length;i++){
      ins[i].addEventListener("input", onInput, true);
      ins[i].addEventListener("keyup", onInput, true);
      ins[i].addEventListener("change", onInput, true);
    }

    var pre = anyNonEmpty();
    if(pre) resetFromInput(pre);
    else stop();
    return true;
  }

  // Wait until the page-injected HTML exists
  var tries = 0;
  var t = setInterval(function(){
    tries++;
    if(bind()){
      clearInterval(t);
    } else if(tries > 250){
      clearInterval(t);
    }
  }, 80);

})();



/* Apply luxury class to requested buttons if they exist (non-breaking) */
(function(){
  try{
    var ids = ["copyBtn","copyBtn1","mndoTTTop","mndoSRTop","mndoTTBottom","mndoSRBottom","bat2","mndoQueryTimer"];
    ids.forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.classList.add("mndoLuxuryBtn");
    });

    var labels = new Set(["sRV","sR","TT","FV tt","fvTT","Tags","Copy","sr v","srv","SR"]);
    var nodes = document.querySelectorAll("button,a,input[type='button'],input[type='submit']");
    nodes.forEach(function(el){
      var t = (el.tagName==="INPUT" ? (el.value||"") : (el.textContent||"")).trim();
      if(labels.has(t)) el.classList.add("mndoLuxuryBtn");
    });

    ["arabicNumber","arabiccNumber"].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.classList.add("mndoLuxuryInput");
    });
  }catch(e){}
})();



(function(){
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  // v10: Keep the timer ANCHORED to page/scroll-container AND prevent the base timer
  // auto-positioner from snapping it back to the top by using CSS variables + !important.
  var STATE_KEY = "mndoQTState_v9";      // keep key to preserve existing saved positions
  var LEGACY_POS_KEY = "mndoQTPos";
  var V8_KEY = "mndoQTState_v8";

  var host = null;

  function isScrollable(el){
    try{
      var cs = getComputedStyle(el);
      var oy = cs.overflowY, ox = cs.overflowX;
      var scrollY = (oy === "auto" || oy === "scroll" || oy === "overlay");
      var scrollX = (ox === "auto" || ox === "scroll" || ox === "overlay");
      return (scrollY && el.scrollHeight > el.clientHeight + 2) || (scrollX && el.scrollWidth > el.clientWidth + 2);
    }catch(_){ return false; }
  }

  function findPrimaryScrollHost(){
    var se = document.scrollingElement || document.documentElement;
    if(se && (se.scrollHeight > se.clientHeight + 2 || se.scrollWidth > se.clientWidth + 2)) return se;

    // Find the largest scrollable container (common in single-page tools where BODY is overflow:hidden)
    var best = null;
    var bestScore = 0;
    var nodes = document.body ? document.body.querySelectorAll("*") : [];
    var limit = 2500;

    for(var i=0;i<nodes.length && i<limit;i++){
      var el = nodes[i];
      if(!(el instanceof HTMLElement)) continue;
      if(el.offsetParent === null) continue;
      if(!isScrollable(el)) continue;

      var score = (el.scrollHeight - el.clientHeight) + (el.scrollWidth - el.clientWidth);
      if(score > bestScore){
        bestScore = score;
        best = el;
      }
    }
    return best || se || document.body || document.documentElement;
  }

  function normalizeHost(h){
    if(!h) return null;
    if(h === document.body) return document.body;
    if(h === document.documentElement) return document.documentElement;
    if(h === document.scrollingElement) return document.scrollingElement;
    return h;
  }

  function ensureRelativeContainer(el){
    try{
      if(!el || el === document.body || el === document.documentElement) return;
      var cs = getComputedStyle(el);
      if(cs.position === "static"){
        el.style.position = "relative";
      }
    }catch(_){}
  }

  function pageScrollX(){
    return window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  }
  function pageScrollY(){
    return window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
  }

  function getMaxDocSize(){
    var d = document.documentElement;
    var b = document.body || d;
    return {
      w: Math.max(d.scrollWidth, b.scrollWidth, d.clientWidth, b.clientWidth),
      h: Math.max(d.scrollHeight, b.scrollHeight, d.clientHeight, b.clientHeight)
    };
  }

  // ===== User-pinned coords (CSS vars) =====
  function getPinnedNumber(panel, varName, fallback){
    try{
      var cs = getComputedStyle(panel);
      var raw = cs.getPropertyValue(varName);
      if(raw){
        var n = parseFloat(String(raw).trim());
        if(isFinite(n)) return n;
      }
    }catch(_){}
    return fallback;
  }

  function getPinnedLeft(panel){
    var n = parseFloat(panel.style.left);
    if(!isFinite(n)) n = panel.offsetLeft || 0;
    return getPinnedNumber(panel, "--mndoQTLeft", n);
  }

  function getPinnedTop(panel){
    var n = parseFloat(panel.style.top);
    if(!isFinite(n)) n = panel.offsetTop || 0;
    return getPinnedNumber(panel, "--mndoQTTop", n);
  }

  function setPinned(panel, left, top){
    left = (isFinite(left) ? left : 0);
    top  = (isFinite(top)  ? top  : 0);

    panel.classList.add("mndoQTUserPos");
    panel.style.setProperty("--mndoQTLeft", left + "px");
    panel.style.setProperty("--mndoQTTop",  top  + "px");

    // keep inline values as fallback, but CSS !important wins
    panel.style.left = left + "px";
    panel.style.top  = top  + "px";
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function readState(){
    function normalizeObj(o){
      if(!o || typeof o !== "object") return null;

      var left = (o.left != null ? o.left : "");
      var top  = (o.top  != null ? o.top  : "");

      var ln = parseFloat(left);
      var tn = parseFloat(top);

      // Support numbers too
      if(typeof o.left === "number" && isFinite(o.left)) ln = o.left;
      if(typeof o.top  === "number" && isFinite(o.top))  tn = o.top;

      var out = {};
      if(isFinite(ln)) out.left = ln;
      if(isFinite(tn)) out.top  = tn;

      if(o.width) out.width = String(o.width);
      if(o.height) out.height = String(o.height);

      return (isFinite(out.left) && isFinite(out.top)) ? out : null;
    }

    try{
      var raw = localStorage.getItem(STATE_KEY);
      if(raw) return normalizeObj(JSON.parse(raw));
    }catch(_){}

    try{
      var raw8 = localStorage.getItem(V8_KEY);
      if(raw8) return normalizeObj(JSON.parse(raw8));
    }catch(_){}

    try{
      var raw2 = localStorage.getItem(LEGACY_POS_KEY);
      if(raw2) return normalizeObj(JSON.parse(raw2));
    }catch(_){}

    return null;
  }

  function saveState(panel){
    try{
      var s = {
        v: 10,
        mode: "page",
        left: getPinnedLeft(panel),
        top:  getPinnedTop(panel),
        width: panel.style.width || "",
        height: panel.style.height || ""
      };
      localStorage.setItem(STATE_KEY, JSON.stringify(s));
    }catch(_){}
  }

  function clampIntoHost(panel){
    var left = getPinnedLeft(panel);
    var top  = getPinnedTop(panel);

    var w = panel.offsetWidth;
    var h = panel.offsetHeight;

    var maxLeft = 0, maxTop = 0;

    if(!host || host === document.body || host === document.documentElement){
      var doc = getMaxDocSize();
      maxLeft = Math.max(0, doc.w - w);
      maxTop  = Math.max(0, doc.h - h);
    }else{
      maxLeft = Math.max(0, host.scrollWidth  - w);
      maxTop  = Math.max(0, host.scrollHeight - h);
    }

    setPinned(panel, clamp(left, 0, maxLeft), clamp(top, 0, maxTop));
  }

  function attachToHost(panel){
    host = normalizeHost(findPrimaryScrollHost());
    if(!host) host = document.body || document.documentElement;

    if(host !== document.body && host !== document.documentElement){
      ensureRelativeContainer(host);
    }

    // Move panel into host if it's not already there, preserving visual position
    if(panel.parentNode !== host){
      var pr = panel.getBoundingClientRect();
      var newLeft = 0, newTop = 0;

      if(host === document.body || host === document.documentElement){
        newLeft = pr.left + pageScrollX();
        newTop  = pr.top  + pageScrollY();
      }else{
        var hr = host.getBoundingClientRect();
        newLeft = pr.left - hr.left + host.scrollLeft;
        newTop  = pr.top  - hr.top  + host.scrollTop;
      }

      host.appendChild(panel);
      panel.style.position = "absolute";
      panel.style.margin = "0";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
      setPinned(panel, newLeft, newTop);
    }
  }

  function ensureHandles(panel){
    // Drag handle
    var dragHandle = panel.querySelector(".mndoQTDragHandle");
    if(!dragHandle){
      dragHandle = document.createElement("div");
      dragHandle.className = "mndoQTDragHandle";
      dragHandle.title = "Drag";
      dragHandle.textContent = "⋮⋮";
      panel.appendChild(dragHandle);
    }

    // Resize handle
    var resizeHandle = panel.querySelector(".mndoQTResizeHandle");
    if(!resizeHandle){
      resizeHandle = document.createElement("div");
      resizeHandle.className = "mndoQTResizeHandle";
      resizeHandle.title = "Resize";
      panel.appendChild(resizeHandle);
    }

    return { dragHandle: dragHandle, resizeHandle: resizeHandle };
  }

  function install(panel){
    attachToHost(panel);

    // Apply saved state if available; otherwise pin current position immediately
    var st = readState();
    if(st && isFinite(st.left) && isFinite(st.top)){
      if(st.width) panel.style.width = st.width;
      if(st.height) panel.style.height = st.height;
      setPinned(panel, st.left, st.top);
    }else{
      setPinned(panel, panel.offsetLeft || 0, panel.offsetTop || 0);
    }

    clampIntoHost(panel);
    saveState(panel);

    var handles = ensureHandles(panel);
    var dragHandle = handles.dragHandle;
    var resizeHandle = handles.resizeHandle;

    // ===== Drag logic =====
    (function(){
      var dragging = false;
      var startX = 0, startY = 0;
      var startLeft = 0, startTop = 0;
      var startScrollLeft = 0, startScrollTop = 0;

      function onDown(e){
        if(e.button != null && e.button !== 0) return;
        e.preventDefault();

        dragging = true;
        panel.classList.add("mndoQTDragging");

        startX = e.clientX;
        startY = e.clientY;
        startLeft = getPinnedLeft(panel);
        startTop  = getPinnedTop(panel);

        startScrollLeft = (host && typeof host.scrollLeft === "number") ? host.scrollLeft : pageScrollX();
        startScrollTop  = (host && typeof host.scrollTop === "number")  ? host.scrollTop  : pageScrollY();

        document.addEventListener("mousemove", onMove, {passive:false});
        document.addEventListener("mouseup", onUp, {passive:true});
      }

      function onMove(e){
        if(!dragging) return;
        e.preventDefault();

        var dx = (e.clientX - startX);
        var dy = (e.clientY - startY);

        var curScrollLeft = (host && typeof host.scrollLeft === "number") ? host.scrollLeft : pageScrollX();
        var curScrollTop  = (host && typeof host.scrollTop === "number")  ? host.scrollTop  : pageScrollY();

        var newLeft = startLeft + dx + (curScrollLeft - startScrollLeft);
        var newTop  = startTop  + dy + (curScrollTop  - startScrollTop);

        setPinned(panel, newLeft, newTop);
        clampIntoHost(panel);
      }

      function onUp(){
        if(!dragging) return;
        dragging = false;
        panel.classList.remove("mndoQTDragging");

        document.removeEventListener("mousemove", onMove, {passive:false});
        document.removeEventListener("mouseup", onUp, {passive:true});

        saveState(panel);
      }

      dragHandle.addEventListener("mousedown", onDown, {passive:false});
      // Prevent accidental selection/clicks inside panel from starting drag
      dragHandle.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); }, {passive:false});
    })();

    // ===== Resize logic =====
    (function(){
      var resizing = false;
      var startX = 0, startY = 0;
      var startW = 0, startH = 0;

      function maxWH(){
        if(!host || host === document.body || host === document.documentElement){
          return { w: Math.max(260, window.innerWidth - 10), h: Math.max(80, window.innerHeight - 10) };
        }
        return { w: Math.max(260, host.clientWidth - 10), h: Math.max(80, host.clientHeight - 10) };
      }

      function onDown(e){
        if(e.button != null && e.button !== 0) return;
        e.preventDefault();

        resizing = true;
        panel.classList.add("mndoQTResizing");

        startX = e.clientX;
        startY = e.clientY;
        startW = panel.offsetWidth;
        startH = panel.offsetHeight;

        document.addEventListener("mousemove", onMove, {passive:false});
        document.addEventListener("mouseup", onUp, {passive:true});
      }

      function onMove(e){
        if(!resizing) return;
        e.preventDefault();

        var dx = e.clientX - startX;
        var dy = e.clientY - startY;

        var minW = 220, minH = 54;
        var mx = maxWH();

        var newW = clamp(startW + dx, minW, mx.w);
        var newH = clamp(startH + dy, minH, mx.h);

        panel.style.width = Math.round(newW) + "px";
        panel.style.height = Math.round(newH) + "px";

        clampIntoHost(panel);
      }

      function onUp(){
        if(!resizing) return;
        resizing = false;
        panel.classList.remove("mndoQTResizing");

        document.removeEventListener("mousemove", onMove, {passive:false});
        document.removeEventListener("mouseup", onUp, {passive:true});

        // Let height auto-fit when not needed
        panel.style.height = "";
        clampIntoHost(panel);
        saveState(panel);
      }

      resizeHandle.addEventListener("mousedown", onDown, {passive:false});
      resizeHandle.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); }, {passive:false});
    })();

    // Keep inside bounds on viewport resize
    window.addEventListener("resize", function(){
      clampIntoHost(panel);
      saveState(panel);
    }, {passive:true});
  }

  // Wait until quick timer panel exists
  var tries = 0;
  var t = setInterval(function(){
    tries++;
    var panel = document.getElementById("mndoQuickTimerPanel");
    if(panel){
      clearInterval(t);
      install(panel);
    }else if(tries > 600){
      clearInterval(t);
    }
  }, 60);
})();



(function(){
  "use strict";

  function findMobileBtn(){
    // Prefer the main tab button "Mobile" (last tab)
    var cand = Array.prototype.slice.call(document.querySelectorAll("button.tablinks, .tablinks"));
    for(var i=0;i<cand.length;i++){
      var t = (cand[i].textContent||"").trim().toLowerCase();
      if(t === "mobile") return cand[i];
    }
    // fallback: any button with exact text Mobile
    var btns = Array.prototype.slice.call(document.querySelectorAll("button"));
    for(var j=0;j<btns.length;j++){
      var tt = (btns[j].textContent||"").trim().toLowerCase();
      if(tt === "mobile") return btns[j];
    }
    return null;
  }

  function apply(){
    var tags = document.getElementById("bat2");
    var ath  = document.getElementById("mndoQueryTimer");
    var mobile = findMobileBtn();
    if(!tags || !mobile) return false;

    // If ATH (timer) is already fixed under logo, do not move it here
    var athFixed = false;
    try{ athFixed = !!(ath && ath.dataset && ath.dataset.mndoFixedUnderLogo === "1"); }catch(e){}

    var wrap = document.getElementById("MNDO_AHT_TAGS_STACK");
    if(!wrap){
      wrap = document.createElement("div");
      wrap.id = "MNDO_AHT_TAGS_STACK";
      document.body.appendChild(wrap);
    }

    // Move Tags into wrapper (keep ATH out if it's fixed under logo)
    if(tags.parentNode !== wrap) wrap.appendChild(tags);

    // If ATH is NOT fixed under logo, keep legacy behavior: ATH فوق Tags
    var hasAthInWrap = false;
    if(ath && !athFixed){
      hasAthInWrap = true;
      if(ath.parentNode !== wrap) wrap.insertBefore(ath, wrap.firstChild);
      if(wrap.firstChild !== ath) wrap.insertBefore(ath, wrap.firstChild);
      if(ath.nextSibling !== tags) wrap.insertBefore(tags, ath.nextSibling);
    }

    // Measure reference size (ATH if available & not fixed; otherwise Tags)
    var refRect = null;
    try{
      refRect = hasAthInWrap ? ath.getBoundingClientRect() : tags.getBoundingClientRect();
    }catch(e){}
    var w = refRect ? (Math.round(refRect.width)  || 120) : 120;
    var h = refRect ? (Math.round(refRect.height) || 36)  : 36;

    // Force Tags same size as reference
    tags.style.width = w + "px";
    tags.style.height = h + "px";
    tags.style.minWidth = w + "px";
    tags.style.minHeight = h + "px";
    tags.style.lineHeight = "1";

    // Position wrapper above Mobile button (align right edge)
    var mRect = mobile.getBoundingClientRect();
    var wrapH = hasAthInWrap ? (h*2 + 6) : h; // + gap
    var top = Math.round(mRect.top - wrapH - 6);
    if(top < 0) top = 0;

    var right = Math.round(window.innerWidth - mRect.right);
    if(right < 0) right = 0;

    // Position the wrapper relative to the viewport rather than the document scroll.
    // Removing the pageYOffset adjustment prevents the AHT/Tags stack from drifting
    // downward as the user scrolls.  With CSS 'position:fixed', the computed `top`
    // value will keep the elements anchored at the same distance from the top of
    // the viewport.
    wrap.style.top = top + "px";
    wrap.style.right = "0px"; // flush to viewport right edge

    return true;
  }

  function run(){
    apply();
    // Re-apply عدة مرات لأن الصفحة بتتولد بـ document.write
    setTimeout(apply, 120);
    setTimeout(apply, 350);
    setTimeout(apply, 900);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run, {once:true});
  } else {
    run();
  }
  window.addEventListener("load", run, {once:true});
  window.addEventListener("resize", function(){ setTimeout(apply, 80); });
})();



(function(){
  "use strict";

  var PANEL_ID = "mndoQuickTimerPanel";

  function pad2(n){ n = Math.max(0, Math.floor(n)); return (n<10?("0"+n):(""+n)); }

  function clampTotal(t){
    // allow up to 99:59
    t = Math.max(0, Math.floor(t));
    var max = (99*60) + 59;
    if(t > max) t = max;
    return t;
  }

  function split(total){
    total = clampTotal(total);
    return { m: Math.floor(total/60), s: total%60 };
  }

  function setup(panel){
    if(!panel || panel.getAttribute("data-mndo-qt-v10") === "1") return;

    panel.setAttribute("data-mndo-qt-v10", "1");

    // Replace UI completely (remove old 15/30/input)
    panel.innerHTML = ''
      + '<div class="mndoQTTime" id="mndoQTTimeV10">'
      +   '<span id="mndoQTIconV10"><i class="fa-regular fa-clock"></i></span>'
      +   '<span id="mndoQTTextV10">00:00</span>'
      + '</div>'
      + '<div class="mndoQTControls">'
      +   '<div class="mndoQTStep">'
      +     '<button type="button" class="mndoQTBtn mndoQTValueBtn" id="mndoQTMinBtnV10" title="Minutes">MIN: 30</button>'
      +     '<div class="mndoQTArrows">'
      +       '<button type="button" class="mndoQTBtn mndoQTArrowBtn" id="mndoQTMinUpV10" title="+1 minute"><i class="fa-solid fa-chevron-up"></i></button>'
      +       '<button type="button" class="mndoQTBtn mndoQTArrowBtn" id="mndoQTMinDownV10" title="-1 minute"><i class="fa-solid fa-chevron-down"></i></button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="mndoQTStep">'
      +     '<button type="button" class="mndoQTBtn mndoQTValueBtn" id="mndoQTSecBtnV10" title="Seconds">SEC: 15</button>'
      +     '<div class="mndoQTArrows">'
      +       '<button type="button" class="mndoQTBtn mndoQTArrowBtn" id="mndoQTSecUpV10" title="+1 second"><i class="fa-solid fa-chevron-up"></i></button>'
      +       '<button type="button" class="mndoQTBtn mndoQTArrowBtn" id="mndoQTSecDownV10" title="-1 second"><i class="fa-solid fa-chevron-down"></i></button>'
      +     '</div>'
      +   '</div>'
      +   '<div class="mndoQTActionRow">'
      +     '<button type="button" class="mndoQTBtn mndoQTActionBtn" id="mndoQTStartPauseV10" title="Start / Pause"><i class="fa-solid fa-play"></i></button>'
      +     '<button type="button" class="mndoQTBtn mndoQTActionBtn" id="mndoQTResetV10" title="Reset"><i class="fa-solid fa-rotate-left"></i></button>'
      +   '</div>'
      + '</div>';

    var iconEl = document.getElementById("mndoQTIconV10");
    var textEl = document.getElementById("mndoQTTextV10");

    var minBtn  = document.getElementById("mndoQTMinBtnV10");
    var secBtn  = document.getElementById("mndoQTSecBtnV10");
    var minUp   = document.getElementById("mndoQTMinUpV10");
    var minDown = document.getElementById("mndoQTMinDownV10");
    var secUp   = document.getElementById("mndoQTSecUpV10");
    var secDown = document.getElementById("mndoQTSecDownV10");

    var startPauseBtn = document.getElementById("mndoQTStartPauseV10");
    var resetBtn      = document.getElementById("mndoQTResetV10");

    var st = {
      running:false,
      alarm:false,
      endAt:0,
      total: (30*60) + 15, // default: 30:15
      tickId:null,
      beepId:null,
      ctx:null
    };

    function setIcon(mode){
      if(!iconEl) return;
      if(mode === "run"){
        iconEl.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';
      }else if(mode === "alarm"){
        iconEl.innerHTML = '<i class="fa-solid fa-bell"></i>';
      }else{
        iconEl.innerHTML = '<i class="fa-regular fa-clock"></i>';
      }
    }

    function renderSet(){
      var p = split(st.total);
      if(minBtn) minBtn.textContent = "MIN: " + p.m;
      if(secBtn) secBtn.textContent = "SEC: " + p.s;
      if(!st.running && textEl){
        textEl.textContent = pad2(p.m) + ":" + pad2(p.s);
      }
    }

    function renderLeft(ms){
      if(!textEl) return;
      var total = Math.max(0, Math.floor(ms/1000));
      var p = split(total);
      textEl.textContent = pad2(p.m) + ":" + pad2(p.s);
    }

    function getCtx(){
      var AC = window.AudioContext || window.webkitAudioContext;
      if(!AC) return null;
      if(!st.ctx) st.ctx = new AC();
      return st.ctx;
    }

    function beepOnce(){
      var ctx = getCtx();
      if(!ctx) return;
      try{ if(ctx.state === "suspended") ctx.resume(); }catch(e){}
      try{
        var now = ctx.currentTime;

        var osc1 = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        osc1.type = "square";
        osc2.type = "square";
        osc1.frequency.value = 880;
        osc2.frequency.value = 1320;

        var gain = ctx.createGain();
        // "as loud as possible" in code: ramp close to 1.0 (real volume depends on device volume)
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.95, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        var comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-18, now);
        comp.knee.setValueAtTime(18, now);
        comp.ratio.setValueAtTime(12, now);
        comp.attack.setValueAtTime(0.003, now);
        comp.release.setValueAtTime(0.25, now);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(comp);
        comp.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.24);
        osc2.stop(now + 0.24);
      }catch(e){}
    }

    function beepStart(){
      if(st.beepId) return;
      beepOnce();
      st.beepId = setInterval(beepOnce, 380);
    }

    function beepStop(){
      if(st.beepId){
        clearInterval(st.beepId);
        st.beepId = null;
      }
    }

    function alarmStart(){
      st.alarm = true;
      panel.classList.add("mndoQTAlarm");
      setIcon("alarm");
      beepStart();
      try{ if(navigator && navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
    }

    function alarmStop(){
      st.alarm = false;
      panel.classList.remove("mndoQTAlarm");
      beepStop();
      if(!st.running) setIcon("idle");
    }

    function stopTick(){
      if(st.tickId){
        clearInterval(st.tickId);
        st.tickId = null;
      }
    }

    function finish(){
      st.running = false;
      stopTick();
      renderLeft(0);
      alarmStart();
      startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function tick(){
      var left = st.endAt - Date.now();
      if(left <= 0){
        finish();
      }else{
        renderLeft(left);
      }
    }

    function start(){
      if(st.total <= 0) return;
      alarmStop();
      st.running = true;
      setIcon("run");
      st.endAt = Date.now() + (st.total*1000);
      stopTick();
      tick();
      st.tickId = setInterval(tick, 200);
      startPauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    }

    function pause(){
      if(!st.running) return;
      st.running = false;
      stopTick();
      setIcon("idle");
      // keep remaining time as the new set value
      var left = Math.max(0, Math.floor((st.endAt - Date.now())/1000));
      st.total = clampTotal(left);
      renderSet();
      startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function reset(){
      alarmStop();
      st.running = false;
      stopTick();
      // reset to 00:00
      st.total = 0;
      setIcon("idle");
      renderSet();
      startPauseBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function adjust(delta){
      if(st.running) return; // don't adjust while running
      alarmStop();
      st.total = clampTotal(st.total + delta);
      renderSet();
    }

    // Events
    startPauseBtn.addEventListener("click", function(){
      if(st.alarm){ alarmStop(); }
      if(st.running) pause(); else start();
    });

    resetBtn.addEventListener("click", function(){
      reset();
    });

    // Clicking the time display stops alarm or toggles start/pause
    var timeBox = document.getElementById("mndoQTTimeV10");
    if(timeBox){
      timeBox.style.cursor = "pointer";
      timeBox.addEventListener("click", function(){
        if(st.alarm){ alarmStop(); return; }
        if(st.running) pause(); else start();
      });
    }

    // Arrow steppers
    minUp.addEventListener("click", function(){ adjust(60); });
    minDown.addEventListener("click", function(){ adjust(-60); });
    secUp.addEventListener("click", function(){ adjust(1); });
    secDown.addEventListener("click", function(){ adjust(-1); });

    // Clicking value buttons: quick set focus-like + stop alarm
    minBtn.addEventListener("click", function(){ if(st.alarm) alarmStop(); });
    secBtn.addEventListener("click", function(){ if(st.alarm) alarmStop(); });

    // Initial render
    setIcon("idle");
    renderSet();
  }

  function boot(){
    var panel = document.getElementById(PANEL_ID);
    if(panel){
      setup(panel);
      return true;
    }
    return false;
  }

  function watch(){
    if(boot()) return;
    var obs = new MutationObserver(function(){
      if(boot()){
        try{ obs.disconnect(); }catch(e){}
      }
    });
    try{
      obs.observe(document.documentElement || document.body, {childList:true, subtree:true});
      setTimeout(function(){ try{ obs.disconnect(); }catch(e){} }, 8000);
    }catch(e){}
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", watch, {once:true});
  }else{
    watch();
  }
  window.addEventListener("load", watch, {once:true});
})();



(function(){
  "use strict";

  var PANEL_ID = "mndoQuickTimerPanel";

  function pad2(n){
    n = Math.max(0, Math.floor(n));
    return (n < 10 ? ("0"+n) : (""+n));
  }

  function clampTotalSec(total){
    total = Math.max(0, Math.floor(total));
    var max = (99*60) + 59;
    if(total > max) total = max;
    return total;
  }

  function normalize(min, sec){
    min = isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
    sec = isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;

    if(sec >= 60){
      min += Math.floor(sec/60);
      sec = sec % 60;
    }
    if(min > 99){
      min = 99;
      sec = Math.min(sec, 59);
    }
    return { m:min, s:sec, total: clampTotalSec(min*60 + sec) };
  }

  function getCtx(state){
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    if(!state.ctx) state.ctx = new AC();
    return state.ctx;
  }

  function setup(panel){
    if(!panel || panel.getAttribute("data-mndo-qt-v13") === "1") return;
    panel.setAttribute("data-mndo-qt-v13", "1");

    panel.innerHTML = ''
      + '<div class="mndoQTHeaderV13">'
      +   '<div class="mndoQTIconV13" id="mndoQTIconV13"><i class="fa-regular fa-clock"></i></div>'
      +   '<div class="mndoQTInputsV13">'
      +     '<input class="mndoQTInputV13" id="mndoQTMinInV13" type="number" inputmode="numeric" min="0" max="99" placeholder="MM" />'
      +     '<span class="mndoQTColonV13">:</span>'
      +     '<input class="mndoQTInputV13" id="mndoQTSecInV13" type="number" inputmode="numeric" min="0" max="59" placeholder="SS" />'
      +   '</div>'
      +   '<div class="mndoQTBtnsV13">'
      +     '<button type="button" class="mndoQTBtn mndoQTBtnV13" id="mndoQTStartPauseV13" title="Start / Pause"><i class="fa-solid fa-play"></i></button>'
      +     '<button type="button" class="mndoQTBtn mndoQTBtnV13" id="mndoQTResetV13" title="Reset"><i class="fa-solid fa-rotate-left"></i></button>'
      +   '</div>'
      + '</div>';

    var iconEl = document.getElementById("mndoQTIconV13");
    var minIn  = document.getElementById("mndoQTMinInV13");
    var secIn  = document.getElementById("mndoQTSecInV13");
    var spBtn  = document.getElementById("mndoQTStartPauseV13");
    var rsBtn  = document.getElementById("mndoQTResetV13");

    var st = {
      running:false,
      alarm:false,
      endAt:0,
      total: (30*60)+15,
      tickId:null,
      beepId:null,
      ctx:null
    };

    function setIcon(mode){
      if(!iconEl) return;
      if(mode === "run"){
        iconEl.innerHTML = '<i class="fa-solid fa-hourglass-half"></i>';
      }else if(mode === "alarm"){
        iconEl.innerHTML = '<i class="fa-solid fa-bell"></i>';
      }else{
        iconEl.innerHTML = '<i class="fa-regular fa-clock"></i>';
      }
    }

    function setInputs(m,s){
      minIn.value = (m === 0 && st.running === false && minIn.value === "" ? "" : pad2(m));
      secIn.value = (s === 0 && st.running === false && secIn.value === "" ? "" : pad2(s));
    }

    function setInputsFromTotal(total){
      total = clampTotalSec(total);
      var m = Math.floor(total/60);
      var s = total%60;
      minIn.value = pad2(m);
      secIn.value = pad2(s);
    }

    function readInputs(){
      var m = parseInt(minIn.value, 10);
      var s = parseInt(secIn.value, 10);
      if(!isFinite(m)) m = 0;
      if(!isFinite(s)) s = 0;
      var n = normalize(m,s);
      // reflect normalized (two digits)
      minIn.value = pad2(n.m);
      secIn.value = pad2(n.s);
      st.total = n.total;
      return n;
    }

    function inputsEnable(on){
      minIn.disabled = !on;
      secIn.disabled = !on;
    }

    function beepOnce(){
      var ctx = getCtx(st);
      if(!ctx) return;
      try{ if(ctx.state === "suspended") ctx.resume(); }catch(e){}
      try{
        var now = ctx.currentTime;

        var osc1 = ctx.createOscillator();
        var osc2 = ctx.createOscillator();
        osc1.type = "square";
        osc2.type = "square";
        osc1.frequency.value = 880;
        osc2.frequency.value = 1320;

        var gain = ctx.createGain();
        // as loud as possible (within WebAudio); device volume still matters
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(0.98, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        var comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-18, now);
        comp.knee.setValueAtTime(18, now);
        comp.ratio.setValueAtTime(12, now);
        comp.attack.setValueAtTime(0.003, now);
        comp.release.setValueAtTime(0.25, now);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(comp);
        comp.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.24);
        osc2.stop(now + 0.24);
      }catch(e){}
    }

    function beepStart(){
      if(st.beepId) return;
      beepOnce();
      st.beepId = setInterval(beepOnce, 380);
    }

    function beepStop(){
      if(st.beepId){
        clearInterval(st.beepId);
        st.beepId = null;
      }
    }

    function alarmStart(){
      st.alarm = true;
      panel.classList.add("mndoQTAlarm");
      setIcon("alarm");
      beepStart();
      try{ if(navigator && navigator.vibrate) navigator.vibrate([200,100,200,100,200]); }catch(e){}
    }

    function alarmStop(){
      st.alarm = false;
      panel.classList.remove("mndoQTAlarm");
      beepStop();
      if(!st.running) setIcon("idle");
    }

    function stopTick(){
      if(st.tickId){
        clearInterval(st.tickId);
        st.tickId = null;
      }
    }

    function renderLeft(ms){
      var total = Math.max(0, Math.floor(ms/1000));
      setInputsFromTotal(total);
    }

    function finish(){
      st.running = false;
      stopTick();
      inputsEnable(true);
      setInputsFromTotal(0);
      alarmStart();
      spBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function tick(){
      var left = st.endAt - Date.now();
      if(left <= 0){
        finish();
      }else{
        renderLeft(left);
      }
    }

    function start(){
      alarmStop();
      readInputs();
      if(st.total <= 0) return;
      st.running = true;
      inputsEnable(false);
      setIcon("run");
      st.endAt = Date.now() + (st.total*1000);
      stopTick();
      tick();
      st.tickId = setInterval(tick, 200);
      spBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    }

    function pause(){
      if(!st.running) return;
      st.running = false;
      stopTick();
      inputsEnable(true);
      setIcon("idle");
      var left = Math.max(0, Math.floor((st.endAt - Date.now())/1000));
      st.total = clampTotalSec(left);
      setInputsFromTotal(st.total);
      spBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    function reset(){
      alarmStop();
      st.running = false;
      stopTick();
      inputsEnable(true);
      st.total = 0;
      setIcon("idle");
      setInputsFromTotal(st.total);
      spBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    }

    // Events
    spBtn.addEventListener("click", function(){
      if(st.alarm){ alarmStop(); return; }
      if(st.running) pause(); else start();
    });

    rsBtn.addEventListener("click", function(){
      reset();
    });

    // Typing updates time (only when not running)
    function onTyped(){
      if(st.running) return;
      if(st.alarm) alarmStop();
      // normalize softly (do not jump cursor on every keystroke) -> normalize on blur/change
    }

    function onCommit(){
      if(st.running) return;
      if(st.alarm) alarmStop();
      readInputs();
    }

    minIn.addEventListener("input", onTyped);
    secIn.addEventListener("input", onTyped);
    minIn.addEventListener("change", onCommit);
    secIn.addEventListener("change", onCommit);
    minIn.addEventListener("blur", onCommit);
    secIn.addEventListener("blur", onCommit);

    // Clicking icon stops alarm quickly
    iconEl.addEventListener("click", function(){
      if(st.alarm) alarmStop();
    });

    // Initial
    setIcon("idle");
    inputsEnable(true);
    setInputsFromTotal(st.total);
  }

  function boot(){
    var panel = document.getElementById(PANEL_ID);
    if(panel){
      setup(panel);
      return true;
    }
    return false;
  }

  function watch(){
    if(boot()) return;
    var obs = new MutationObserver(function(){
      if(boot()){
        try{ obs.disconnect(); }catch(e){}
      }
    });
    try{
      obs.observe(document.documentElement || document.body, {childList:true, subtree:true});
      setTimeout(function(){ try{ obs.disconnect(); }catch(e){} }, 8000);
    }catch(e){}
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", watch, {once:true});
  }else{
    watch();
  }
  window.addEventListener("load", watch, {once:true});
})();



(function(){
  "use strict";

  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  function getXY(e){
    if(e.touches && e.touches.length){
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  }

  function persist(panel){
    try{
      var key = "mndoQTState_v9"; // نفس المفتاح المستخدم في patch السحب/التكبير
      var st = {};
      try{ st = JSON.parse(localStorage.getItem(key) || "{}") || {}; }catch(_){ st = {}; }

      // خزن المقاسات الحالية (strings مثل "240px")
      if(panel.style.width)  st.width  = panel.style.width;
      if(panel.style.height) st.height = panel.style.height;

      localStorage.setItem(key, JSON.stringify(st));
    }catch(_){}
  }

  function install(){
    var panel = document.getElementById("mndoQuickTimerPanel");
    if(!panel) return false;

    var handle = panel.querySelector(".mndoQTResizeHandle");
    if(!handle) return false;

    // Prevent double-install
    if(handle.getAttribute("data-mndo-resize-fix") === "1") return true;
    handle.setAttribute("data-mndo-resize-fix", "1");

    var resizing = false;
    var startX = 0, startY = 0;
    var startW = 0, startH = 0;

    function onDown(e){
      // left click only
      if(e.button != null && e.button !== 0) return;

      // IMPORTANT: stop the old handler that couldn't override !important widths
      e.preventDefault();
      e.stopImmediatePropagation();

      resizing = true;
      panel.classList.add("mndoQTResizing");

      var p = getXY(e);
      startX = p.x;
      startY = p.y;

      var r = panel.getBoundingClientRect();
      startW = r.width;
      startH = r.height;

      document.addEventListener("mousemove", onMove, {passive:false});
      document.addEventListener("mouseup", onUp, {passive:true});
      document.addEventListener("touchmove", onMove, {passive:false});
      document.addEventListener("touchend", onUp, {passive:true});
      document.addEventListener("touchcancel", onUp, {passive:true});
    }

    function onMove(e){
      if(!resizing) return;
      e.preventDefault();

      var p = getXY(e);
      var dx = p.x - startX;
      var dy = p.y - startY;

      // Min sizes (keep usable)
      var minW = 190;
      var minH = 40;

      // Max sizes (avoid overflow)
      var maxW = Math.max(minW, window.innerWidth - 10);
      var maxH = Math.max(minH, window.innerHeight - 10);

      var newW = clamp(startW + dx, minW, maxW);
      var newH = clamp(startH + dy, minH, maxH);

      // KEY FIX: set with IMPORTANT so it actually changes even if CSS uses !important
      panel.style.setProperty("width",  Math.round(newW) + "px", "important");
      panel.style.setProperty("height", Math.round(newH) + "px", "important");
    }

    function onUp(){
      if(!resizing) return;
      resizing = false;
      panel.classList.remove("mndoQTResizing");

      document.removeEventListener("mousemove", onMove, {passive:false});
      document.removeEventListener("mouseup", onUp, {passive:true});
      document.removeEventListener("touchmove", onMove, {passive:false});
      document.removeEventListener("touchend", onUp, {passive:true});
      document.removeEventListener("touchcancel", onUp, {passive:true});

      persist(panel);
    }

    // capture=true so we run BEFORE old listener
    handle.addEventListener("mousedown", onDown, true);
    handle.addEventListener("touchstart", onDown, {capture:true, passive:false});

    return true;
  }

  function boot(){
    if(install()) return;

    // Wait if panel/handle created later
    var obs = new MutationObserver(function(){
      if(install()){
        try{ obs.disconnect(); }catch(e){}
      }
    });
    try{
      obs.observe(document.documentElement || document.body, {childList:true, subtree:true});
      setTimeout(function(){ try{ obs.disconnect(); }catch(e){} }, 8000);
    }catch(e){}
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  }else{
    boot();
  }
  window.addEventListener("load", boot, {once:true});
})();



(function(){
  "use strict";

  var STATE_KEY = "mndoQTState_v9";

  function fixState(){
    try{
      var st = {};
      try{ st = JSON.parse(localStorage.getItem(STATE_KEY) || "{}") || {}; }catch(_){ st = {}; }
      // remove any saved width/height so it can't resize on refresh
      if(st && typeof st === "object"){
        delete st.width;
        delete st.height;
        localStorage.setItem(STATE_KEY, JSON.stringify(st));
      }
    }catch(_){}
  }

  function apply(){
    var panel = document.getElementById("mndoQuickTimerPanel");
    if(!panel) return;

    // enforce fixed size (inline IMPORTANT wins against other rules)
    panel.style.setProperty("width", "210px", "important");
    panel.style.setProperty("height", "auto", "important");

    // remove resize handle if it exists
    var rh = panel.querySelector(".mndoQTResizeHandle");
    if(rh) rh.remove();

    // If any code tries to re-add resize handle, remove it
    if(!panel.__mndoNoResizeObs){
      var obs = new MutationObserver(function(){
        var h = panel.querySelector(".mndoQTResizeHandle");
        if(h) h.remove();
      });
      obs.observe(panel, {childList:true, subtree:true});
      panel.__mndoNoResizeObs = obs;
    }
  }

  function run(){
    fixState();
    apply();
    setTimeout(apply, 120);
    setTimeout(apply, 400);
    setTimeout(apply, 900);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run, {once:true});
  }else{
    run();
  }
  window.addEventListener("load", run, {once:true});
  window.addEventListener("resize", function(){ setTimeout(apply, 80); });
})();



(function(){
  "use strict";

  function ensure(){
    // If the newer UA07 logo exists, use it instead of injecting a duplicate luxury logo
    var existingNew = document.getElementById("MNDO_UA07_LOGO3");
    if(existingNew) return existingNew;
    var el = document.getElementById("UA07_LUX_LOGO_BETWEEN");
    if(el) return el;
    el = document.createElement("div");
    el.id = "UA07_LUX_LOGO_BETWEEN";
    // Premium UA07 badge (SVG) — global luxury monogram
    el.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 72" aria-hidden="true">'
      + '<defs>'
      +   '<linearGradient id="ua07g" x1="18" y1="10" x2="302" y2="62" gradientUnits="userSpaceOnUse">'
      +     '<stop offset="0" stop-color="#9AE6FF"/>'
      +     '<stop offset="0.52" stop-color="#FF7AD9"/>'
      +     '<stop offset="1" stop-color="#FFE08A"/>'
      +   '</linearGradient>'
      +   '<linearGradient id="ua07glass" x1="0" y1="0" x2="0" y2="1">'
      +     '<stop offset="0" stop-color="rgba(255,255,255,0.16)"/>'
      +     '<stop offset="1" stop-color="rgba(255,255,255,0.05)"/>'
      +   '</linearGradient>'
      +   '<filter id="ua07shadow" x="-30%" y="-60%" width="160%" height="220%">'
      +     '<feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="rgba(0,0,0,0.45)"/>'
      +   '</filter>'
      +   '<filter id="ua07glow" x="-30%" y="-60%" width="160%" height="220%">'
      +     '<feGaussianBlur stdDeviation="2.4" result="b"/>'
      +     '<feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .50 0" result="g"/>'
      +     '<feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>'
      +   '</filter>'
      + '</defs>'

      + '<g filter="url(#ua07shadow)">' 
      +   '<rect x="6" y="10" width="308" height="52" rx="18" fill="rgba(16,18,28,0.62)" stroke="rgba(255,255,255,0.18)"/>'
      +   '<rect x="8" y="12" width="304" height="48" rx="16" fill="url(#ua07glass)" opacity="0.92"/>'
      +   '<path d="M20 18H300" stroke="rgba(255,255,255,0.10)" stroke-width="2" stroke-linecap="round"/>'
      +   '<path d="M28 58H292" stroke="rgba(255,255,255,0.08)" stroke-width="2" stroke-linecap="round"/>'
      + '</g>'

      + '<g filter="url(#ua07glow)">' 
      +   '<g fill="none" stroke="url(#ua07g)" stroke-width="4.8" stroke-linecap="round" stroke-linejoin="round">'
      +     '<path d="M48 26v18c0 10 7 14 18 14s18-4 18-14V26"/>'
      +     '<path d="M104 58L120 24l16 34"/>'
      +     '<path d="M112 44h16"/>'
      +   '</g>'
      +   '<path d="M156 24v34" stroke="rgba(255,255,255,0.16)" stroke-width="2" stroke-linecap="round"/>'
      +   '<text x="174" y="52" font-family="system-ui,Segoe UI,Arial" font-size="30" font-weight="850" letter-spacing="2.2" fill="#ff1a1a">07</text>'
      +   '<path d="M232 30h64" stroke="rgba(255,255,255,0.18)" stroke-width="2" stroke-linecap="round"/>'
      +   '<path d="M232 46h48" stroke="rgba(255,255,255,0.12)" stroke-width="2" stroke-linecap="round"/>'
      + '</g>'
      + '</svg>';
    document.body.appendChild(el);
    return el;
  }

  function findSearch(){
    return document.getElementById("searchInput")
      || document.querySelector("input.search-input")
      || document.querySelector(".search-container input")
      || document.querySelector("input[type='search']")
      || document.querySelector("input[id*='search' i], input[class*='search' i]");
  }

  function findAHT(){
    return document.getElementById("mndoQueryTimer")
      || document.querySelector("#MNDO_AHT_TAGS_STACK #mndoQueryTimer");
  }

  var raf = 0;
  function place(){
    raf = 0;
    var logo = ensure();
    var s = findSearch();
    if(!s) return;
    var a = findAHT();

    var sx = (window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0);
    var sy = (window.pageYOffset || document.documentElement.scrollTop  || document.body.scrollTop  || 0);

    var sr = s.getBoundingClientRect();
    var ar = a ? a.getBoundingClientRect() : null;

    // vertically centered with the search input
    var top = Math.round(sy + sr.top + (sr.height - logo.offsetHeight)/2);

    // horizontally: prefer the gap between Search and AHT; otherwise stick right of search
    var left;
    if(ar && (ar.left > sr.right + 12)){
      var gapL = sx + sr.right + 10;
      var gapR = sx + ar.left - 10 - logo.offsetWidth;
      left = Math.round((gapL + gapR) / 2);
      if(left < gapL) left = gapL;
      if(left > gapR) left = gapR;
    }else{
      left = Math.round(sx + sr.right + 12);
    }

    // clamp inside viewport
    var minL = sx + 6;
    var maxL = sx + Math.max(6, (window.innerWidth - logo.offsetWidth - 6));
    if(left < minL) left = minL;
    if(left > maxL) left = maxL;

    logo.style.top = top + "px";
    logo.style.left = left + "px";
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(place);
  }

  function boot(){
    schedule();
    setTimeout(schedule, 120);
    setTimeout(schedule, 350);
    setTimeout(schedule, 900);
    window.addEventListener("resize", function(){ setTimeout(schedule, 40); });
    // Removed scroll listener to allow natural scrolling of logo and timer
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  }else{
    boot();
  }
  window.addEventListener("load", boot, {once:true});
})();



(function(){
  "use strict";

  // IMPORTANT: Keep AHT (mndoQueryTimer) in its original place.
  // A previous patch moved it under the UA07 logo (MNDO_TIMER_UNDER_LOGO_WRAP),
  // which caused the UA07/envelope group to jump and the AHT pill to drift.
  // This block is intentionally disabled to preserve the original layout.
  return;

  function ensureWrap(){
    var w = document.getElementById("MNDO_TIMER_UNDER_LOGO_WRAP");
    if(w) return w;
    w = document.createElement("div");
    w.id = "MNDO_TIMER_UNDER_LOGO_WRAP";
    document.body.appendChild(w);
    return w;
  }

  function findLogo(){
    // Support both legacy and v3 UA07 logo IDs. Prefer v3 if available.
    return document.getElementById("MNDO_UA07_LOGO3") || document.getElementById("MNDO_UA07_LOGO");
  }

  function findTimer(){
    return document.getElementById("mndoQueryTimer");
  }

  var raf = 0;
  function place(){
    raf = 0;

    var logo = findLogo();
    var timer = findTimer();
    if(!logo || !timer) return false;

    // Mark as "fixed under logo" so other patches don't re-parent it.
    try{ timer.dataset.mndoFixedUnderLogo = "1"; }catch(e){}

    var wrap = ensureWrap();
    if(timer.parentNode !== wrap) wrap.appendChild(timer);

    var r = logo.getBoundingClientRect();
    var cx = r.left + (r.width/2);
    var top = r.bottom + 6;

    wrap.style.left = Math.round(cx) + "px";
    wrap.style.top  = Math.round(top) + "px";
    wrap.style.transform = "translateX(-50%)";

    return true;
  }

  function schedulePlace(){
    if(raf) return;
    raf = requestAnimationFrame(place);
  }

  function boot(){
    // The page is generated via document.write → retry until both elements exist.
    var tries = 0;
    var t = setInterval(function(){
      tries++;
      if(place() || tries > 600){
        clearInterval(t);
      }
    }, 50);

    window.addEventListener("resize", function(){ setTimeout(schedulePlace, 40); });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  }else{
    boot();
  }
  window.addEventListener("load", boot, {once:true});
})();



(function(){
  "use strict";
  function place(){
    var t = document.getElementById('bat2');
    if(!t) return;

    // Do not pin the Tags button; keep it in the normal document flow
    // Clear any fixed positioning that may have been applied by older code
    t.style.position = '';
    t.style.zIndex   = '';
    t.style.left     = '';
    t.style.right    = '';
    t.style.top      = '';
    // Remove forced display/opacity/visibility; allow CSS to control appearance
    t.style.display  = '';
    t.style.visibility = '';
    t.style.opacity  = '';
    // Nothing else to do
    return;
  }

  function boot(){
    place();
    setTimeout(place, 120);
    setTimeout(place, 350);
    setTimeout(place, 900);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, {once:true});
  }else{
    boot();
  }
  window.addEventListener('load', boot, {once:true});
  window.addEventListener('resize', function(){ setTimeout(place, 50); });
  window.addEventListener('scroll', function(){ place(); }, {passive:true});
})();



(function(){
  "use strict";

  function findMobileBtn(){
    var cand = Array.prototype.slice.call(document.querySelectorAll("button.tablinks, .tablinks"));
    for(var i=0;i<cand.length;i++){
      var t = (cand[i].textContent||"").trim().toLowerCase();
      if(t === "mobile") return cand[i];
    }
    var btns = Array.prototype.slice.call(document.querySelectorAll("button"));
    for(var j=0;j<btns.length;j++){
      var tt = (btns[j].textContent||"").trim().toLowerCase();
      if(tt === "mobile") return btns[j];
    }
    return null;
  }

  function resetInline(el){
    if(!el) return;
    try{
      el.style.position = "";
      el.style.top = "";
      el.style.right = "";
      el.style.bottom = "";
      el.style.left = "";
      el.style.margin = "";
      el.style.visibility = "";
      el.style.opacity = "";
      el.style.display = "";
    }catch(e){}
  }

  function apply(){
    var tags = document.getElementById("bat2");
    var ath  = document.getElementById("mndoQueryTimer");
    var mobile = findMobileBtn();
    if(!tags || !ath || !mobile) return false;

    // Ensure ATH is allowed to be stacked again
    try{ if(ath.dataset) delete ath.dataset.mndoFixedUnderLogo; }catch(e){}

    // Cancel any forced fixed positioning applied by other patches
    resetInline(tags);
    resetInline(ath);

    // Do not reposition or wrap the elements; allow them to scroll naturally
    return true;
  }

  function run(){
    apply();
    setTimeout(apply, 120);
    setTimeout(apply, 350);
    setTimeout(apply, 900);
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run, {once:true});
  }else{
    run();
  }
  window.addEventListener("load", run, {once:true});
  window.addEventListener("resize", function(){ setTimeout(apply, 80); });
  // Removed scroll listener so the AHT and Tags stack scrolls with the page
})();



(function(){
  "use strict";

  function ensureLogo(){
    var el = document.getElementById("MNDO_UA07_LOGO3");
    if(el) return el;

    el = document.createElement("div");
    el.id = "MNDO_UA07_LOGO3";
    el.innerHTML = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 74" aria-hidden="true">
  <defs>
    <linearGradient id="ua07g3" x1="14" y1="10" x2="266" y2="62" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#9AE6FF"/>
      <stop offset="0.52" stop-color="#FF7AD9"/>
      <stop offset="1" stop-color="#FFE08A"/>
    </linearGradient>
    <linearGradient id="ua07glass3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0.06)"/>
    </linearGradient>
    <filter id="ua07glow3" x="-30%" y="-60%" width="160%" height="220%">
      <feGaussianBlur stdDeviation="3.2" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .55 0" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <g filter="url(#ua07glow3)">
    <rect x="6" y="10" width="268" height="54" rx="18" fill="rgba(16,18,28,0.62)" stroke="rgba(255,255,255,0.18)"/>
    <rect x="8" y="12" width="264" height="50" rx="16" fill="url(#ua07glass3)" opacity="0.90"/>
    <path d="M22 18h236" stroke="rgba(255,255,255,0.10)" stroke-width="2" stroke-linecap="round"/>
  </g>

  <!-- UA monogram -->
  <g fill="none" stroke="url(#ua07g3)" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M46 26v20c0 10 7 15 17 15s17-5 17-15V26"/>
    <path d="M92 61L109 26l17 35"/>
    <path d="M100 46h18"/>
  </g>

  <path d="M142 26v32" stroke="rgba(255,255,255,0.16)" stroke-width="2.2" stroke-linecap="round"/>

  <!-- 07 (bigger) -->
  <text x="156" y="56" font-family="system-ui,Segoe UI,Arial" font-size="36" font-weight="900" letter-spacing="1.7" fill="#ff1a1a">07</text>

  <!-- Creative micro-details -->
  <path d="M214 30h46" stroke="rgba(255,255,255,0.20)" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M214 52h58" stroke="rgba(255,255,255,0.12)" stroke-width="2.2" stroke-linecap="round"/>
  <path class="ua07-shine" d="M24 58 C70 34, 130 26, 256 18" stroke="rgba(255,255,255,0.22)" stroke-width="3" stroke-linecap="round" opacity="0.12"/>
</svg>

<div id="UA07_SECRET_ENVELOPE_WRAP" aria-hidden="false">
  <button id="UA07_SECRET_ENVELOPE" type="button" title="Secret tool warning" aria-label="Secret tool warning">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6.5h16c.55 0 1 .45 1 1v9c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-9c0-.55.45-1 1-1z" fill="rgba(255,255,255,0.10)"/>
      <path d="M4 7l8 6 8-6" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M4 16l6.3-4.7" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M20 16l-6.3-4.7" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M5.2 8.2h13.6" fill="none" stroke="rgba(255,26,26,0.85)" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
  </button>
</div>`;
    document.body.appendChild(el);
    return el;
  }

  function ensureSecretModal(){
    var existing = document.getElementById("UA07_SECRET_MODAL");
    if(existing) return existing;

    var modal = document.createElement("div");
    modal.id = "UA07_SECRET_MODAL";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="ua07-secret-backdrop" data-ua07-close="1"></div>
      <div class="ua07-secret-card" role="document" dir="rtl">
        <div class="ua07-secret-head">
          <div class="ua07-secret-icon" aria-hidden="true">🚨</div>
          <div class="ua07-secret-title">تحذير</div>
        </div>
        <div class="ua07-secret-body">
          <div class="ua07-secret-lead">تنبيه هام</div>
          <div class="ua07-secret-text">دي أداة سرّية وحساسة جدًا. استخدمها بحذر شديد فقط.</div>
          <div class="ua07-secret-text">لان استخدامها بعلم احد قد يؤدي إلى إجراء فوري — أقلها HR.</div>
        </div>
        <div class="ua07-secret-actions">
          <button class="ua07-btn ua07-primary" type="button" data-ua07-ok="1">فهمت</button>
          <button class="ua07-btn ua07-ghost" type="button" data-ua07-close="1">إلغاء</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  

function ensureUpdateModal(){
  var existing = document.getElementById("UA07_UPDATE_MODAL");
  if(existing) return existing;

  var modal = document.createElement("div");
  modal.id = "UA07_UPDATE_MODAL";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="ua07-secret-backdrop" data-ua07-update-close="1"></div>
    <div class="ua07-secret-card" role="document" dir="rtl">
      <div class="ua07-secret-head">
        <div class="ua07-secret-icon" aria-hidden="true">
          <span class="ua07-chip ua07-chip-new">NEW</span>
          <span class="ua07-chip ua07-chip-last">LAST UPDATE</span>
        </div>
        <div class="ua07-secret-title">آخر التحديثات</div>
      </div>
      <div class="ua07-secret-body">
        <ul class="ua07-secret-list">
          <li><b>UA07:</b> إضافة أيقونة تحذير + نافذة تحذير (Modal) بنص معتمد وزري “فهمت / إلغاء”.</li>
          <li><b>SR Technical:</b> تحديث أسماء وروابط الأدوات + تحديث كامل اسفل الصفحه عند Ticket Maker<br>بروابط فعاله</li>
          <li><b>SR Sales:</b> تعديل أسماء وروابط أزرار الصف الأول: IVR / BSS / we app / Tech Concession.</li>
          <li><b>Mobile:</b> إضافة أدوات جديدة بنفس تنسيق SR Sales (UNMS / ADM Tooltip / REMEDY / Verification / WE Air zone) مع إبقاء All Tools آخر زر.</li>
          <li><b>Tags & Timer:</b> تعديل الـ tags، والـ Timer أصبح يعد حتى 24 ساعة (بالدقائق: اكتب 180 = 3 ساعات وهكذا) + منبه بصيغة 24 ساعة (بعد الظهر: اكتب 13 = 1 مساءً، و00 = 12 صباحًا)، مع إمكانية تصغيره/إرجاعه من النقطة بجانب Timer.</li>
          <li><b>Control Panel:</b> داخل وحدة تحكم ال tags إضافة مود “IVR” لإدارة وإضافة canned messages للـ IVR حسب (Technical / Sales / Mobile).</li>
          <li><b>Timer &amp; Control Panel:</b> بقوا Sticky/Responsive مع الـScroll — بعد حوالي 8 سم بيتصغّروا لفوق تلقائي لزوم الدلع، وبضغطة على مكان التكبير/التصغير يرجعوا Full.<br>كمان تم دعم وضعين للتايمر: ساعة أو Timer بيحسب الوقت المحدد علشان يرن حتى لو شكلو ساعه بيكون التايمر شغال لو انت مشغله. واتضاف هوت كى زر * تقدر تضغط عليه بنفس منطق زر Reset ال فى التايمر ↻ يوقف التايمر ويرجّعه لضبط المصنع.</li>
          <li><b>UI:</b> ضبط وتحسين الألوان بشكل عام.</li>
        </ul>
      </div>
      <div class="ua07-secret-actions">
        <button class="ua07-btn ua07-primary" type="button" data-ua07-update-ok="1">فهمت</button>
        <button class="ua07-btn ua07-ghost" type="button" data-ua07-update-close="1">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Ensure close buttons work reliably even if other handlers stop propagation
  try {
    var closeEls = modal.querySelectorAll('[data-ua07-update-close], [data-ua07-update-ok]');
    closeEls.forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        closeUpdateModal();
      });
    });
  } catch(e){}
  return modal;
}

function openUpdateModal(){
  var modal = ensureUpdateModal();
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function closeUpdateModal(){
  var modal = document.getElementById("UA07_UPDATE_MODAL");
  if(!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}
function openSecretModal(){
    var modal = ensureSecretModal();
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeSecretModal(){
    var modal = document.getElementById("UA07_SECRET_MODAL");
    if(!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  function bindSecretWarning(){
    var logo = ensureLogo();
    var btn = logo.querySelector("#UA07_SECRET_ENVELOPE");
    if(!btn || btn.dataset.ua07Bound) return;
    btn.dataset.ua07Bound = "1";

    btn.addEventListener("click", function(e){
      e.preventDefault();
      e.stopPropagation();
      openSecretModal();
    });

    // Delegate close actions
    document.addEventListener("click", function(e){
      var t = e.target;
      if(!t) return;
      if(t.closest && t.closest("#UA07_SECRET_MODAL")){
        if(t.matches("[data-ua07-close]") || (t.closest && t.closest("[data-ua07-close]"))){
          closeSecretModal();
          return;
        }
        if(t.matches("[data-ua07-ok]") || (t.closest && t.closest("[data-ua07-ok]"))){
          closeSecretModal();
          return;
        }
      }
    }, true);

    document.addEventListener("keydown", function(e){
      if(e.key === "Escape") closeSecretModal();
    });
  }

function bindUpdateNotes(){
  var logo = ensureLogo();
  var btn = logo.querySelector("#UA07_UPDATE_ICON");
  if(!btn || btn.dataset.ua07Bound) return;
  btn.dataset.ua07Bound = "1";

  btn.addEventListener("click", function(e){
    e.preventDefault();
    e.stopPropagation();
    openUpdateModal();
  });

  document.addEventListener("click", function(e){
    var t = e.target;
    if(!t) return;
    if(t.closest && t.closest("[data-ua07-update-close]")){
      closeUpdateModal();
    }
    if(t.closest && t.closest("[data-ua07-update-ok]")){
      closeUpdateModal();
    }
  }, true);

  document.addEventListener("keydown", function(e){
    if(e.key === "Escape"){ closeUpdateModal(); }
  });
}


  function findSearch(){
    return document.getElementById("searchInput")
      || document.querySelector("input.search-input")
      || document.querySelector(".search-container input")
      || document.querySelector("input[type='search']")
      || document.querySelector("input[id*='search' i], input[class*='search' i]");
  }

  function findAht(){
    return document.getElementById("mndoQueryTimer")
      || document.querySelector("#MNDO_AHT_TAGS_STACK #mndoQueryTimer");
  }

  function place(){
    var logo = ensureLogo();
    var s = findSearch();
    if(!s) return false;

    var a = findAht();

    var sx = (window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0);
    var sy = (window.pageYOffset || document.documentElement.scrollTop  || document.body.scrollTop  || 0);

    var sr = s.getBoundingClientRect();
    var ar = a ? a.getBoundingClientRect() : null;

    // align with search input (page coordinates so it scrolls with the page)
    var top = Math.round(sy + sr.top + (sr.height - logo.offsetHeight)/2) - 1;
    if(top < (sy + 6)) top = sy + 6;

    // center in the gap between search and AHT, else left of search
    var left;
    if(ar && (ar.left > sr.right + 12)){
      var gapL = sx + sr.right + 10;
      var gapR = sx + ar.left - 10 - logo.offsetWidth;
      left = Math.round((gapL + gapR) / 2);
      if(left < gapL) left = gapL;
      if(left > gapR) left = gapR;
    }else{
      left = Math.round(sx + sr.left - logo.offsetWidth - 12);
    }

    // clamp
    var minL = sx + 6;
    var maxL = sx + Math.max(6, (window.innerWidth - logo.offsetWidth - 6));
    if(left < minL) left = minL;
    if(left > maxL) left = maxL;

    logo.style.top = top + "px";
    logo.style.left = left + "px";
    return true;
  }

  function boot(){
    // Try multiple times because the page is generated via document.write
    var ok = place();
    bindSecretWarning();
    bindUpdateNotes();
    var tries = 0;
    var t = setInterval(function(){
      tries++;
      if(place()){ bindSecretWarning();
    bindUpdateNotes(); }
      if(place() || tries > 35){ clearInterval(t); }
    }, 200);

    setTimeout(place, 120);
    setTimeout(place, 350);
    setTimeout(place, 900);
    setTimeout(bindSecretWarning, 140);
    setTimeout(bindSecretWarning, 420);
    setTimeout(bindSecretWarning, 980);

    // Re-place on resize ONLY (no scroll listener -> it will scroll away like Tags)
    window.addEventListener("resize", function(){ setTimeout(place, 40); setTimeout(bindSecretWarning, 60); });
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", boot, {once:true});
  }else{
    boot();
  }
  window.addEventListener("load", boot, {once:true});
})();



                                                function updateInput() {

                                                        var ip_count = document.getElementById("ip_count").value;

                                                        var ip = document.getElementById("original_ip").value;

                                                        var base = ip.split(".");

                                                        var last = parseInt(base[3]);

                                                        var ips = "";

                                                        var cpe_ip = "";

                                                        if (ip_count == 2) {

                                                                ips = ip + "\n";

                                                                cpe_ip = base[0] + "." + base[1] + "." + base[2] + "." + (1);

                                                        } else if (ip_count == 3) {

                                                                ips = base[0] + "." + base[1] + "." + base[2] + "." + (last + 2) + "\n";

                                                                cpe_ip = base[0] + "." + base[1] + "." + base[2] + "." + (last + 1);

                                                        } else if (ip_count == 2 || ip_count == 4) {

                                                                ips = ip + "\n";

                                                                cpe_ip = base[0] + "." + base[1] + "." + base[2] + "." + (last + 1);

                                                        } else {

                                                                for (var i = 2; i <= ip_count; i++) {

                                                                        ips += base[0] + "." + base[1] + "." + base[2] + "." + (last + i) + "\n";

                                                                }

                                                                cpe_ip = base[0] + "." + base[1] + "." + base[2] + "." + (last + 1);

                                                        }

                                                        if (ip_count == 2) {

                                                                document.getElementById("ip_list").value = ip + "\n";

                                                        } else if (ip_count == 3) {

                                                                document.getElementById("ip_list").value = base[0] + "." + base[1] + "." + base[2] + "." + (last + 2) + "\n";

                                                        } else {

                                                                document.getElementById("ip_list").value = ips;

                                                        }

                                                        // check if option is "Option New Solution" and the last number of the IP is 1
                                                        if (ip_count == 2 && base[3] == "1") {

                                                                cpe_ip = base[0] + "." + base[1] + "." + base[2] + "." + (254);

                                                        }

                                                        document.getElementById("Cpe-IP").value = cpe_ip;

                                                }
                                        


                                                function subNet() {
                                                        var subnet_mask = "";
                                                        var ip_count = document.getElementById("ip_count").value;
                                                        if (ip_count == "3" || ip_count == "Option Pack 1") {
                                                                subnet_mask = "255.255.255.252";
                                                        } else if (ip_count == "6" || ip_count == "Option Pack 2") {
                                                                subnet_mask = "255.255.255.248";
                                                        } else if (ip_count == "14" || ip_count == "Option Pack 3") {
                                                                subnet_mask = "255.255.255.240";
                                                        } else if (ip_count == "2" || ip_count == "Option New Solution") {
                                                                subnet_mask = "255.255.255.0";
                                                        }
                                                        document.getElementById("subnet_mask").value = subnet_mask;
                                                }
                                        


                                                function subNet() {
                                                        var subnet_mask = "";
                                                        var ip_count = document.getElementById("ip_count").value;
                                                        if (ip_count == "3" || ip_count == "Option Pack 1") {
                                                                subnet_mask = "255.255.255.252";
                                                        } else if (ip_count == "6" || ip_count == "Option Pack 2") {
                                                                subnet_mask = "255.255.255.248";
                                                        } else if (ip_count == "14" || ip_count == "Option Pack 3") {
                                                                subnet_mask = "255.255.255.240";
                                                        } else if (ip_count == "2" || ip_count == "Option New Solution") {
                                                                subnet_mask = "255.255.255.0";
                                                        }
                                                        document.getElementById("subnet_mask").value = subnet_mask;
                                                }
                                        


                                // نفس سكريبتك مع حساب تلقائي عند الإدخال
                                document.getElementById("myDayy").addEventListener("input", function () {
                                        var myDays = document.getElementById("myDayy").value;
                                        var result = myDays / 60;
                                        document.getElementById("myGg").value = result.toString(); // بدون فواصل
                                });
                        


                                function calculatePrice() {
                                        // Parse selected package price as a number. Default to 0 if not a number
                                        var productValue = parseFloat(document.getElementById("products").value);
                                        if (isNaN(productValue)) productValue = 0;
                                        var services = 0;
                                        var discounts = 0;
                                        var Extra = 0;
                                        var OptionP = 0;
                                        var paly = 0;

                                        // الحصول على الأزرار المفعلة
                                        if (document.getElementById("service1").classList.contains("active")) {
                                                services += 5;
                                        }
                                        if (document.getElementById("service2").classList.contains("active")) {
                                                services += 10;
                                        }
                                        if (document.getElementById("service3").classList.contains("active")) {
                                                services += 20;
                                        }
                                        if (document.getElementById("service4").classList.contains("active")) {
                                                services += 50;
                                        }

                                        if (document.getElementById("discount1").classList.contains("active")) {
                                                discounts += 0.25;
                                        }
                                        if (document.getElementById("discount2").classList.contains("active")) {
                                                discounts += 0.50;
                                        }

                                        if (document.getElementById("extra30").classList.contains("active")) {
                                                Extra += 52;
                                        }
                                        if (document.getElementById("extra50").classList.contains("active")) {
                                                Extra += 105;
                                        }
                                        if (document.getElementById("extra100").classList.contains("active")) {
                                                Extra += 170;
                                        }

                                        if (document.getElementById("op10").classList.contains("active")) {
                                                OptionP += 67;
                                        }
                                        if (document.getElementById("op20").classList.contains("active")) {
                                                OptionP += 330;
                                        }
                                        if (document.getElementById("op30").classList.contains("active")) {
                                                OptionP += 750;
                                        }

                                        if (document.getElementById("add1").classList.contains("active")) {
                                                paly += 75;
                                        }
                                        if (document.getElementById("add2").classList.contains("active")) {
                                                paly += 150;
                                        }

                                        var balanceVal = parseFloat(document.getElementById("balance").value);
                                        if (isNaN(balanceVal)) balanceVal = 0;
                                        var priceWithoutTax = productValue * (1 - discounts) + services + OptionP + paly + Extra - balanceVal;
                                        var priceWithTax = priceWithoutTax * 1.14;

                                        document.getElementById("priceWithTax").value = priceWithTax.toFixed(2);
                                        document.getElementById("priceWithoutTax").value = priceWithoutTax.toFixed(2);
                                }

                                function resetForm() {
                                        document.getElementById("products").value = "0";
                                        document.getElementById("balance").value = "0.00";
                                        document.getElementById("priceWithTax").value = "0.00";
                                        document.getElementById("priceWithoutTax").value = "0.00";

                                        document.querySelectorAll('.service-btn, .discount-btn, .extra-btn, .op-btn, .add-btn').forEach(function (btn) {
                                                btn.classList.remove('active');
                                        });

                                        calculatePrice();
                                }

                                function toggleButton(button) {
                                        button.classList.toggle('active');
                                        calculatePrice();
                                }

                        


                                const tax = 0.14;
                                let currentMode = 'with';

                                function selectMode(mode) {
                                        currentMode = mode;
                                        document.getElementById("shamel1").classList.remove("active");
                                        document.getElementById("shamel2").classList.remove("active");
                                        if (mode === "with") {
                                                document.getElementById("shamel1").classList.add("active");
                                        } else {
                                                document.getElementById("shamel2").classList.add("active");
                                        }
                                        getNum();
                                }

                                function getNum() {
                                        const input = parseFloat(document.getElementById("nom1").value);
                                        if (!isNaN(input)) {
                                                let result = currentMode === "with" ? input / (1 + tax) : input * (1 + tax);
                                                document.getElementById("nom2").value = result.toFixed(2);
                                        } else {
                                                document.getElementById("nom2").value = "";
                                        }
                                }

function remove() {
                                        document.getElementById("nom1").value = "";
                                        document.getElementById("nom2").value = "";
                                }
                        


function resetAllPackages() {
                                        document.getElementById("service1").checked = false;
                                        document.getElementById("service2").checked = false;
                                        document.getElementById("service3").checked = false;
                                        document.getElementById("service4").checked = false;
                                        document.getElementById("discount1").checked = false;
                                        document.getElementById("discount2").checked = false;
                                        document.getElementById("extra30").checked = false;
                                        document.getElementById("extra50").checked = false;
                                        document.getElementById("extra100").checked = false;
                                        document.getElementById("op10").checked = false;
                                        document.getElementById("op20").checked = false;
                                        document.getElementById("op30").checked = false;
                                        document.getElementById("add1").checked = false;
                                        document.getElementById("add2").checked = false;
                                        document.getElementById("balance").value = "0.00";
                                        document.getElementById("priceWithoutTax").value = "0.00";
                                        document.getElementById("priceWithTax").value = "0.00";
                                        document.getElementById("products").value = "0";
                                        document.getElementById("nom1").value = "";
                                        document.getElementById("nom2").value = "";


                                }
                        


                                function truncateToTwoDecimals(num) {
                                        return Math.floor(num * 100) / 100;
                                }

                                function convertBytes() {
                                        // Get the input values
                                        const bytesStr1 = document.getElementById('bytesInput1').value.trim();
                                        const bytesStr2 = document.getElementById('bytesInput2').value.trim();
                                        const bytesStr3 = document.getElementById('bytesInput3').value.trim();

                                        // Initialize total bytes
                                        let totalBytes = 0;

                                        // Array to hold the input values
                                        const bytesArray = [bytesStr1, bytesStr2, bytesStr3];

                                        // Loop through the array and add up the bytes
                                        for (const bytesStr of bytesArray) {
                                                if (bytesStr) {
                                                        const bytesNum = parseFloat(bytesStr);
                                                        if (isNaN(bytesNum) || bytesNum < 0) {
                                                                document.getElementById('resultGB').innerText = 'Please enter valid positive numeric values.';
                                                                document.getElementById('resultMB').innerText = '';
                                                                return;
                                                        }
                                                        totalBytes += bytesNum;
                                                }
                                        }

                                        if (totalBytes === 0) {
                                                document.getElementById('resultGB').innerText = 'Please enter some data to convert.';
                                                document.getElementById('resultMB').innerText = '';
                                                return;
                                        }

                                        // Calculate the value in GB and MB
                                        const gbValue = truncateToTwoDecimals(totalBytes / 1024 / 1024 / 1024);
                                        const mbValue = truncateToTwoDecimals(totalBytes / 1024 / 1024);

                                        // Display the results
                                        document.getElementById('resultGB').innerText = `Total data is: ${gbValue} GB`;
                                        document.getElementById('resultMB').innerText = `Total data is: ${mbValue} MB`;
                                }

                                // Add event listeners to each input field to call convertBytes on input change
                                document.getElementById('bytesInput1').addEventListener('input', convertBytes);
                                document.getElementById('bytesInput2').addEventListener('input', convertBytes);
                                document.getElementById('bytesInput3').addEventListener('input', convertBytes);
                        


                                                                //variables
                                                                var pkg = 0;
                                                                var cp = 0;
                                                                var rq = 0;



                                                                function clearall() {

                                                                        $("#pq,#cq,#rq,#dstatus,#other_pkg").html('');
                                                                        $("#error").hide();
                                                                        renderQuotaSummary();
                                                                }



                                                                function getQuotaSummaryNodes() {
                                                                        return {
                                                                                card: document.getElementById('quotaSummaryCard'),
                                                                                packageValue: document.getElementById('quotaSummaryPackage'),
                                                                                remainingValue: document.getElementById('quotaSummaryRemaining'),
                                                                                consumedValue: document.getElementById('quotaSummaryConsumed'),
                                                                                copyBtn: document.getElementById('quotaSummaryCopyBtn')
                                                                        };
                                                                }

                                                                function getQuotaRawBytes() {
                                                                        var remainingInput = document.getElementById('bss_pkg');
                                                                        var packageLabel = document.getElementById('pq');
                                                                        var BYTES_PER_GB = 1073741824;
                                                                        var remainingBytes = Number(remainingInput && remainingInput.value ? remainingInput.value.trim() : '');
                                                                        var packageGb = Number(packageLabel && packageLabel.textContent ? packageLabel.textContent.trim() : '');

                                                                        if (!isFinite(remainingBytes) || remainingBytes < 0) remainingBytes = null;
                                                                        if (!isFinite(packageGb) || packageGb < 0) packageGb = null;

                                                                        var packageBytes = packageGb == null ? null : Math.round(packageGb * BYTES_PER_GB);
                                                                        var consumedBytes = (packageBytes == null || remainingBytes == null) ? null : Math.max(packageBytes - remainingBytes, 0);

                                                                        return {
                                                                                packageBytes: packageBytes,
                                                                                remainingBytes: remainingBytes,
                                                                                consumedBytes: consumedBytes
                                                                        };
                                                                }

                                                                function getApproximateQuotaTextFromBytes(rawBytes) {
                                                                        var numericBytes = Number(rawBytes);
                                                                        if (!isFinite(numericBytes) || numericBytes < 0) return '';

                                                                        var BYTES_PER_GB = 1073741824;
                                                                        var BYTES_PER_MB = 1048576;
                                                                        var wholeGb = Math.floor(numericBytes / BYTES_PER_GB);
                                                                        var remainingBytes = numericBytes - (wholeGb * BYTES_PER_GB);
                                                                        var megaBytes = Math.round(remainingBytes / BYTES_PER_MB);

                                                                        if (megaBytes >= 1024) {
                                                                                wholeGb += 1;
                                                                                megaBytes = 0;
                                                                        }

                                                                        if (megaBytes <= 0) return '';
                                                                        if (wholeGb <= 0) return '≈ ' + megaBytes + ' ميجا';
                                                                        return '≈ ' + wholeGb + ' جيجا و' + megaBytes + ' ميجا';
                                                                }

                                                                function getQuotaDisplayData(rawValue, approxBytes) {
                                                                        var cleanValue = String(rawValue == null ? '' : rawValue).trim();
                                                                        if (cleanValue === '') {
                                                                                return {
                                                                                        exact: '—',
                                                                                        approx: '',
                                                                                        htmlText: '—'
                                                                                };
                                                                        }

                                                                        var numericValue = Number(cleanValue);
                                                                        if (!isFinite(numericValue)) {
                                                                                return {
                                                                                        exact: cleanValue,
                                                                                        approx: '',
                                                                                        htmlText: cleanValue
                                                                                };
                                                                        }

                                                                        var exactText = cleanValue + ' جيجا';
                                                                        var approxText = getApproximateQuotaTextFromBytes(approxBytes);
                                                                        var htmlText = approxText ? exactText + ' (' + approxText + ')' : exactText;

                                                                        return {
                                                                                exact: exactText,
                                                                                approx: approxText,
                                                                                htmlText: htmlText
                                                                        };
                                                                }

                                                                function setQuotaSummaryValue(targetNode, rawValue, approxBytes) {
                                                                        if (!targetNode) return;
                                                                        var displayData = getQuotaDisplayData(rawValue, approxBytes);
                                                                        targetNode.textContent = displayData.exact;

                                                                        var oldApprox = targetNode.querySelector('.quota-approx');
                                                                        if (oldApprox) oldApprox.remove();

                                                                        if (displayData.approx) {
                                                                                var approxNode = document.createElement('span');
                                                                                approxNode.className = 'quota-approx';
                                                                                approxNode.textContent = displayData.approx;
                                                                                targetNode.appendChild(approxNode);
                                                                        }
                                                                }

                                                                function buildQuotaSummaryHtml() {
                                                                        var rawBytes = getQuotaRawBytes();
                                                                        var packageText = document.getElementById('pq') ? document.getElementById('pq').textContent.trim() : '';
                                                                        var remainingText = document.getElementById('rq') ? document.getElementById('rq').textContent.trim() : '';
                                                                        var consumedText = document.getElementById('cq') ? document.getElementById('cq').textContent.trim() : '';

                                                                        var packageDisplay = getQuotaDisplayData(packageText, null).htmlText;
                                                                        var remainingDisplay = getQuotaDisplayData(remainingText, rawBytes.remainingBytes).htmlText;
                                                                        var consumedDisplay = getQuotaDisplayData(consumedText, rawBytes.consumedBytes).htmlText;

                                                                        return `الباقه الاساسيه  :	${packageDisplay}<br>
المتبقى  :	${remainingDisplay}<br>
الاستهلاك  :	${consumedDisplay}`;
                                                                }

                                                                function renderQuotaSummary() {
                                                                        var nodes = getQuotaSummaryNodes();
                                                                        if (!nodes.card || !nodes.packageValue || !nodes.remainingValue || !nodes.consumedValue) return;

                                                                        var rawBytes = getQuotaRawBytes();
                                                                        var packageText = document.getElementById('pq') ? document.getElementById('pq').textContent.trim() : '';
                                                                        var remainingText = document.getElementById('rq') ? document.getElementById('rq').textContent.trim() : '';
                                                                        var consumedText = document.getElementById('cq') ? document.getElementById('cq').textContent.trim() : '';
                                                                        var hasVisibleData = packageText !== '' || remainingText !== '' || consumedText !== '';

                                                                        nodes.card.hidden = !hasVisibleData;
                                                                        if (!hasVisibleData) return;

                                                                        setQuotaSummaryValue(nodes.packageValue, packageText, null);
                                                                        setQuotaSummaryValue(nodes.remainingValue, remainingText, rawBytes.remainingBytes);
                                                                        setQuotaSummaryValue(nodes.consumedValue, consumedText, rawBytes.consumedBytes);
                                                                }

                                                                function copyQuotaSummaryHtml() {
                                                                        var htmlText = buildQuotaSummaryHtml();
                                                                        var nodes = getQuotaSummaryNodes();
                                                                        var copyBtn = nodes.copyBtn;

                                                                        function markCopied() {
                                                                                if (!copyBtn) return;
                                                                                var originalText = copyBtn.getAttribute('data-original-text') || copyBtn.textContent;
                                                                                copyBtn.setAttribute('data-original-text', originalText);
                                                                                copyBtn.textContent = 'تم النسخ';
                                                                                copyBtn.classList.add('is-copied');
                                                                                clearTimeout(copyBtn._quotaCopyTimer);
                                                                                copyBtn._quotaCopyTimer = setTimeout(function () {
                                                                                        copyBtn.textContent = originalText;
                                                                                        copyBtn.classList.remove('is-copied');
                                                                                }, 1500);
                                                                        }

                                                                        if (navigator.clipboard && navigator.clipboard.writeText) {
                                                                                navigator.clipboard.writeText(htmlText).then(markCopied).catch(function () {
                                                                                        var tempArea = document.createElement('textarea');
                                                                                        tempArea.value = htmlText;
                                                                                        document.body.appendChild(tempArea);
                                                                                        tempArea.select();
                                                                                        document.execCommand('copy');
                                                                                        document.body.removeChild(tempArea);
                                                                                        markCopied();
                                                                                });
                                                                        } else {
                                                                                var tempArea = document.createElement('textarea');
                                                                                tempArea.value = htmlText;
                                                                                document.body.appendChild(tempArea);
                                                                                tempArea.select();
                                                                                document.execCommand('copy');
                                                                                document.body.removeChild(tempArea);
                                                                                markCopied();
                                                                        }
                                                                }

                                                                function calculate(now, config) {


                                                                        var pq = (config);
                                                                        var rq = (((now / 1024) / 1024) / 1024);
                                                                        rq = (Number(Math.round(parseFloat(rq + 'e' + 2)) + 'e-' + 2));

                                                                        $("#pq").html(pq).css("color", "#D0FA58");
                                                                        $("#rq").html(rq).css("color", "#D0FA58");

                                                                        (rq > pq) ? $("#cq").html("0") : $("#cq").html(pq - rq).css("color", "#D0FA58");

                                                                        if (now != 0) {
                                                                                if (rq == 0) {
                                                                                        $("#dstatus").html("تم انتهاء الباقه ").css("color", "D0FA58");
                                                                                } else {
                                                                                        $("#dstatus").html("الباقه لم تنتهى ").css("color", "#D0FA58");
                                                                                }
                                                                        } else {
                                                                                $("#dstatus").html("").css("color", "#D0FA58");
                                                                        }
                                                                        renderQuotaSummary();
                                                                }


                                                                function isnum(x) {
                                                                        var num = true;
                                                                        for (var i = 0; i < x.length; i++) {
                                                                                var number = (x[i]);

                                                                                if (isNaN(number) || number < 0)
                                                                                        num = false
                                                                        }
                                                                        return num;
                                                                }



                                                                $(document).ready(function () {

                                                                        // Hiding 

                                                                        $("#other_pkg,#error").hide();
                                                                        renderQuotaSummary();

                                                                        var quotaCopyBtn = document.getElementById('quotaSummaryCopyBtn');
                                                                        if (quotaCopyBtn && !quotaCopyBtn.dataset.bound) {
                                                                                quotaCopyBtn.dataset.bound = 'true';
                                                                                quotaCopyBtn.addEventListener('click', copyQuotaSummaryHtml);
                                                                        }

                                                                        $("#pkgs").change(function () {

                                                                                $("#bss_pkg").val("");

                                                                                var selected = $("#pkgs option:selected").text().trim();

                                                                                console.log(selected)

                                                                                if (selected.toLowerCase() == "other") {
                                                                                        clearall();

                                                                                        $("#other_pkg").show();

                                                                                } else if (selected.toLowerCase() == "please select") {
                                                                                        $("#other_pkg").hide();

                                                                                        clearall();

                                                                                        pkg = 0;
                                                                                        cp = 0;
                                                                                        rq = 0;
                                                                                } else {
                                                                                        $("#other_pkg").hide();

                                                                                        clearall();

                                                                                        pkg = selected;

                                                                                        var pq = pkg

                                                                                        $("#pq").html(pq);
                                                                                        renderQuotaSummary();


                                                                                }
                                                                        });

                                                                });

                                                                $("#other_pkg").bind("input", function () {

                                                                        clearall();

                                                                        pkg = $("#other_pkg").val().trim();

                                                                        $("#pq").html(pkg);
                                                                        renderQuotaSummary();

                                                                        $("#bss_pkg").val("");

                                                                })



                                                                $("#bss_pkg").bind("input change", function () {

                                                                        if ($(this).val().trim() != "") {

                                                                                var curr_real = $("#bss_pkg").val().trim();
                                                                                var arr = [curr_real];

                                                                                if (pkg > 0 && isnum([pkg])) {

                                                                                        if (isnum(arr)) {
                                                                                                $("#error").hide();

                                                                                                calculate(curr_real, pkg);

                                                                                        } else if (curr_real != '') {
                                                                                                $("#error").html("Please Enter valid number").show();
                                                                                                $("#rq,#cq,#dstatus").html('');
                                                                                                renderQuotaSummary();
                                                                                        }

                                                                                } else {
                                                                                        $("#error").html("Please Define CST Quota").show();
                                                                                        $("#rq,#cq,#dstatus").html('');
                                                                                        renderQuotaSummary();
                                                                                }

                                                                        } else {
                                                                                clearall();
                                                                        }

                                                                });
                                                        


                                                                const myDayInput = document.getElementById("myDay");
                                                                const myGInput = document.getElementById("myG");

                                                                myDayInput.addEventListener("input", () => {
                                                                        let myDays = parseFloat(myDayInput.value);
                                                                        if (!isNaN(myDays) && myDays >= 0) {
                                                                                let result = myDays * 1024 * 1024 * 1024;
                                                                                myGInput.value = result.toString();
                                                                        } else {
                                                                                myGInput.value = "";
                                                                        }
                                                                });
                                                        


                                                                function clearDorm() {
                                                                        window.location.href = window.location.pathname;

                                                                }
                                                        


                                                                        //variables
                                                                        var speed = 0;
                                                                        var method = '';
                                                                        var current = 0;



                                                                        function clear() {
                                                                                $("#reall,#manual").find("input").each(function () {

                                                                                        $(this).val('');

                                                                                });

                                                                                $("#minn,#maxx,#current,#dstattus").html('');
                                                                                $("#error").hide();
                                                                        }

                                                                        function clearboth() {
                                                                                $("#reall,#manual").find("input").each(function () {

                                                                                        $(this).val('');

                                                                                });

                                                                                $("#current,#dstattus").html('');
                                                                                $("#error").hide();
                                                                        }



                                                                        function calculatee(now, config) {


                                                                                var minn = config * 0.078125;
                                                                                var maxx = config * 0.1171875;

                                                                                $("#minn").html(minn);
                                                                                $("#maxx").html(maxx);
                                                                                $("#currentt").html(now);

                                                                                if (now != 0) {
                                                                                        if (now >= minn) {
                                                                                                $("#dstattus").html("Accepted").css("color", "green");
                                                                                        } else if (now < minn) {
                                                                                                $("#dstattus").html("Not Accepted").css("color", "red");
                                                                                        }
                                                                                } else {
                                                                                        $("#dstattus").html("");
                                                                                }
                                                                        }


                                                                        function isnum(x) {
                                                                                var num = true;
                                                                                for (var i = 0; i < x.length; i++) {
                                                                                        var number = (x[i]);

                                                                                        if (isNaN(number) || number < 0)
                                                                                                num = false
                                                                                }
                                                                                return num;
                                                                        }



                                                                        $(document).ready(function () {

                                                                                // Hiding 

                                                                                $("#other_speed,#reall,#manual,#error").hide();



                                                                                $("#speeds").change(function () {

                                                                                        var selected = $("#speeds").val();

                                                                                        if (selected == "other") {
                                                                                                clear();

                                                                                                $("#other_speed").show();

                                                                                        } else if (selected == "please select") {
                                                                                                $("#other_speed").hide();

                                                                                                clear();
                                                                                        } else {
                                                                                                $("#other_speed").hide();

                                                                                                clear();

                                                                                                speed = selected;

                                                                                                var minn = speed * 0.078125;
                                                                                                var maxx = speed * 0.1171875;

                                                                                                $("#minn").html(minn);
                                                                                                $("#maxx").html(maxx);;

                                                                                        }
                                                                                });

                                                                        });

                                                                        $("#other_speed").bind("change", function () {

                                                                                clear();

                                                                                speed = $("#other_speed").val().trim();

                                                                                var minn = speed * 0.078125;
                                                                                var maxx = speed * 0.1171875;

                                                                                $("#minn").html(minn);
                                                                                $("#maxx").html(maxx);


                                                                        })



                                                                        $('#ry,#rn').change(function () {

                                                                                clearboth();
                                                                                $("#reall,#manual,#error").hide();


                                                                                var tool = $("#tool input[type='radio']:checked").attr("id");


                                                                                if (tool == "rn") {
                                                                                        method = "manual";
                                                                                        $("#reall").hide();
                                                                                        $("#manual").show();
                                                                                } else {
                                                                                        method = "reall";
                                                                                        $("#manual").hide();
                                                                                        $("#reall").show();
                                                                                }


                                                                        });






                                                                        $("#assia_speed").bind("change keypress keyup paste", function () {


                                                                                if (method == "reall") {
                                                                                        var curr_reall = $("#assia_speed").val().trim();
                                                                                        var arr = [curr_reall];

                                                                                        if (speed > 0 && isnum([speed])) {
                                                                                                if (isnum(arr)) {
                                                                                                        $("#error").hide();

                                                                                                        current = curr_reall / 8;

                                                                                                        calculatee(current, speed);

                                                                                                } else if (curr_reall != '') {
                                                                                                        $("#error").html("Please Enter valid number").show();
                                                                                                        $("#current,#dstattus").html('');
                                                                                                }

                                                                                        } else {
                                                                                                $("#error").html("Please Define the configured speed").show();

                                                                                        }

                                                                                }
                                                                        });






                                                                        $("#f1,#f2,#f3").bind("change keypress keyup paste", function () {

                                                                                if (method == "manual") {
                                                                                        var f1 = $("#f1").val().trim();
                                                                                        var f2 = $("#f2").val().trim();
                                                                                        var f3 = $("#f3").val().trim();

                                                                                        var total = [];


                                                                                        if (f1 != '') total.push(f1);
                                                                                        if (f2 != '') total.push(f2);
                                                                                        if (f3 != '') total.push(f3);


                                                                                        if (speed > 0 && isnum([speed])) {

                                                                                                if (isnum(total)) {
                                                                                                        $("#error").hide();

                                                                                                        var curr_total = 0;

                                                                                                        for (var i = 0; i < total.length; i++) {
                                                                                                                curr_total = curr_total + parseFloat(total[i]);

                                                                                                        }


                                                                                                        current = curr_total;

                                                                                                        calculatee(current, speed);

                                                                                                } else if (total.length != 0) {
                                                                                                        $("#error").html("Please Enter valid numbers").show();
                                                                                                        $("#current,#dstattus").html('');
                                                                                                }

                                                                                        } else {
                                                                                                $("#error").html("Please Define the configured speed").show();

                                                                                        }
                                                                                }
                                                                        });
                                                                


                        function openCity(evt, cityName) {
                                var i, tabcontent, tablinks;
                                tabcontent = document.getElementsByClassName("tabcontent");
                                for (i = 0; i < tabcontent.length; i++) {
                                        tabcontent[i].style.display = "none";
                                }
                                tablinks = document.getElementsByClassName("tablinks");
                                for (i = 0; i < tablinks.length; i++) {
                                        tablinks[i].className = tablinks[i].className.replace(" active", "");
                                }
                                document.getElementById(cityName).style.display = "block";
                                evt.currentTarget.className += " active";
                        }
                


                        //Get the button
                        var mybutton = document.getElementById("myBtn");
                        // When the user scrolls down 20px from the top of the document, show the button
                        window.onscroll = function () {
                                scrollFunction()
                        };

                        function scrollFunction() {
                                if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
                                        mybutton.style.display = "block";
                                } else {
                                        mybutton.style.display = "none";
                                }
                        }

                        // When the user clicks on the button, scroll to the top of the document
                        function topFunction() {
                                document.body.scrollTop = 0;
                                document.documentElement.scrollTop = 0;
                        }
                


                        function openLink(event) {
                                event.preventDefault(); //منع فتح الرابط الأصلي والذهاب إلى الرابط الذي يتم إنشاؤه بدلا من ذلك
                                var link = event.target.href; //الحصول على رابط العنصر الذي تم النقر عليه
                                var myVariable = document.getElementById("arabiccNumber").value; // إنشاء المتغير
                                // Special case: SR Technical - BLQ → BLQ CPE Problem (srTypeId=102040017)
                                // This SR requires subsNumber to be populated before BMEWebToken to open correctly.
                                // Replace the subsNumber parameter with the full FBB value and do NOT append it at the end.
                                if (link && link.indexOf("srTypeId=102040017") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)[^&]*/i, "$1" + myVariable);
                                        myVariable = "";
                                }
                                // Special case: SR Sales - Payment Not Clear → Aggregators Payment Within SLA (srTypeId=103010007)
                                // This SR requires subsNumber to be populated before BMEWebToken to open correctly.
                                // Replace the subsNumber parameter with the full FBB value and do NOT append it at the end.
                                if (link && link.indexOf("srTypeId=103010007") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)[^&]*/i, "$1" + myVariable);
                                        myVariable = "";
                                }
                                // Special case: SR Sales - Payment Not Clear → Aggregators Payment After SLA (srTypeId=103010008)
                                // This SR requires subsNumber to be populated before BMEWebToken to open correctly.
                                // Replace the subsNumber parameter with the full FBB value and do NOT append it at the end.
                                if (link && link.indexOf("srTypeId=103010008") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)[^&]*/i, "$1" + myVariable);
                                        myVariable = "";
                                }
                                // Special case: SR Technical - Wireless Problem → No WLAN detected-CPE Configuration (srTypeId=102002061)
                                // Some SR templates come with subsNumber as ADSL only (e.g., 23123) even when the intended value is FBB23123.
                                // For this SR, replace the subsNumber parameter with the full value (including the FBB prefix) and do NOT append it at the end.
                                if (link && link.indexOf("srTypeId=102002061") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)[^&]*/i, "$1" + myVariable);
                                        myVariable = "";
                                }
                                // Special case: SR Sales - Recharge By Mistake (srTypeId=100034005)
                                // This SR needs the subsNumber value in the first (middle) parameter to populate ADSL Number correctly.
                                if (link && link.indexOf("srTypeId=100034005") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)FBB(&BMEWebToken=)/, "$1" + myVariable + "$2");
                                }
                                // Special case: SR Technical - Outage -> Proactive maintenance notification (srTypeId=102094003)
                                // This SR needs the subsNumber value before BMEWebToken to populate ADSL Number correctly.
                                // Do NOT append the number at the end.
                                if (link && link.indexOf("srTypeId=102094003") !== -1) {
                                        link = link.replace(/([?&]subsNumber=)(&BMEWebToken=)/, "$1" + myVariable + "$2");
                                        myVariable = "";
                                }
                                // Special case: SR Sales - Refund - the amount to the card → Refund bank within SLA (srTypeId=103038004)
// This SR requires subsNumber to be populated before BMEWebToken to open correctly.
// Replace the subsNumber parameter with the full FBB value and do NOT append it at the end.
if (link && link.indexOf("srTypeId=103038004") !== -1) {
        link = link.replace(/([?&]subsNumber=)[^&]*/i, "$1" + myVariable);
        myVariable = "";
}
link += myVariable; // إضافة المتغير إلى الرابط
                                window.open(link); // فتح الرابط الجديد مع المتغير المضاف
                        }
                


                        function openLinkk(event) {
                                event.preventDefault(); // منع فتح الرابط الأصلي
                                var link = event.target.href; // رابط العنصر
                                var myVariable = (document.getElementById("arabicNumber").value || "").trim(); // الرقم

                                // استبدال 222 بالرقم لو موجودة
                                if (/([?&]subsNumber=)222\b/.test(link)) {
                                        link = link.replace(/([?&]subsNumber=)222\b/, '$1' + encodeURIComponent(myVariable));
                                }
                                // لو subsNumber فاضي (subsNumber=) ضيف الرقم بعد =
                                else if (/([?&]subsNumber=)$/.test(link)) {
                                        link = link + encodeURIComponent(myVariable);
                                }
                                // لو مفيش subsNumber خالص، ضيفه
                                else if (!/[?&]subsNumber=/.test(link)) {
                                        link = link + (link.indexOf('?') === -1 ? '?' : '&') + 'subsNumber=' + encodeURIComponent(myVariable);
                                }

                                window.open(link, "_blank");
                        }
                


                        window.onload = function () {
                                document.addEventListener("contextmenu", function (e) {
                                        e.preventDefault();
                                }, false);
                                document.addEventListener("keydown", function (e) {
                                        //document.onkeydown = function(e) {
                                        // "I" key
                                        if (e.ctrlKey && e.shiftKey && e.keyCode == 73) {
                                                disabledEvent(e);
                                        }
                                        // "J" key
                                        if (e.ctrlKey && e.shiftKey && e.keyCode == 74) {
                                                disabledEvent(e);
                                        }
                                        // "S" key + macOS
                                        if (e.keyCode == 83 && (navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey)) {
                                                disabledEvent(e);
                                        }
                                        // "U" key
                                        if (e.ctrlKey && e.keyCode == 85) {
                                                disabledEvent(e);
                                        }
                                        // "F12" key
                                        if (event.keyCode == 123) {
                                                disabledEvent(e);
                                        }
                                }, false);

                                function disabledEvent(e) {
                                        if (e.stopPropagation) {
                                                e.stopPropagation();
                                        } else if (window.event) {
                                                window.event.cancelBubble = true;
                                        }
                                        e.preventDefault();
                                        return false;
                                }
                        }
                


                        document.onkeypress = function (event) {
                                event = (event || window.event);
                                if (event.keyCode == 123) {
                                        return false;
                                }
                        }
                        document.onmousedown = function (event) {
                                event = (event || window.event);
                                if (event.keyCode == 123) {
                                        return false;
                                }
                        }
                        document.onkeydown = function (event) {
                                event = (event || window.event);
                                if (event.keyCode == 123) {
                                        return false;
                                }
                        }
                


                        // تعيين النص المحدد مسبقًا لكل زر
                        const text1 = " R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب \n Ping 192.168.1.1 هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده   \n Enter بعد كده هتضغط  \n هيظهر امام حضرتك اربع سطور تحت بعض ممكن توضحلى اول كلمه فى الاربع سطور ؟ ";

                        const text2 = "R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه  \n CMD هنكتب \n Ping 192.168.1.1 –t هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده  \n Enter بعد كده هتضغط  \n بعد كده هتنتظر حضرتك 60 ثانيه وتضغط فى الكيبورد زر كنترول مع حرف c \n وهستأذن حضرتك تبعتلى اسكرين شوت من الى هيظهرلك على اللينك ده ";
                        const text3 = " R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب \n Ping google.com هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده    \n Enter بعد كده هتضغط  \n وهستأذن حضرتك تبعتلى اسكرين شوت من الى هيظهرلك على اللينك ده ";
                        const text4 = " R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب \n Ping 172.217.19.142 هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده   \n Enter بعد كده هتضغط  \n وهستأذن حضرتك تبعتلى اسكرين شوت من الى هيظهرلك على اللينك ده ";
                        const text5 = "R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب \n Netstat -n –o هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده   \n Enter بعد كده هتضغط  \n وهستأذن حضرتك تبعتلى اسكرين شوت من الى هيظهرلك على اللينك ده  ";





                        const text6 = "R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب \n Tracert google.com هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده   \n Enter بعد كده هتضغط   \n وهستأذن حضرتك تبعتلى اسكرين شوت من الى هيظهرلك على اللينك ده  ";

                        const text7 = " R حاليا هستأذن حضرتك نضغط علي علامه الويندوز و حرف ال \n RUN هتظهر لحضرتك قائمه \n CMD هنكتب  \n ipconfig/flushdns  هتظهر شاشه لونها اسود ممكن نكتب فيها الامر ده   \n Enter بعد كده هتضغط  \n successfully flushed the DNS Resolver Cache   هى دى النتيجه الى ظهرت لحضرتك ولا لا يا فندم ؟  ";

                        const button1 = document.getElementById("button1");
                        const button2 = document.getElementById("button2");
                        const button3 = document.getElementById("button3");
                        const button4 = document.getElementById("button4");
                        const button5 = document.getElementById("button5");
                        const button6 = document.getElementById("button6");
                        const button7 = document.getElementById("button7");


                        // الحصول على عنصر الإشعار باستخدام الـ ID
                        const notification = document.getElementById("notification");

                        // إضافة معالج الحدث لكل زر
                        button1.addEventListener("click", function () {
                                copyToClipboard1(text1, button1);
                        });

                        button2.addEventListener("click", function () {
                                copyToClipboard1(text2, button2);
                        });

                        button3.addEventListener("click", function () {
                                copyToClipboard1(text3, button3);
                        });

                        button4.addEventListener("click", function () {
                                copyToClipboard1(text4, button4);
                        });

                        button5.addEventListener("click", function () {
                                copyToClipboard1(text5, button5);
                        });
                        button6.addEventListener("click", function () {
                                copyToClipboard1(text6, button6);
                        });
                        button7.addEventListener("click", function () {
                                copyToClipboard1(text7, button7);
                        });

                        // دالة النسخ إلى الحافظة
                        function copyToClipboard1(text, button) {
                                navigator.clipboard.writeText(text)
                                        .then(() => {
                                                console.log(`تم نسخ النص: ${text}`);
                                                // إظهار رسالة الإشعار وتخفيفها تدريجيًا بعد فترة زمنية محددة
                                                notification.textContent = " copied successfully ";
                                                notification.style.opacity = 1;
                                                setTimeout(function () {
                                                        notification.style.opacity = 0;
                                                }, 1000);
                                        })
                                        .catch((error) => {
                                                console.error(`حدث خطأ: ${error}`);
                                        });
                        }
                


                


                        const notification3 = document.getElementById("notification3");


                        function copyToClipboard(element) {
                                var $temp = $("<input>");
                                $("body").append($temp);
                                $temp.val($(element).text()).select();
                                document.execCommand("copy");
                                $temp.remove();




                                notification3.textContent = " copied successfully ";
                                notification3.style.opacity = 1;
                                setTimeout(function () {
                                        notification3.style.opacity = 0;
                                }, 1000);

                        }
                


                                                        function convertNumber() {
                                                                // Get the input value
                                                                var arabicNumber = document.getElementById("arabicNumber").value;

                                                                // Map the Arabic numbers to English numbers
                                                                var numbers = {
                                                                        '٠': '0',
                                                                        '١': '1',
                                                                        '٢': '2',
                                                                        '٣': '3',
                                                                        '٤': '4',
                                                                        '٥': '5',
                                                                        '٦': '6',
                                                                        '٧': '7',
                                                                        '٨': '8',
                                                                        '٩': '9'
                                                                };
                                                                //٠٤٤٤٤٤٤٤

                                                                var englishNumber = arabicNumber.replace(/[٠-٩]/g, function (match) {
                                                                        return numbers[match];
                                                                });

                                                                // Display the English number
                                                                var hasFBB = /fbb/i.test(englishNumber);
                                                                var digitsOnly = (englishNumber || "").replace(/\D/g, "");

                                                                document.getElementById("arabicNumber").value = digitsOnly;
                                                                if (digitsOnly !== "") {
                                                                        document.getElementById("arabiccNumber").value = "FBB" + digitsOnly;
                                                                } else if (hasFBB) {
                                                                        document.getElementById("arabiccNumber").value = "FBB";
                                                                } else {
                                                                        document.getElementById("arabiccNumber").value = "";
                                                                }
                                                        }
                                                        // برمجه الانبوت الخاص بالرقم 
                                                        function removeLeadingZero() {
                                                                const arabicNumber = document.getElementById("arabicNumber");

                                                                let numberValue = arabicNumber.value;

                                                                // إزالة كل الحروف (عربية وإنجليزية) والرموز، والاحتفاظ بالأرقام فقط (عربية + إنجليزية)
                                                                numberValue = numberValue.replace(/[^\d\u0660-\u0669]/g, '');

                                                                // إزالة الأصفار الأولية سواء كانت 0 (إنجليزي) أو ٠ (عربي)
                                                                while (/^[0\u0660]/.test(numberValue)) {
                                                                        numberValue = numberValue.substring(1);
                                                                }

                                                                // تحديث القيمة في input
                                                                arabicNumber.value = numberValue;
                                                        }

                                                


                                                                                                // ✅ دالة لتطبيع النص (إزالة الأحرف غير المرئية وتوحيد المسافات)
                                                                                                const normalizeText = str => str
                                                                                                        .toLowerCase()
                                                                                                        .replace(/[\u200B-\u200D\uFEFF]/g, '') // إزالة الأحرف غير المرئية
                                                                                                        .replace(/\s+/g, ' ')                  // تحويل المسافات المتعددة إلى واحدة
                                                                                                        .trim();

                                                                                                const searchInput = document.getElementById('searchInput');
                                                                                                const searchResults = document.getElementById('searchResults');

                                                                // 🌿 Compute a human‑readable path (tab → section → sub‑section) for a given link
                                                                function getLinkPath(link) {
                                                                        // Find the tab content that wraps this link
                                                                        let tab = link.closest('.tabcontent');
                                                                        let tabName = '';
                                                                        if (tab) {
                                                                                tabName = tab.getAttribute('id') || '';
                                                                                tabName = tabName.trim();
                                                                        }
                                                                        // Find the nearest dropdown button that precedes this link
                                                                        let dropText = '';
                                                                        const dropdown = link.closest('.dropdown');
                                                                        if (dropdown) {
                                                                                const btn = dropdown.querySelector('button.dropbtn');
                                                                                if (btn) {
                                                                                        // Extract only the button’s text without icons
                                                                                        dropText = (btn.childNodes[0] ? btn.childNodes[0].textContent : btn.textContent).trim();
                                                                                }
                                                                        }
                                                                        // Find a sub‑header (previous sibling with class no-search) if inside a sub‑dropdown
                                                                        let header = '';
                                                                        const sub = link.closest('.sub-dropdown-content');
                                                                        if (sub && sub.previousElementSibling && sub.previousElementSibling.classList.contains('no-search')) {
                                                                                header = sub.previousElementSibling.textContent.trim();
                                                                        }
                                                                        // Assemble the path segments, skipping empty ones
                                                                        const segments = [];
                                                                        if (tabName) segments.push(tabName);
                                                                        if (dropText) segments.push(dropText);
                                                                        if (header) segments.push(header);
                                                                        return segments.join(' - ');
                                                                }



                                                                                                // ✅ عند الكتابة داخل مربع البحث
                                                                                                searchInput.addEventListener('input', function () {
                                                                                                        const searchTerm = normalizeText(this.value);
                                                                                                        searchResults.innerHTML = '';

                                                                                                        if (searchTerm === '') {
                                                                                                                searchResults.style.display = 'none';
                                                                                                                return;
                                                                                                        }

                                                                                                        const allLinks = Array.from(document.querySelectorAll('.dropdown-content a, .sub-dropdown-content a, a#singlelink'))

                                                                                                                .filter(link => !link.classList.contains('no-search'));

                                                                                                        let hasResults = false;

                                                                                                        allLinks.forEach(link => {
                                                                                                                const text = normalizeText(link.textContent);
                                                                                                                if (text.includes(searchTerm)) {
                                                                                                                        const resultLink = document.createElement('a');
                                                                                                                        resultLink.href = link.href;
                                                                                                                        resultLink.textContent = link.textContent;
                                                                const path = getLinkPath(link);
                                                                resultLink.title = path ? (path + ' → ' + link.textContent) : link.textContent;
                                                                                                                        resultLink.onclick = function (e) {
                                                                                                                                e.preventDefault();
                                                                                                                                link.click(); // simulate click on original link
                                                                                                                        };
                                                                                                                        resultLink.classList.add('highlight');
                                                                                                                        searchResults.appendChild(resultLink);
                                                                                                                        hasResults = true;
                                                                                                                }
                                                                                                        });

                                                                                                        searchResults.style.display = hasResults ? 'block' : 'none';
                                                                                                });

                                                                                                // ✅ إخفاء النتائج عند الضغط خارج الإنبت أو النتائج
                                                                                                document.addEventListener('click', function (e) {
                                                                                                        const isClickInsideInput = searchInput.contains(e.target);
                                                                                                        const isClickInsideResults = searchResults.contains(e.target);

                                                                                                        if (!isClickInsideInput && !isClickInsideResults) {
                                                                                                                searchResults.style.display = 'none';
                                                                                                        }
                                                                                                });

                                                                                                // ✅ إظهار النتائج عند الرجوع للإنبت لو فيه نتائج موجودة
                                                                                                searchInput.addEventListener('focus', function () {
                                                                                                        if (this.value.trim() !== '' && searchResults.childNodes.length > 0) {
                                                                                                                searchResults.style.display = 'block';
                                                                                                        }
                                                                                                });
                                                                                        


                        // تحكم بالفتح للمنيو الرئيسية
                        const dropdown = document.querySelector('.dropdown');
                        const dropdownContent = dropdown.querySelector('.dropdown-content');

                        dropdown.addEventListener('mouseenter', () => {
                                dropdownContent.classList.remove('open-left');
                                const rect = dropdownContent.getBoundingClientRect();
                                if (rect.right > window.innerWidth) {
                                        dropdownContent.classList.add('open-left');
                                }
                        });

                        // تحكم بالفتح للمنيو الفرعية (sub-dropdown)
                        document.querySelectorAll('.sub-dropdown').forEach(subDropdown => {
                                subDropdown.addEventListener('mouseenter', () => {
                                        const subMenu = subDropdown.querySelector('.sub-dropdown-content');
                                        subMenu.classList.remove('open-left');

                                        const rect = subMenu.getBoundingClientRect();
                                        if (rect.right > window.innerWidth) {
                                                subMenu.classList.add('open-left');
                                        }
                                });
                        });
                


                                                        const numStars = 200; // عدد النجوم
                                                        const body = document.body;

                                                        for (let i = 0; i < numStars; i++) {
                                                                const star = document.createElement('div');
                                                                star.className = 'star';
                                                                star.style.left = Math.random() * 100 + 'vw'; // موقع عشوائي  الأفقي
                                                                star.style.top = Math.random() * 100 + 'vh'; // موقع عشوائي  العمودي
                                                                star.style.opacity = Math.random(); // عشوائية الشفافية
                                                                body.appendChild(star);
                                                        }

                                                        // إزالة القمر بعد انتهاء الحركة
                                                        const moon = document.querySelector('.moon');
                                                        moon.addEventListener('animationend', () => {
                                                                moon.style.display = 'none';
                                                        });
                                                


                                                        function splitNumbers() {
                                                                const input1 = document.getElementById("arabicNumber");
                                                                const input2 = document.getElementById("input2");
                                                                const input3 = document.getElementById("input3");
                                                                
                                                                // Safety guard: some pages may not include input2/input3.
                                                                if (!input1 || !input2 || !input3) {
                                                                        return;
                                                                }
let numberValue = input1.value;

                                                                // Get the value of input1
                                                                const value = input1.value.trim();

                                                                // Check if the value is empty
                                                                if (value === "") {
                                                                        input2.value = "";
                                                                        input3.value = "";
                                                                        return;
                                                                }

                                                                // Determine the number of digits to take based on the condition
                                                                let numDigits = 1;
                                                                if (value.startsWith("2") || value.startsWith("3")) {
                                                                        numDigits = 1;
                                                                } else {
                                                                        numDigits = 2;
                                                                }

                                                                // Get the first digit(s) from the value
                                                                const firstDigits = value.slice(0, numDigits);

                                                                // Get the rest of the digits from the value
                                                                const restOfDigits = value.slice(numDigits);

                                                                // Set the first digit(s) to input2 and the rest of the digits to input3
                                                                input2.value = firstDigits;
                                                                input3.value = restOfDigits;
                                                        }

                                                        document.getElementById("arabicNumber").addEventListener("input", splitNumbers);
                                                


                                                        var arabicNumber = document.querySelector('#arabicNumber');
                                                        var copyBtn1 = document.querySelector('#copyBtn1');
                                                        var copyNotification = document.querySelector('#copyNotification');

                                                        copyBtn1.addEventListener('click', function () {
                                                                arabicNumber.select(); /* تحديد نص الإدخال */
                                                                document.execCommand('copy'); /* نسخ النص المحدد */
                                                                copyNotification.style.display = 'inline-block'; /* إظهار الاشعار */
                                                                setTimeout(function () {
                                                                        copyNotification.classList.add('fade-out'); /* تطبيق الانتقال التدريجي للإخفاء */
                                                                        setTimeout(function () {
                                                                                copyNotification.style.display = 'none'; /* إخفاء الاشعار بعد انتهاء الانتقال التدريجي */
                                                                                copyNotification.classList.remove('fade-out'); /* إعادة تعيين قيمة الفصل الدرجي (animation) إلى القيمة الأصلية */
                                                                        }, 1000); /* مدة الانتقال التدريجي */
                                                                }, 1000); /* مدة عرض الاشعار */
                                                        });
                                                


                                                        var arabiccNumber = document.querySelector('#arabiccNumber');
                                                        var copyBtn = document.querySelector('#copyBtn');
                                                        var copyNotification1 = document.querySelector('#copyNotification1');

                                                        copyBtn.addEventListener('click', function () {
                                                                arabiccNumber.select(); /* تحديد نص الإدخال */
                                                                document.execCommand('copy'); /* نسخ النص المحدد */
                                                                copyNotification1.style.display = 'inline-block'; /* إظهار الاشعار */
                                                                setTimeout(function () {
                                                                        copyNotification1.classList.add('fade-out'); /* تطبيق الانتقال التدريجي للإخفاء */
                                                                        setTimeout(function () {
                                                                                copyNotification1.style.display = 'none'; /* إخفاء الاشعار بعد انتهاء الانتقال التدريجي */
                                                                                copyNotification1.classList.remove('fade-out'); /* إعادة تعيين قيمة الفصل الدرجي (animation) إلى القيمة الأصلية */
                                                                        }, 1000); /* مدة الانتقال التدريجي */
                                                                }, 1000); /* مدة عرض الاشعار */
                                                        });
                                                
// Provide stub for move1 used by onmousemove attribute in HTML
if (typeof move1 !== "function") {
  function move1() {
    // no operation
  }
}

// Integrate Tags.html into the main page by toggling an overlay with an iframe.
// Performance refresh:
// - Do NOT hide the entire page tree when opening Tags.
// - Warm the Tags HTML during idle time / hover / focus.
// - Reuse a single fetched HTML string + a single iframe instance.
// - Show the overlay instantly, then hydrate the iframe content.
document.addEventListener('DOMContentLoaded', function(){
  try {
    var tagsBtn = document.getElementById('bat2');
    var tagsContainer = document.getElementById('tagsContainer');
    var tagsPanel, tagsFrame, closeBtn, tagsLoader;
    var tagsHtmlCache = '';
    var tagsHtmlPromise = null;
    var tagsApplied = false;
    var bodyOverflowBeforeTags = '';
    var currentTagsMode = 'main';

    function ensureOverlay(){
      if (tagsContainer && tagsFrame && tagsPanel) return;

      if(!tagsContainer){
        tagsContainer = document.createElement('div');
        tagsContainer.id = 'tagsContainer';
        tagsContainer.style.display = 'none';
        tagsContainer.style.position = 'fixed';
        tagsContainer.style.top = '0';
        tagsContainer.style.left = '0';
        tagsContainer.style.width = '100%';
        tagsContainer.style.height = '100%';
        tagsContainer.style.zIndex = '2147483646';
        tagsContainer.style.background = 'radial-gradient(circle at 50% 0%, rgba(255,214,122,0.16), rgba(255,214,122,0) 24%), radial-gradient(circle at 20% 12%, rgba(142,99,255,0.18), rgba(142,99,255,0) 30%), linear-gradient(180deg, rgba(5,8,22,0.92), rgba(5,5,15,0.97))';
        tagsContainer.style.backdropFilter = 'blur(4px)';
        tagsContainer.style.webkitBackdropFilter = 'blur(4px)';
        tagsContainer.style.opacity = '0';
        tagsContainer.style.transition = 'opacity 0.18s ease';
        tagsContainer.style.contain = 'layout paint style';
      }

      tagsPanel = document.getElementById('tagsPanel');
      if(!tagsPanel){
        tagsPanel = document.createElement('div');
        tagsPanel.id = 'tagsPanel';
        tagsPanel.style.position = 'relative';
        tagsPanel.style.width = '100%';
        tagsPanel.style.height = '100%';
        tagsPanel.style.overflow = 'hidden';
        tagsPanel.style.padding = '0';
        tagsPanel.style.margin = '0';
        tagsPanel.style.boxSizing = 'border-box';
        tagsPanel.style.contain = 'layout paint style';
        tagsContainer.appendChild(tagsPanel);
      }

      tagsFrame = document.getElementById('tagsFrame');
      if(!tagsFrame){
        tagsFrame = document.createElement('iframe');
        tagsFrame.id = 'tagsFrame';
        tagsFrame.style.width = '100%';
        tagsFrame.style.height = '100%';
        tagsFrame.style.border = '0';
        tagsFrame.style.display = 'block';
        tagsFrame.style.background = 'transparent';
        tagsFrame.style.opacity = '0';
        tagsFrame.style.transition = 'opacity 0.18s ease';
        tagsFrame.setAttribute('sandbox', 'allow-scripts allow-forms allow-same-origin');
        tagsPanel.appendChild(tagsFrame);
      }

      tagsLoader = document.getElementById('tagsLoader');
      if(!tagsLoader){
        tagsLoader = document.createElement('div');
        tagsLoader.id = 'tagsLoader';
        tagsLoader.style.position = 'absolute';
        tagsLoader.style.inset = '0';
        tagsLoader.style.display = 'flex';
        tagsLoader.style.flexDirection = 'column';
        tagsLoader.style.alignItems = 'center';
        tagsLoader.style.justifyContent = 'center';
        tagsLoader.style.gap = '12px';
        tagsLoader.style.color = '#f5f7ff';
        tagsLoader.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif';
        tagsLoader.style.background = 'radial-gradient(circle at 50% 30%, rgba(83,114,255,0.22), rgba(0,0,0,0) 32%), linear-gradient(180deg, rgba(7,11,28,0.86), rgba(5,5,15,0.94))';
        tagsLoader.innerHTML = '<div style="width:46px;height:46px;border-radius:50%;border:3px solid rgba(255,255,255,0.16);border-top-color:#f7d88b;animation: srTagsSpin 0.9s linear infinite"></div><div style="font-size:14px;font-weight:700;letter-spacing:.2px">جارٍ تجهيز Tags...</div><div style="font-size:12px;opacity:.72">فتح أسرع وتحميل أخف</div>';
        tagsPanel.appendChild(tagsLoader);
      }

      closeBtn = document.getElementById('closeTagsBtn');
      if(!closeBtn){
        closeBtn = document.createElement('button');
        closeBtn.id = 'closeTagsBtn';
        closeBtn.textContent = '\u00D7';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '18px';
        closeBtn.style.left = '18px';
        closeBtn.style.right = 'auto';
        closeBtn.style.zIndex = '2147483647';
        closeBtn.style.width = '42px';
        closeBtn.style.height = '42px';
        closeBtn.style.borderRadius = '16px';
        closeBtn.style.border = '1px solid rgba(255,240,191,0.30)';
        closeBtn.style.background = 'radial-gradient(circle at 28% 22%, rgba(255,255,255,0.34), rgba(255,255,255,0) 32%), linear-gradient(135deg, rgba(255,240,191,0.16), rgba(133,92,255,0.22) 48%, rgba(255,111,178,0.18))';
        closeBtn.style.color = '#fff';
        closeBtn.style.fontSize = '26px';
        closeBtn.style.fontWeight = '800';
        closeBtn.style.lineHeight = '1';
        closeBtn.style.boxShadow = '0 18px 40px rgba(0,0,0,0.30)';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.backdropFilter = 'blur(8px)';
        closeBtn.style.webkitBackdropFilter = 'blur(8px)';
        closeBtn.setAttribute('aria-label', 'Close Tags');
        tagsContainer.appendChild(closeBtn);
      }

      if (!document.getElementById('srTagsSpinStyle')) {
        var spinStyle = document.createElement('style');
        spinStyle.id = 'srTagsSpinStyle';
        spinStyle.textContent = '@keyframes srTagsSpin{to{transform:rotate(360deg)}}';
        document.head.appendChild(spinStyle);
      }

      if(!tagsContainer.parentNode){
        document.body.appendChild(tagsContainer);
      }

      if(!closeBtn.__tagsBound){
        closeBtn.__tagsBound = true;
        closeBtn.addEventListener('click', function(){
          hideTags();
        });
      }

      if(!tagsFrame.__fadeBound){
        tagsFrame.__fadeBound = true;
        tagsFrame.addEventListener('load', function(){
          tagsFrame.style.opacity = '1';
          if (tagsLoader) tagsLoader.style.display = 'none';
        });
      }
    }

    function normalizeTagsHtml(html){
      if (!/\<base\b/i.test(html)) {
        html = html.replace(/<head(\b[^>]*)>/i, function(m){
          return m + '\n<base href="/" />\n';
        });
      }
      html = html.replace(/<script[^>]*src=["'][^"']*disable-devtool[^"']*["'][^>]*>\s*<\/script>/gi, '');
      return html;
    }

    function decorateTagsHtml(html, mode){
      var safeMode = mode === 'ivr' ? 'ivr' : 'main';
      var bridge = '<script>window.__SR_TAGS_EMBED={mode:"' + safeMode + '",parentBridge:true};<\/script>';
      if (/<head(\b[^>]*)>/i.test(html)) {
        return html.replace(/<head(\b[^>]*)>/i, function(m){ return m + '\n' + bridge + '\n'; });
      }
      return bridge + html;
    }

    function bindTagsBridge(){
      if (window.__srTagsBridgeBound) return;
      window.__srTagsBridgeBound = true;
      window.addEventListener('message', function(ev){
        var data = ev && ev.data;
        if (!data || typeof data !== 'object') return;
        if (data.type === 'SR_TAGS_SWITCH_MODE') {
          currentTagsMode = data.mode === 'ivr' ? 'ivr' : 'main';
          tagsApplied = false;
          applyTagsHtml();
          return;
        }
        if (data.type === 'SR_TAGS_CLOSE') {
          hideTags();
        }
      });
    }

    function fetchTagsHtml(force){
      if (tagsHtmlCache && !force) return Promise.resolve(tagsHtmlCache);
      if (tagsHtmlPromise && !force) return tagsHtmlPromise;
      tagsHtmlPromise = fetch('/Tags.html', { cache: force ? 'reload' : 'force-cache' })
        .then(function(r){ return r.text(); })
        .then(function(html){
          tagsHtmlCache = normalizeTagsHtml(html || '');
          return tagsHtmlCache;
        })
        .catch(function(err){
          console.error('Failed to warm Tags.html', err);
          throw err;
        });
      return tagsHtmlPromise;
    }

    function applyTagsHtml(){
      bindTagsBridge();
    ensureOverlay();
      if (tagsApplied && tagsFrame && tagsFrame.srcdoc) {
        if (tagsLoader) tagsLoader.style.display = 'none';
        tagsFrame.style.opacity = '1';
        return Promise.resolve();
      }
      if (tagsLoader) tagsLoader.style.display = 'flex';
      tagsFrame.style.opacity = '0';
      return fetchTagsHtml(false)
        .then(function(html){
          if (!html) throw new Error('empty Tags.html');
          tagsApplied = true;
          tagsFrame.srcdoc = decorateTagsHtml(html, currentTagsMode);
        })
        .catch(function(err){
          console.error('Failed to load Tags.html', err);
          tagsApplied = false;
          tagsFrame.srcdoc = '<html><body style="margin:0;background:#05050f;color:#fff;font-family:system-ui;padding:20px">تعذر تحميل صفحة الـ Tags. تحقق من وجود Tags.html داخل /public.</body></html>';
        });
    }

    function warmTags(preRender){
      ensureOverlay();
      fetchTagsHtml(false)
        .then(function(){
          if (preRender && !tagsApplied) applyTagsHtml();
        })
        .catch(function(){ /* no-op */ });
    }

    function showTags(){
      ensureOverlay();
      tagsContainer.style.display = 'block';
      requestAnimationFrame(function(){ tagsContainer.style.opacity = '1'; });
      if (!bodyOverflowBeforeTags) bodyOverflowBeforeTags = document.body.style.overflow || '';
      document.body.style.overflow = 'hidden';
      applyTagsHtml();
    }

    function hideTags(){
      if (!tagsContainer) return;
      tagsContainer.style.opacity = '0';
      setTimeout(function(){ if (tagsContainer) tagsContainer.style.display = 'none'; }, 160);
      document.body.style.overflow = bodyOverflowBeforeTags;
    }

    ensureOverlay();

    if(tagsBtn){
      tagsBtn.addEventListener('click', function(e){
        if(e) e.preventDefault();
        if(tagsContainer.style.display === 'block') hideTags();
        else showTags();
      });
      if (!tagsBtn.__tagsWarmBound) {
        tagsBtn.__tagsWarmBound = true;
        ['mouseenter', 'focus', 'touchstart'].forEach(function(evtName){
          tagsBtn.addEventListener(evtName, function(){ warmTags(false); }, { passive: true, once: true });
        });
      }
    }

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(function(){ warmTags(false); }, { timeout: 1800 });
    } else {
      window.setTimeout(function(){ warmTags(false); }, 900);
    }
  } catch (ex) {
    console.error(ex);
  }
});
// -----------------------------------------------------------------------------
// Additional converters for the Mobile section
// These functions replicate the behaviour of the standalone converter tool
// provided by the company. They convert between Bytes and Megabytes and
// calculate net and tax-inclusive balances. The logic uses the same
// conversion factors as the provided tool: 1 MB = 1024*1024 Bytes and
// a tax multiplier of 1.4286 for converting between net and tax-inclusive
// amounts. These functions are invoked from the HTML via button onclick
// attributes in the Mobile tab.

function performByteMbConversion() {
  const inputEl = document.getElementById('convertDataInput');
  const typeEl = document.getElementById('convertDataType');
  const resultEl = document.getElementById('convertDataResult');
  if (!inputEl || !typeEl || !resultEl) return;

  const inputValue = parseFloat(inputEl.value);
  if (isNaN(inputValue) || inputValue < 0) {
    resultEl.innerText = 'الرجاء إدخال رقم موجب صالح.';
    return;
  }

  const type = typeEl.value;
  if (type === 'byteToMb') {
    const mb = (inputValue / (1024 * 1024)).toFixed(4);
    resultEl.innerText = `متبقى معاك ${mb} ميجا`;
  } else {
    const bytes = Math.round(inputValue * 1024 * 1024);
    resultEl.innerText = `متبقى معاك ${bytes} بايت`;
  }
}

function performBalanceConversion() {
  const inputEl = document.getElementById('balanceInputMobile');
  const typeEl = document.getElementById('balanceTypeMobile');
  const resultEl = document.getElementById('balanceResultMobile');
  if (!inputEl || !typeEl || !resultEl) return;

  const inputValue = parseFloat(inputEl.value);
  if (isNaN(inputValue) || inputValue < 0) {
    resultEl.innerText = 'الرجاء إدخال رقم موجب صالح.';
    return;
  }

  // Company policy conversion factor (approx 42.86% tax)
  const factor = 1.4286;
  const type = typeEl.value;

  if (type === 'netToTotal') {
    const total = (inputValue * factor).toFixed(2);
    resultEl.innerText = `الرصيد شامل الضريبة سيكون ${total} جنيه`;
  } else {
    const net = (inputValue / factor).toFixed(2);
    resultEl.innerText = `الرصيد صافي سيكون ${net} جنيه`;
  }
}




/* =========================================================
   OCR Paste Box (Call Back) - Paste screenshot -> Copy text
   Uses ClipboardEvent.clipboardData inside paste handler:
   https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData
   ========================================================= */
/* ==========================================================
   Call Back: Paste Screenshot -> OCR (Arabic + English)
   - Premium UI hooks in styles.css (.cbOcrBox)
   - Uses tessdata_best for higher accuracy (slower first load)
   - Robust preprocessing for small text + optional auto-deskew
   ========================================================== */
(function initCallbackOcrPasteBox(){
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(() => {
    const zone = document.getElementById('cbOcrPasteZone');
    const catcher = document.getElementById('cbOcrPasteCatcher');
    const preview = document.getElementById('cbOcrPreview');
    const status = document.getElementById('cbOcrStatus');
    const out = document.getElementById('cbOcrText');
    const extractBtn = document.getElementById('cbOcrExtractBtn');
    const hqBtn = document.getElementById('cbOcrHqBtn');
    const copyBtn = document.getElementById('cbOcrCopyBtn');
    const clearBtn = document.getElementById('cbOcrClearBtn');

    if(!zone || !catcher || !preview || !status || !out || !extractBtn || !hqBtn || !copyBtn || !clearBtn) return;

    const PLACEHOLDER_HTML = 'اضغط هنا ثم Ctrl+V للصق الصورة…<div class="ocrSubHint">Drag &amp; Drop صورة هنا</div>';
    const setStatus = (t) => { status.textContent = t; };
    const resetZoneText = () => { zone.innerHTML = PLACEHOLDER_HTML; };

    // Make sure placeholder is visible
    if(!zone.innerHTML || !zone.innerHTML.trim()) resetZoneText();
    // The big zone is visual-only; we use a hidden input to reliably receive Ctrl+V.
    // This avoids cases where overlays/selection steal focus.
    catcher.setAttribute('aria-hidden','true');
    catcher.value = '';

    let lastImageFile = null;
    let isOcrRunning = false;

    // Extract button UX
    const setExtractEnabled = (on) => {
      extractBtn.disabled = !on;
      extractBtn.style.opacity = on ? '1' : '0.6';
    };
    setExtractEnabled(false);

    // ---------- Helpers ----------
    function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

    // Rough estimate of ink density (how much "black" content exists).
    // Used to skip deskew on nearly-empty images (saves time & avoids false skew).
    function estimateInkRatio(imgData){
      try{
        const d = imgData.data;
        const totalPx = Math.max(1, (d.length / 4) | 0);

        // Sample every Nth pixel for speed.
        const step = Math.max(1, Math.floor(totalPx / 120000)); // cap ~120k samples
        let ink = 0;
        let sampled = 0;

        for(let p=0; p<totalPx; p+=step){
          const i = p * 4;
          const r = d[i], g = d[i+1], b = d[i+2];
          const lum = (0.2126*r + 0.7152*g + 0.0722*b);
          if(lum < 160) ink++; // "dark" threshold
          sampled++;
        }
        return sampled ? (ink / sampled) : 0;
      }catch(_e){
        return 0;
      }
    }

    async function fileToImageBitmap(file){
      if(window.createImageBitmap){
        return await createImageBitmap(file);
      }
      // Fallback
      const img = new Image();
      img.decoding = 'async';
      img.src = URL.createObjectURL(file);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      URL.revokeObjectURL(img.src);
      return c;
    }

    function canvasFromBitmap(bm, scale){
      const w = Math.max(1, Math.round((bm.width || bm.naturalWidth || bm.videoWidth || bm.clientWidth || bm.width) * scale));
      const h = Math.max(1, Math.round((bm.height || bm.naturalHeight || bm.videoHeight || bm.clientHeight || bm.height) * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bm, 0, 0, w, h);
      return { c, ctx };
    }

    function toGrayscale(imgData){
      const d = imgData.data;
      const g = new Uint8ClampedArray(imgData.width * imgData.height);
      for(let i=0, j=0; i<d.length; i+=4, j++){
        // perceptual luminance
        g[j] = (0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2])|0;
      }
      return g;
    }

    function contrastStretch(gray){
      let lo=255, hi=0;
      for(let i=0;i<gray.length;i++){
        const v=gray[i];
        if(v<lo) lo=v;
        if(v>hi) hi=v;
      }
      const out = new Uint8ClampedArray(gray.length);
      const range = Math.max(10, hi-lo);
      for(let i=0;i<gray.length;i++){
        out[i] = clamp(((gray[i]-lo)*255)/range, 0, 255);
      }
      return out;
    }

    function otsuThreshold(gray){
      const hist = new Array(256).fill(0);
      for(let i=0;i<gray.length;i++) hist[gray[i]]++;
      const total = gray.length;

      let sum=0;
      for(let t=0;t<256;t++) sum += t*hist[t];

      let sumB=0, wB=0, wF=0;
      let varMax=-1, thresh=128;

      for(let t=0;t<256;t++){
        wB += hist[t];
        if(wB === 0) continue;
        wF = total - wB;
        if(wF === 0) break;
        sumB += t*hist[t];

        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB*wF*(mB-mF)*(mB-mF);
        if(varBetween > varMax){
          varMax = varBetween;
          thresh = t;
        }
      }
      return thresh;
    }

    function applyBinaryToImageData(imgData, gray, thr){
      const d = imgData.data;
      for(let i=0, j=0; i<d.length; i+=4, j++){
        const v = gray[j] > thr ? 255 : 0;
        d[i]=v; d[i+1]=v; d[i+2]=v;
      }
    }

    function unsharpMask(ctx, amount){
      // Lightweight sharpen: original + amount*(original - blur)
      const w = ctx.canvas.width, h = ctx.canvas.height;
      const src = ctx.getImageData(0,0,w,h);
      const d = src.data;

      // simple box blur (1px radius)
      const blur = new Uint8ClampedArray(d.length);
      for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
          let r=0,g=0,b=0,a=0,count=0;
          for(let yy=Math.max(0,y-1); yy<=Math.min(h-1,y+1); yy++){
            for(let xx=Math.max(0,x-1); xx<=Math.min(w-1,x+1); xx++){
              const k=(yy*w+xx)*4;
              r+=d[k]; g+=d[k+1]; b+=d[k+2]; a+=d[k+3]; count++;
            }
          }
          const i=(y*w+x)*4;
          blur[i]= (r/count)|0;
          blur[i+1]= (g/count)|0;
          blur[i+2]= (b/count)|0;
          blur[i+3]= (a/count)|0;
        }
      }

      for(let i=0;i<d.length;i+=4){
        d[i]   = clamp(d[i]   + amount*(d[i]   - blur[i]),   0, 255);
        d[i+1] = clamp(d[i+1] + amount*(d[i+1] - blur[i+1]), 0, 255);
        d[i+2] = clamp(d[i+2] + amount*(d[i+2] - blur[i+2]), 0, 255);
      }
      ctx.putImageData(src,0,0);
    }

    // ---------- Auto-Deskew ----------
    function scoreRowsBinary(gray, w, h){
      // score = variance of row sums (higher means stronger horizontal alignment)
      const rowSums = new Float64Array(h);
      for(let y=0;y<h;y++){
        let s=0;
        const row=y*w;
        for(let x=0;x<w;x++){
          s += (gray[row+x] < 128) ? 1 : 0; // count black-ish
        }
        rowSums[y]=s;
      }
      let mean=0;
      for(let i=0;i<h;i++) mean += rowSums[i];
      mean/=h;
      let varr=0;
      for(let i=0;i<h;i++){
        const d=rowSums[i]-mean;
        varr += d*d;
      }
      return varr/h;
    }

    function rotateCanvas(srcCanvas, angleDeg){
      const ang = angleDeg * Math.PI/180;
      const w = srcCanvas.width, h = srcCanvas.height;
      const cos = Math.abs(Math.cos(ang));
      const sin = Math.abs(Math.sin(ang));
      const nw = Math.ceil(w*cos + h*sin);
      const nh = Math.ceil(w*sin + h*cos);
      const c = document.createElement('canvas');
      c.width=nw; c.height=nh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(nw/2, nh/2);
      ctx.rotate(ang);
      ctx.drawImage(srcCanvas, -w/2, -h/2);
      return c;
    }

    function estimateDeskewAngle(binCanvas){
      // Downscale for speed
      const maxW = 700;
      const scale = Math.min(1, maxW / binCanvas.width);
      const { c, ctx } = canvasFromBitmap(binCanvas, scale);
      const img = ctx.getImageData(0,0,c.width,c.height);
      const gray = toGrayscale(img);

      const testAngles = [];
      for(let a=-8; a<=8; a+=1) testAngles.push(a);

      let bestA=0, bestS=-1;
      for(const a of testAngles){
        const rc = rotateCanvas(c, a);
        const rctx = rc.getContext('2d', { willReadFrequently: true });
        const id = rctx.getImageData(0,0,rc.width,rc.height);
        const g = toGrayscale(id);
        const s = scoreRowsBinary(g, rc.width, rc.height);
        if(s > bestS){ bestS=s; bestA=a; }
      }

      // refine around best
      let bestFine = bestA, bestFineS = bestS;
      for(let a=bestA-1; a<=bestA+1; a+=0.25){
        const rc = rotateCanvas(c, a);
        const rctx = rc.getContext('2d', { willReadFrequently: true });
        const id = rctx.getImageData(0,0,rc.width,rc.height);
        const g = toGrayscale(id);
        const s = scoreRowsBinary(g, rc.width, rc.height);
        if(s > bestFineS){ bestFineS=s; bestFine=a; }
      }

      if(Math.abs(bestFine) < 0.25) return 0;
      return clamp(bestFine, -12, 12);
    }

    // ---------- Preprocess pipeline ----------
    async function preprocessForOcr(file, mode){
      const bm = await fileToImageBitmap(file);

      // Dynamic upscale for small screenshots/text:
      // Aim for larger canvas (helps small fonts); cap to prevent huge memory.
      const baseW = bm.width || bm.naturalWidth || bm.clientWidth;
      // FAST mode: quicker preprocessing (less upscale, smarter deskew skip)
      // HQ mode: heavier preprocessing for small fonts / mixed UI text
      const isHq = mode === 'hq';
      /*
       * Use a lower upscale factor for FAST mode to maximise speed while
       * retaining sufficient detail for accurate recognition.  The values
       * below were tuned to reduce the total number of pixels processed by
       * roughly 10–15% compared to the previous version, which yields a
       * noticeable speed‑up without compromising legibility.  HQ mode
       * remains unchanged to provide maximum quality when needed.
       */
      // Slightly upscaled FAST mode improves small-font UI screenshots a lot,
      // without the heavy latency of HQ. HQ stays aggressive for maximum quality.
      let scale = isHq ? 2.2 : 1.2;
      if(baseW < 900) scale = isHq ? 3.2 : 1.5;
      if(baseW < 520) scale = isHq ? 4.2 : 1.8;
      if(baseW < 420) scale = isHq ? 5.0 : 2.0;

      // Hard caps
      const capW = 3600;
      const capScale = capW / baseW;
      scale = Math.min(scale, capScale);

      const { c, ctx } = canvasFromBitmap(bm, scale);

      // Read pixels
      let img = ctx.getImageData(0,0,c.width,c.height);
      let gray = toGrayscale(img);
      gray = contrastStretch(gray);

      // Put stretched gray back into imageData
      for(let i=0, j=0; i<img.data.length; i+=4, j++){
        const v = gray[j];
        img.data[i]=v; img.data[i+1]=v; img.data[i+2]=v;
      }
      ctx.putImageData(img,0,0);

      // Sharpen: HQ stronger. FAST gets a very light sharpen which is cheap enough
      // and significantly improves OCR on tiny UI text.
      if(isHq){
        unsharpMask(ctx, 0.6);
      } else {
        unsharpMask(ctx, 0.25);
      }

      // Binarize (Otsu)
      img = ctx.getImageData(0,0,c.width,c.height);
      const g2 = toGrayscale(img);
      // Compute Otsu's threshold for binarization, then slightly lower it
      // to preserve faint details and inter‑word spaces.  Reducing the
      // threshold by a small amount prevents overly aggressive binarization
      // which can cause narrow gaps between characters to disappear.  Use
      // Math.max() to avoid negative values on very low thresholds.
      const thrBase = otsuThreshold(g2);
      const thr = Math.max(0, thrBase - 10);
      applyBinaryToImageData(img, g2, thr);
      ctx.putImageData(img,0,0);

      // Smart deskew (no UI): detect skew and fix only if needed.
      // Deskewing is expensive, so we only perform it in HQ mode.  For FAST
      // mode, we skip deskew entirely to save time (deskewAngle stays 0).
      let deskewAngle = 0;
      if(isHq){
        try{
          // Skip deskew if image has very little ink (saves time)
          const id0 = ctx.getImageData(0,0,c.width,c.height);
          const ink = estimateInkRatio(id0);
          if(ink > 0.002){
            deskewAngle = estimateDeskewAngle(c);
            // For HQ, ignore tiny angles <1° to avoid overcorrecting
            const minAngle = 1.0;
            if(Math.abs(deskewAngle) < minAngle) deskewAngle = 0;
          }
        }catch(_e){ deskewAngle = 0; }
      }

      let finalCanvas = deskewAngle ? rotateCanvas(c, -deskewAngle) : c;
      // HQ: provide a second grayscale variant for tricky backgrounds.
      // FAST: skip alt to keep latency low.
      let altGray = null;
      if(isHq){
        const { c: grayC, ctx: grayCtx } = canvasFromBitmap(bm, scale);
        const idGray = grayCtx.getImageData(0,0,grayC.width,grayC.height);
        const g3 = contrastStretch(toGrayscale(idGray));
        for(let i=0,j=0; i<idGray.data.length; i+=4,j++){
          const v=g3[j];
          idGray.data[i]=v; idGray.data[i+1]=v; idGray.data[i+2]=v;
        }
        grayCtx.putImageData(idGray,0,0);
        unsharpMask(grayCtx, 0.45);
        altGray = grayC;
      }

      return { main: finalCanvas, altGray, scaleUsed: scale, deskewAngle, isHq };
    }

    // ---------- OCR Worker ----------
    let fastWorker = null;
    let hqWorker = null;
    let fastReady = false;
    let hqReady = false;

    async function ensureWorker(mode){
      const isHq = mode === 'hq';
      if(isHq && hqReady && hqWorker) return hqWorker;
      if(!isHq && fastReady && fastWorker) return fastWorker;
      if(!window.Tesseract || !window.Tesseract.createWorker){
        throw new Error('Tesseract.js not loaded');
      }

      setStatus(isHq ? 'تحميل محرك OCR HQ (أدق لكنه أبطأ) ...' : 'تحميل محرك OCR Fast ...');
      // Use high‑accuracy "best" dataset for HQ mode and faster "fast" dataset for
      // the quick mode.  The fast tessdata is smaller and loads more quickly,
      // helping the FAST OCR mode achieve a significant speed‑up.  The HQ
      // mode retains the "best" dataset for maximum accuracy.
      const langPath = isHq
        ? 'https://tessdata.projectnaptha.com/4.0.0_best/'
        : 'https://tessdata.projectnaptha.com/4.0.0_fast/';

      const w = await window.Tesseract.createWorker(['ara','eng'], 1, { langPath });

      // Parameters: keep spaces, reduce dictionary bias (helps mixed UI text), etc.
      await w.setParameters({
        preserve_interword_spaces: '1',
        // Higher DPI helps with UI screenshots & mixed Arabic/English text.
        user_defined_dpi: isHq ? '450' : '350',
        // reduce dictionary bias for UI/mixed content
        load_system_dawg: '0',
        load_freq_dawg: '0'
      });

      if(isHq){
        hqWorker = w;
        hqReady = true;
        return hqWorker;
      }
      fastWorker = w;
      fastReady = true;
      return fastWorker;
    }

    function pickBestResult(results){
      // Pick by confidence first, then text length.
      let best = null;
      for(const r of results){
        if(!r || !r.data) continue;
        const conf = typeof r.data.confidence === 'number' ? r.data.confidence : -1;
        const text = (r.data.text || '').trim();
        const score = conf + Math.min(30, text.length/30);
        if(!best || score > best.score){
          best = { score, conf, text, raw: r };
        }
      }
      return best;
    }

    
// ---------- OCR Post-Format (Port details template) ----------
function stripInvisibles(s){
  // Remove bidi controls + zero-width chars that can break Arabic/LTR parsing/output
  return (s || '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .normalize('NFC');
}

function cleanOcrText(raw){
  let t = stripInvisibles(raw || '');
  // Drop obvious junk separator lines like "="
  t = t.replace(/^\s*=\s*$/gm, '');
  t = t.replace(/\r/g, '');
  // Normalize colon spacing
  t = t.replace(/\s*:\s*/g, ': ');
  // Collapse excessive blank lines
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

function normalizeKey(k){
  return stripInvisibles(k || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseKeyValues(ocrText){
  const t = cleanOcrText(ocrText);
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);

  // Aliases to handle OCR variants (Portno/Port no, vel vs VCI, etc.)
  const aliases = {
    'customer number': 'Customer number',
    'phone': 'Phone',
    'fv customer number': 'FV customer number',
    'pop name': 'POP name',
    'arabic pop': 'Arabic pop',
    'card no': 'Card no',
    'cardno': 'Card no',
    'cabin code': 'Cabin code',
    'fcc code': 'FCC code',
    'dslam host name': 'DSLAM host name',
    'dslam hostname': 'DSLAM host name',
    'dslam type': 'DSLAM type',
    'dslam number': 'DSLAM number',
    'english pop': 'English pop',
    'adsl username': 'ADSL username',
    'iptv status': 'IPTV status',
    'has iptv': 'Has IPTV',
    'pop type': 'POP type',
    'card type': 'Card type',
    'port no': 'Port no',
    'portno': 'Port no',
    'frame': 'Frame',
    'vpi': 'VPI',
    'vci': 'VCI',
    'vel': 'VCI',
    'contracted speed': 'Contracted speed',
    'nas port id': 'Nas port id',

    'congested status': 'Congested status',
    'congested date': 'Congested date',
    'copper cabin number': 'Copper cabin number',
    'box number': 'Box number',
    'cpe type': 'CPE type',
    'box coordinates': 'Box coordinates',
    'local loop': 'Local loop',
    'cpe virtual ip': 'CPE virtual ip',
    'has option pack': 'Has option pack',
  };

  const kv = {};

  for(const line of lines){
    const idx = line.indexOf(':');
    if(idx === -1) continue;

    const kRaw = line.slice(0, idx).trim();
    let vRaw = line.slice(idx + 1).trim();

    const nk = normalizeKey(kRaw);
    const canon = aliases[nk];
    if(!canon) continue;

    vRaw = stripInvisibles(vRaw);

    if(canon === 'Arabic pop'){
      vRaw = vRaw
        .replace(/[•·]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    kv[canon] = vRaw;
  }

  return kv;
}

function formatPortDetails(ocrText){
  const kv = parseKeyValues(ocrText);

  const ordered = [
    ['Customer number', 'Customer number:'],
    ['Phone', 'Phone:'],
    ['FV customer number', 'FV customer number:'],
    ['POP name', 'POP name:'],
    ['Arabic pop', 'Arabic pop:'],
    ['Card no', 'Card no:'],
    ['Cabin code', 'Cabin code:'],
    ['FCC code', 'FCC code:'],
    ['DSLAM host name', 'DSLAM host name:'],
    ['DSLAM type', 'DSLAM type:'],
    ['DSLAM number', 'DSLAM number:'],
    ['English pop', 'English pop:'],
    ['ADSL username', 'ADSL username:'],
    ['IPTV status', 'IPTV status:'],
    ['Has IPTV', 'Has IPTV:'],
    ['POP type', 'POP type:'],
    ['Card type', 'Card type:'],
    ['Port no', 'Port no:'],
    ['Frame', 'Frame:'],
    ['VPI', 'VPI:'],
    ['VCI', 'VCI:'],
    ['Contracted speed', 'Contracted speed:'],
    ['Nas port id', 'Nas port id:'],
  ];

  const logs = [
    ['Congested status', 'Congested status:'],
    ['Congested date', 'Congested date:'],
    ['Copper cabin number', 'Copper cabin number:'],
    ['Box number', 'Box number:'],
    ['CPE type', 'CPE type:'],
    ['Box coordinates', 'Box coordinates:'],
    ['Local loop', 'Local loop:'],
    ['CPE virtual ip', 'CPE virtual ip:'],
    ['Has option pack', 'Has option pack:'],
  ];

  const outLines = [];
  outLines.push('Port details');

  function pushField(key, label){
    outLines.push(label);
    outLines.push('');
    outLines.push(kv[key] ?? '');
  }

  for(const [k, label] of ordered){
    pushField(k, label);
  }

  outLines.push('Subscriber database logs');

  for(const [k, label] of logs){
    pushField(k, label);
  }

  return outLines.join('\n').replace(/[ \t]+\n/g, '\n').trim() + '\n';
}

    async function runOcr(mode){
      if(!lastImageFile) return;
      if(isOcrRunning) return;

      isOcrRunning = true;
      out.value = '';
      const isHq = mode === 'hq';
      setStatus(isHq ? 'HQ: تحضير الصورة للاستخراج (تحسين أعلى)...' : 'FAST: تحضير الصورة للاستخراج...');
      extractBtn.disabled = true;
      hqBtn.disabled = true;

      try{
        const { main, altGray, deskewAngle } = await preprocessForOcr(lastImageFile, mode);

        // Preview should show the actual processed image for clarity
        preview.src = main.toDataURL('image/png');
        preview.style.display = 'block';

        const w = await ensureWorker(mode);

        // Try multiple PSMs (segmentation modes), pick best
        // psm 6: single uniform block, psm 11: sparse text (UI/labels)
        // For HQ mode, try multiple page segmentation modes for maximum accuracy.
        // In FAST mode, restrict to a single mode (6: uniform block) to speed
        // up recognition dramatically.
        const psmList = isHq ? ['6','11','4'] : ['6'];
        const images = isHq && altGray
          ? [{ tag:'bin', img: main }, { tag:'gray', img: altGray }]
          : [{ tag:'bin', img: main }];

        setStatus(deskewAngle
          ? `${isHq ? 'HQ' : 'FAST'}: OCR جاري... (تم تصحيح الميل ${deskewAngle.toFixed(2)}°)`
          : `${isHq ? 'HQ' : 'FAST'}: OCR جاري...`);

        const allResults = [];
        for(const im of images){
          for(const psm of psmList){
            await w.setParameters({ tessedit_pageseg_mode: psm });
            const res = await w.recognize(im.img);
            allResults.push(res);
            // If already very confident, stop early
            if(res?.data?.confidence >= 85 && (res?.data?.text||'').trim().length >= 20){
              break;
            }
          }
          const last = allResults[allResults.length-1];
          if(last?.data?.confidence >= 88) break;
        }

        const best = pickBestResult(allResults);
        const text = (best?.text || '').trim();

        // IMPORTANT: user wants RAW OCR only (no templates / no fixed formatting)
        out.value = text ? cleanOcrText(text) : '';
        setStatus(text ? `تم ✅ (${isHq ? 'HQ' : 'FAST'}) (Confidence: ${Math.round(best.conf)}%)` : 'لم يتم العثور على نص واضح — جرّب صورة أوضح/أكبر');
        return { text, confidence: (best && typeof best.conf === 'number') ? best.conf : -1 };
      } catch (e){
        console.error(e);
        setStatus('حصل خطأ أثناء OCR — افتح Console للتفاصيل');
        return { text: '', confidence: -1 };
      } finally{
        isOcrRunning = false;
        setExtractEnabled(!!lastImageFile);
        extractBtn.disabled = false;
        hqBtn.disabled = false;
      }
    }

    // ---------- Events ----------
    async function onNewImageFile(file){
      lastImageFile = file;
      setExtractEnabled(true);
      setStatus('جاهز — Extract (Fast) سريع أو HQ أدق');
      // Auto-run FAST by default, then auto-fallback to HQ if the result looks weak.
      const fastRes = await runOcr('fast');
      const fastText = (fastRes?.text || '').trim();
      const fastConf = typeof fastRes?.confidence === 'number' ? fastRes.confidence : -1;
      // Heuristics tuned for UI screenshots: low confidence or very short output.
      if(fastText && fastConf >= 80) return;
      if(fastText.length >= 35 && fastConf >= 70) return;
      await runOcr('hq');
    }


// Detect whether Call Back tab is currently visible
function isCallBackActive(){
  const cb = document.getElementById('Call Back');
  if(!cb) return true;
  // Some layouts make offsetParent null even when visible; rely on computed display + client rects.
  const style = window.getComputedStyle(cb);
  if(style.display === 'none' || style.visibility === 'hidden') return false;
  return cb.getClientRects().length > 0;
}

function extractImageFileFromClipboardEvent(e){
  const cd = e.clipboardData;
  if(!cd) return null;

  // Prefer files list (works well on document-level listeners too)
  if(cd.files && cd.files.length){
    for(const f of cd.files){
      if(f && f.type && f.type.startsWith('image/')) return f;
    }
  }

  // Fallback to items
  if(cd.items && cd.items.length){
    for(const item of cd.items){
      if(item.type && item.type.startsWith('image/')){
        const f = item.getAsFile();
        if(f) return f;
      }
    }
  }

  // Extra fallback: some tools put the image as a data-URL inside text/html.
  // If we can extract it, convert to a File and process it.
  try{
    if(cd.types && Array.from(cd.types).includes('text/html')){
      const html = cd.getData('text/html') || '';
      const m = html.match(/src\s*=\s*"(data:image\/[a-zA-Z0-9.+-]+;base64,[^"]+)"/i);
      if(m && m[1]){
        const file = dataUrlToFile(m[1], 'pasted-image.png');
        if(file) return file;
      }
    }
  }catch(_e){ /* ignore */ }
  return null;
}

function dataUrlToFile(dataUrl, filename){
  try{
    const parts = dataUrl.split(',');
    if(parts.length < 2) return null;
    const mimeMatch = parts[0].match(/data:([^;]+);base64/i);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const b64 = parts.slice(1).join(',');
    const bin = atob(b64);
    const len = bin.length;
    const u8 = new Uint8Array(len);
    for(let i=0;i<len;i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], filename, { type: mime });
  }catch(_e){
    return null;
  }
}

function handlePasteForOcr(e){
  // If an image is present, ALWAYS hijack the paste and route it into the OCR tool.
  // This prevents the browser from pasting it into some other focused element.
  if(!isCallBackActive()) return;
  const file = extractImageFileFromClipboardEvent(e);
  if(file){
    e.preventDefault();
    e.stopPropagation();
    onNewImageFile(file);
  }
}

    // Paste image (reliable catcher + direct zone paste)
    catcher.addEventListener('paste', handlePasteForOcr);
    zone.addEventListener('paste', handlePasteForOcr);

    // Also bind to the big zone itself (contenteditable) so pasting works even if catcher focus fails.
    zone.addEventListener('paste', handlePasteForOcr);

    // Also listen at document level so Ctrl+V works even if the zone isn't focused
    // (as long as the user is currently on Call Back tab).
    document.addEventListener('paste', handlePasteForOcr, true);

    // Drag & Drop
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.opacity = '0.9'; });
    zone.addEventListener('dragleave', () => { zone.style.opacity = '1'; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.opacity = '1';
      const file = e.dataTransfer?.files?.[0];
      if(file && file.type && file.type.startsWith('image/')) onNewImageFile(file);
    });

    // Click focus: always focus the hidden paste catcher
    const focusCatcher = () => {
      try{ catcher.focus({ preventScroll: true }); }catch{ catcher.focus(); }
    };
    zone.addEventListener('pointerdown', focusCatcher);
    zone.addEventListener('click', focusCatcher);
    // Also focus catcher when mouse enters the tool (helps quick Ctrl+V)
    zone.addEventListener('mouseenter', () => { if(document.activeElement !== catcher) focusCatcher(); });

    // Keep catcher clean (no visible typing anyway)
    catcher.addEventListener('input', () => { catcher.value = ''; });

    extractBtn.addEventListener('click', () => runOcr('fast'));
    hqBtn.addEventListener('click', () => runOcr('hq'));

    copyBtn.addEventListener('click', async () => {
      const text = (out.value || '').trim();
      if(!text){ setStatus('مفيش نص يتنسخ'); return; }
      try{
        await navigator.clipboard.writeText(text);
        setStatus('Copied ✅');
      }catch(_e){
        out.select();
        document.execCommand('copy');
        setStatus('Copied ✅');
      }
    });

    clearBtn.addEventListener('click', () => {
      lastImageFile = null;
      out.value = '';
      preview.src = '';
      preview.style.display = 'none';
      resetZoneText();
      setExtractEnabled(false);
      setStatus('جاهز');
      zone.focus();
    });

    // Performance-safe behavior for weak devices:
    // keep OCR fully on-demand instead of warming it during page load.
    // The first OCR run may take a little longer, but normal page entry
    // becomes noticeably lighter and avoids background CPU/memory work.

    setStatus('جاهز (اضغط داخل المربع ثم Ctrl+V)');
  });
})();

