/* Step 5 - Support & Suggestions Professional UX layer
   Front-end only. No extra Cloudflare requests. */
(function(){
  "use strict";

  const D = document;
  const state = {
    supportSearch: "",
    suggestionSearch: "",
    suggestionSort: "default",
    toastLast: new Map(),
    observersStarted: false
  };

  function $(sel, root = D){ return root.querySelector(sel); }
  function $all(sel, root = D){ return Array.from(root.querySelectorAll(sel)); }
  function clean(s){ return String(s || "").replace(/\s+/g, " ").trim(); }
  function lower(s){ return clean(s).toLocaleLowerCase("ar-EG"); }

  function ensureToastRoot(){
    let root = $(".srux-toast-root");
    if(!root){
      root = D.createElement("div");
      root.className = "srux-toast-root";
      D.body.appendChild(root);
    }
    return root;
  }

  function toast(message, type = "info"){
    const msg = clean(message);
    if(!msg) return;
    const key = type + ":" + msg;
    const now = Date.now();
    if((state.toastLast.get(key) || 0) + 1800 > now) return;
    state.toastLast.set(key, now);

    const root = ensureToastRoot();
    const el = D.createElement("div");
    el.className = "srux-toast";
    el.dataset.type = type || "info";
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-show"));
    setTimeout(() => {
      el.classList.remove("is-show");
      setTimeout(() => el.remove(), 220);
    }, type === "error" ? 5200 : 3300);
  }

  function statusType(node){
    const t = String(node?.dataset?.type || "info").toLowerCase();
    if(t.includes("error")) return "error";
    if(t.includes("warn")) return "warn";
    if(t.includes("success")) return "success";
    return "info";
  }

  function watchStatusNode(node){
    if(!node || node.dataset.sruxWatched === "1") return;
    node.dataset.sruxWatched = "1";
    let last = clean(node.textContent);
    const show = () => {
      const text = clean(node.textContent);
      if(text && text !== last){
        last = text;
        toast(text, statusType(node));
      } else {
        last = text;
      }
    };
    new MutationObserver(show).observe(node, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:["data-type"] });
  }

  function enhanceStatuses(){
    ["#suggestionStatus", "#supportChatStatus", "#adminStatus", "#adminAuthStatus"].forEach((sel) => watchStatusNode($(sel)));
  }

  function addAutoGrow(textarea){
    if(!textarea || textarea.dataset.sruxGrow === "1") return;
    textarea.dataset.sruxGrow = "1";
    const grow = () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(160, Math.max(44, textarea.scrollHeight)) + "px";
    };
    ["input", "change", "paste", "keyup"].forEach((ev) => textarea.addEventListener(ev, grow));
    setTimeout(grow, 0);
  }

  function ensureCounter(input, max){
    if(!input || input.dataset.sruxCounter === "1") return;
    input.dataset.sruxCounter = "1";
    const counter = D.createElement("span");
    counter.className = "srux-char-counter";
    const update = () => {
      const len = String(input.value || "").length;
      const limit = Number(input.getAttribute("maxlength") || max || 0);
      counter.textContent = limit ? `${len}/${limit}` : String(len);
      counter.classList.toggle("is-warn", !!limit && len >= limit * .85 && len < limit);
      counter.classList.toggle("is-max", !!limit && len >= limit);
    };
    const parent = input.parentElement;
    if(parent && parent.classList.contains("support-compose")){
      parent.insertBefore(counter, input.nextSibling);
    } else if(parent){
      parent.appendChild(counter);
    }
    input.addEventListener("input", update);
    update();
  }

  function enhanceTextareas(){
    ["#supportMessageInput", "#suggestionInput", ".sug-reply-input"].forEach((sel) => $all(sel).forEach(addAutoGrow));
    ensureCounter($("#supportMessageInput"), 5000);
    ensureCounter($("#suggestionInput"), 1200);
    $all(".sug-reply-input").forEach((el) => ensureCounter(el, 1200));
  }

  function ensureSupportToolbar(){
    const container = $(".support-users");
    const title = $(".support-users-title", container || D);
    const list = $("#supportUsersList");
    if(!container || !title || !list) return;

    if(!$("#sruxSupportStats")){
      const stats = D.createElement("div");
      stats.id = "sruxSupportStats";
      stats.className = "srux-mini-stats";
      title.insertAdjacentElement("afterend", stats);
    }

    if(!$("#sruxSupportSearch")){
      const bar = D.createElement("div");
      bar.className = "srux-toolbar srux-compact";
      bar.innerHTML = `<input id="sruxSupportSearch" class="srux-search" type="search" autocomplete="off" placeholder="Search people…" aria-label="Search people">`;
      $("#sruxSupportStats")?.insertAdjacentElement("afterend", bar);
      $("#sruxSupportSearch")?.addEventListener("input", (e) => {
        state.supportSearch = lower(e.target.value);
        applySupportFilter();
      });
    }

    if(!$("#sruxSupportEmpty")){
      const empty = D.createElement("div");
      empty.id = "sruxSupportEmpty";
      empty.className = "srux-empty-filter";
      empty.style.display = "none";
      empty.textContent = "No people match this search.";
      list.insertAdjacentElement("afterend", empty);
    }
  }

  function updateSupportStats(){
    const rows = $all("#supportUsersList .support-user");
    const online = rows.filter((r) => r.classList.contains("is-online")).length;
    const total = rows.length;
    const stats = $("#sruxSupportStats");
    if(stats){
      stats.innerHTML = `<span><span class="srux-online-dot"></span><strong>${online}</strong> online</span><span><strong>${total}</strong> people</span>`;
    }
    rows.forEach((row) => {
      const name = clean($(".support-user-name", row)?.textContent);
      const onlineText = row.classList.contains("is-online") ? "Online" : "Offline";
      if(name) row.title = `${name} • ${onlineText}`;
    });
  }

  function applySupportFilter(){
    ensureSupportToolbar();
    const q = state.supportSearch;
    const rows = $all("#supportUsersList .support-user");
    let visible = 0;
    rows.forEach((row) => {
      const text = lower(row.textContent);
      const show = !q || text.includes(q);
      row.classList.toggle("srux-hidden-by-filter", !show);
      if(show) visible += 1;
    });
    const empty = $("#sruxSupportEmpty");
    if(empty) empty.style.display = rows.length && visible === 0 ? "block" : "none";
    updateSupportStats();
  }

  function ensureSuggestionsToolbar(){
    const panel = $("#sharedSuggestions") || $(".suggestions-panel");
    const list = $("#suggestionsList");
    const form = $(".suggestions-form");
    if(!panel || !list) return;

    if(!$("#sruxSuggestionsToolbar")){
      const bar = D.createElement("div");
      bar.id = "sruxSuggestionsToolbar";
      bar.className = "srux-toolbar";
      bar.innerHTML = `
        <input id="sruxSuggestionsSearch" class="srux-search" type="search" autocomplete="off" placeholder="Search suggestions…" aria-label="Search suggestions">
        <select id="sruxSuggestionsSort" class="srux-select" aria-label="Sort suggestions">
          <option value="default">Newest</option>
          <option value="replies">Most replies</option>
          <option value="mine">My suggestions</option>
        </select>
        <span id="sruxSuggestionsCount" class="srux-pill">0 items</span>
      `;
      list.insertAdjacentElement("beforebegin", bar);
      $("#sruxSuggestionsSearch")?.addEventListener("input", (e) => {
        state.suggestionSearch = lower(e.target.value);
        applySuggestionsUx();
      });
      $("#sruxSuggestionsSort")?.addEventListener("change", (e) => {
        state.suggestionSort = e.target.value || "default";
        applySuggestionsUx();
      });
    }

    if(form && !$("#sruxSuggestionHint")){
      const hint = D.createElement("div");
      hint.id = "sruxSuggestionHint";
      hint.className = "srux-mini-stats";
      hint.innerHTML = `<span>Enter to send • Shift+Enter for new line</span><span>Shared with everyone</span>`;
      form.insertAdjacentElement("afterend", hint);
    }

    if(!$("#sruxSuggestionsEmpty")){
      const empty = D.createElement("div");
      empty.id = "sruxSuggestionsEmpty";
      empty.className = "srux-empty-filter";
      empty.style.display = "none";
      empty.textContent = "No suggestions match this search.";
      list.insertAdjacentElement("afterend", empty);
    }
  }

  function getReplyCount(card){
    const badge = $(".sug-replies-badge", card);
    const btn = $(".sug-replies-toggle", card);
    const raw = badge?.textContent || btn?.dataset?.replyCount || "0";
    const n = parseInt(String(raw).replace(/\D+/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  }

  function rememberSuggestionOrder(cards){
    cards.forEach((card, idx) => {
      if(!card.dataset.sruxOrder) card.dataset.sruxOrder = String(idx);
    });
  }

  function sortSuggestionCards(cards){
    const list = $("#suggestionsList");
    if(!list || cards.length < 2) return;
    const sorted = cards.slice();
    if(state.suggestionSort === "replies"){
      sorted.sort((a,b) => getReplyCount(b) - getReplyCount(a) || Number(a.dataset.sruxOrder||0) - Number(b.dataset.sruxOrder||0));
    } else if(state.suggestionSort === "mine"){
      sorted.sort((a,b) => Number(b.classList.contains("srux-own-suggestion")) - Number(a.classList.contains("srux-own-suggestion")) || Number(a.dataset.sruxOrder||0) - Number(b.dataset.sruxOrder||0));
    } else {
      sorted.sort((a,b) => Number(a.dataset.sruxOrder||0) - Number(b.dataset.sruxOrder||0));
    }
    const frag = D.createDocumentFragment();
    sorted.forEach((card) => frag.appendChild(card));
    list.appendChild(frag);
  }

  function markOwnSuggestions(cards){
    const currentNames = [
      localStorage.getItem("sr_display_name"),
      localStorage.getItem("sr_user_name"),
      localStorage.getItem("supportUserName"),
      localStorage.getItem("sr_nickname")
    ].filter(Boolean).map(lower);
    cards.forEach((card) => {
      const name = lower($(".suggestion-name", card)?.textContent);
      const own = !!name && currentNames.includes(name);
      card.classList.toggle("srux-own-suggestion", own);
      if(getReplyCount(card) >= 3) card.classList.add("srux-top-replies");
    });
  }

  function applySuggestionsUx(){
    ensureSuggestionsToolbar();
    const list = $("#suggestionsList");
    if(!list) return;
    const cards = $all(".suggestion-item", list);
    rememberSuggestionOrder(cards);
    markOwnSuggestions(cards);
    sortSuggestionCards(cards);

    const q = state.suggestionSearch;
    let visible = 0;
    cards.forEach((card) => {
      const text = lower(card.textContent);
      const show = !q || text.includes(q);
      card.classList.toggle("srux-hidden-by-filter", !show);
      if(show) visible += 1;
    });
    const count = $("#sruxSuggestionsCount");
    if(count) count.textContent = `${visible}/${cards.length} items`;
    const empty = $("#sruxSuggestionsEmpty");
    if(empty) empty.style.display = cards.length && visible === 0 ? "block" : "none";
  }

  function applyEmptyStates(){
    const msgList = $("#supportMessagesList");
    if(msgList && !msgList.querySelector(".support-msg") && !msgList.querySelector(".srux-empty-state")){
      const empty = D.createElement("div");
      empty.className = "srux-empty-state";
      empty.textContent = "No messages here yet.";
      msgList.appendChild(empty);
    } else if(msgList && msgList.querySelector(".support-msg")){
      msgList.querySelectorAll(".srux-empty-state").forEach((e) => e.remove());
    }
  }

  function applyAll(){
    enhanceStatuses();
    enhanceTextareas();
    ensureSupportToolbar();
    applySupportFilter();
    ensureSuggestionsToolbar();
    applySuggestionsUx();
    applyEmptyStates();
  }

  function startObservers(){
    if(state.observersStarted) return;
    state.observersStarted = true;
    let pending = false;
    const schedule = () => {
      if(pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; applyAll(); });
    };
    new MutationObserver(schedule).observe(D.body, { childList:true, subtree:true, attributes:true, attributeFilter:["class", "style", "data-reply-count"] });
    window.addEventListener("sr:suggestions-rendered", schedule);
    window.addEventListener("sr:support-users-updated", schedule);
    window.addEventListener("sr:nickname-updated", schedule);
  }

  function init(){
    applyAll();
    startObservers();
    setTimeout(applyAll, 600);
    setTimeout(applyAll, 1600);
  }

  if(D.readyState === "loading") D.addEventListener("DOMContentLoaded", init, { once:true });
  else init();
})();
