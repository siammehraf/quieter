/* ==========================================================================
   Quieter v1.0.0 — Lightweight Vanilla ES6+ Controller
   ========================================================================== */

const DEFAULT_FONTS = [
  { label: "Poppins", value: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  { label: "Noto Serif Bengali (বাংলা)", value: "'Noto Serif Bengali', 'Bundled Noto Serif Bengali', serif" }
];

const SEARCH_ENGINES = {
  yt:  { name: "YouTube",    url: q => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  gh:  { name: "GitHub",     url: q => `https://github.com/search?q=${encodeURIComponent(q)}` },
  w:   { name: "Wikipedia",  url: q => `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` },
  ddg: { name: "DuckDuckGo", url: q => `https://duckduckgo.com/?q=${encodeURIComponent(q)}` },
  g:   { name: "Google",     url: q => `https://www.google.com/search?q=${encodeURIComponent(q)}` }
};

const EMPTY_PLACEHOLDER_QUOTE = {
  id: "empty-placeholder",
  text: "Open the menu (☰) to add quotes, import a file, or paste your collection into quotes-bank.js.",
  author: "Quieter",
  category: "welcome",
  tag: "collected",
  favorite: false
};

const DEFAULT_SETTINGS = {
  theme: "dark",
  gradient: "midnight",
  accentColor: "#5eead4",
  glassAlpha: 56,
  breathingGlow: true,
  idleAutoHide: true,
  idleDelaySec: 3,
  monogram: "@siammehraf",
  use24h: false,
  showCategory: true,
  filterCategory: "all",
  filterAuthor: "all",
  quoteScale: 100,
  quoteLineHeight: 1.48,
  fontEnQuote: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontEnAuthor: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontBnQuote: "'Noto Serif Bengali', 'Bundled Noto Serif Bengali', serif",
  fontBnAuthor: "'Noto Serif Bengali', 'Bundled Noto Serif Bengali', serif",
  fontMonogram: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontUI: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  customFonts: [],
  bgPhotoDataUrl: "",
  onlinePhotoEnabled: false,
  cachedOnlinePhoto: "",
  cachedOnlineDate: "",
  bgDim: 45,
  bgBlur: 0,
  pinnedSites: [],
  hiddenTopUrls: [],
  bookmarksBarEnabled: false,
  bookmarksFolderId: "1"
};

let state = {
  quotes: [],
  shuffleQueue: [],
  historyStack: [],
  lastQuoteId: null,
  currentQuote: null,
  settings: { ...DEFAULT_SETTINGS },
  pendingBulk: [],
  pendingFullBackup: null,
  ctxTargetSite: null,
  editingPinnedIndex: null
};

let idleTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  applySettingsToUI();
  startClock();
  populateFilterOptions();
  displayNextQuote(false);
  await renderShortcutTiles();
  await initBookmarksStrip();
  setupIdleAutoHide();
  bindEvents();
});

async function loadState() {
  const stored = await chrome.storage.local.get({
    quotes: [],
    shuffleQueue: [],
    lastQuoteId: null,
    settings: DEFAULT_SETTINGS
  });

  state.quotes = Array.isArray(stored.quotes) ? stored.quotes : [];
  state.shuffleQueue = Array.isArray(stored.shuffleQueue) ? stored.shuffleQueue : [];
  state.lastQuoteId = stored.lastQuoteId || null;
  state.settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };

  // Auto-sync preloaded quotes from quotes-bank.js without duplicating
  const preloaded = Array.isArray(window.PRELOADED_QUOTES) ? window.PRELOADED_QUOTES : [];
  if (preloaded.length > 0) {
    const existingById = new Map(state.quotes.map(q => [q.id, q]));
    const existingTexts = new Set(state.quotes.map(q => q.text.trim()));
    const fresh = [];
    let updatedExisting = false;

    for (let i = 0; i < preloaded.length; i++) {
      const item = preloaded[i];
      if (!item || !item.text) continue;
      const cleanText = String(item.text).trim();
      const id = item.id || `bank-${i}-${cleanText.slice(0, 12)}`;
      const cat = String(item.category || "").trim().toLowerCase();

      if (existingById.has(id)) {
        const existing = existingById.get(id);
        if (cat && !existing.category) {
          existing.category = cat;
          updatedExisting = true;
        }
      } else if (!existingTexts.has(cleanText)) {
        fresh.push({
          id,
          text: cleanText,
          author: String(item.author || "Unknown").trim(),
          tag: item.tag === "own" ? "own" : "collected",
          category: cat,
          favorite: !!item.favorite
        });
        existingById.set(id, fresh[fresh.length - 1]);
        existingTexts.add(cleanText);
      }
    }

    if (fresh.length > 0 || updatedExisting) {
      state.quotes.push(...fresh);
      await saveState(["quotes"]);
    }
  }
}

async function saveState(keys = ["quotes", "shuffleQueue", "lastQuoteId", "settings"]) {
  const payload = {};
  for (const k of keys) payload[k] = state[k];
  await chrome.storage.local.set(payload);
}

/* ==========================================================================
   Category / Favorites / Author Filter + Session History
   ========================================================================== */
function getFilteredPool() {
  if (state.quotes.length === 0) return [EMPTY_PLACEHOLDER_QUOTE];

  const { filterCategory, filterAuthor } = state.settings;
  const filtered = state.quotes.filter(q => {
    let catMatch = true;
    if (filterCategory === "favorites") {
      catMatch = !!q.favorite;
    } else if (filterCategory !== "all") {
      catMatch = (q.category || "").toLowerCase() === filterCategory.toLowerCase();
    }

    const authorMatch = filterAuthor === "all" || (q.author || "Unknown") === filterAuthor;
    return catMatch && authorMatch;
  });

  return filtered.length > 0 ? filtered : state.quotes;
}

function populateFilterOptions() {
  // Categories
  const categories = [...new Set(
    state.quotes.map(q => (q.category || "").trim().toLowerCase()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  const catSel = document.getElementById("filter-category-select");
  catSel.innerHTML = `
    <option value="all">All Categories (${categories.length})</option>
    <option value="favorites">Favorites Only (★)</option>
  `;
  for (const cat of categories) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = formatCategoryLabel(cat);
    if ((state.settings.filterCategory || "all").toLowerCase() === cat) opt.selected = true;
    catSel.appendChild(opt);
  }
  if (state.settings.filterCategory === "favorites") catSel.value = "favorites";

  // Authors
  const authors = [...new Set(state.quotes.map(q => (q.author || "Unknown").trim()))].sort((a, b) => a.localeCompare(b));
  const authSel = document.getElementById("filter-author-select");
  authSel.innerHTML = `<option value="all">All Writers (${authors.length})</option>`;
  for (const author of authors) {
    const opt = document.createElement("option");
    opt.value = author;
    opt.textContent = author;
    if (state.settings.filterAuthor === author) opt.selected = true;
    authSel.appendChild(opt);
  }

  updateFilterStatusUI();
}

function formatCategoryLabel(cat) {
  return String(cat || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function updateFilterStatusUI() {
  const pool = state.quotes.length === 0 ? [] : getFilteredPool();
  const { filterCategory, filterAuthor } = state.settings;
  const isFiltered = filterCategory !== "all" || filterAuthor !== "all";

  document.getElementById("active-pool-count").textContent = `${pool.length} active`;
  document.getElementById("btn-reset-filter").classList.toggle("hidden", !isFiltered);
}

async function displayNextQuote(pushHistory = true) {
  if (pushHistory && state.currentQuote && state.currentQuote.id !== EMPTY_PLACEHOLDER_QUOTE.id) {
    state.historyStack.push(state.currentQuote);
    if (state.historyStack.length > 50) state.historyStack.shift();
  }
  updateHistoryButtons();

  const pool = getFilteredPool();
  const validIds = new Set(pool.map(q => q.id));

  state.shuffleQueue = state.shuffleQueue.filter(id => validIds.has(id));

  if (state.shuffleQueue.length === 0) {
    const ids = pool.map(q => q.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (ids.length > 1 && ids[0] === state.lastQuoteId) {
      [ids[0], ids[1]] = [ids[1], ids[0]];
    }
    state.shuffleQueue = ids;
  }

  const nextId = state.shuffleQueue.shift();
  const quoteObj = pool.find(q => q.id === nextId) || pool[0];

  state.lastQuoteId = quoteObj.id;
  state.currentQuote = quoteObj;
  await saveState(["shuffleQueue", "lastQuoteId"]);

  renderBilingualQuote(quoteObj);
}

function displayPreviousQuote() {
  if (state.historyStack.length === 0) {
    showToast("No earlier quote in this session");
    return;
  }
  const prevQuote = state.historyStack.pop();
  updateHistoryButtons();
  state.currentQuote = prevQuote;
  renderBilingualQuote(prevQuote);
}

function updateHistoryButtons() {
  const prevBtn = document.getElementById("btn-prev-quote");
  if (prevBtn) prevBtn.disabled = state.historyStack.length === 0;
}

/* ==========================================================================
   Word-Level Bilingual Script Detector & Category Badge
   ========================================================================== */
const BANGLA_REGEX = /[\u0980-\u09FF]/;

function buildSegmentedFragment(text, enFont, bnFont) {
  const frag = document.createDocumentFragment();
  const tokens = text.split(/(\s+)/);

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      frag.appendChild(document.createTextNode(token));
      continue;
    }
    const span = document.createElement("span");
    const isBangla = BANGLA_REGEX.test(token);
    span.style.fontFamily = isBangla ? bnFont : enFont;
    span.textContent = token;
    frag.appendChild(span);
  }
  return frag;
}

function renderBilingualQuote(quoteObj) {
  const quoteEl = document.getElementById("quote-text");
  const authorEl = document.getElementById("quote-author");
  const badgeEl = document.getElementById("quote-category-badge");
  const stageEl = document.querySelector(".quote-stage");
  const favBtn = document.getElementById("btn-fav-quote");

  stageEl.style.animation = "none";
  void stageEl.offsetWidth;
  stageEl.style.animation = "";

  quoteEl.innerHTML = "";
  quoteEl.classList.toggle("is-long", quoteObj.text.length > 170);
  quoteEl.appendChild(
    buildSegmentedFragment(
      quoteObj.text,
      state.settings.fontEnQuote,
      state.settings.fontBnQuote
    )
  );

  authorEl.innerHTML = "";
  const authorText = (quoteObj.author || "Unknown").trim();
  authorEl.appendChild(
    buildSegmentedFragment(
      authorText,
      state.settings.fontEnAuthor,
      state.settings.fontBnAuthor
    )
  );

  const cat = (quoteObj.category || "").trim();
  if (state.settings.showCategory && cat && quoteObj.id !== EMPTY_PLACEHOLDER_QUOTE.id) {
    badgeEl.textContent = formatCategoryLabel(cat);
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }

  favBtn.classList.toggle("is-favorited", !!quoteObj.favorite);
}

/* ==========================================================================
   High-Res 2x PNG Quote Card Exporter (Zero External Libraries)
   ========================================================================== */
async function exportQuoteAsPng() {
  if (!state.currentQuote) return;
  const q = state.currentQuote;

  const W = 1600;
  const H = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const isLight = state.settings.theme === "light";
  const grad = state.settings.gradient || "midnight";

  ctx.fillStyle = isLight ? "#f6f5f0" : "#0b0e14";
  ctx.fillRect(0, 0, W, H);

  const drawGlow = (cx, cy, r, color) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  if (isLight) {
    drawGlow(W * 0.2, H * 0.25, W * 0.6, "rgba(204, 251, 241, 0.75)");
    drawGlow(W * 0.82, H * 0.78, W * 0.6, "rgba(254, 243, 199, 0.7)");
  } else if (grad === "obsidian") {
    drawGlow(W * 0.75, H * 0.2, W * 0.55, "rgba(161, 118, 45, 0.28)");
    drawGlow(W * 0.2, H * 0.8, W * 0.6, "rgba(30, 41, 59, 0.55)");
  } else if (grad === "nordic") {
    drawGlow(W * 0.5, 0, W * 0.65, "rgba(56, 189, 248, 0.22)");
  } else if (grad === "paper") {
    drawGlow(W * 0.3, H * 0.3, W * 0.6, "rgba(68, 56, 48, 0.42)");
  } else {
    drawGlow(W * 0.2, H * 0.22, W * 0.58, "rgba(20, 83, 89, 0.5)");
    drawGlow(W * 0.82, H * 0.78, W * 0.6, "rgba(76, 29, 75, 0.48)");
  }

  ctx.strokeStyle = isLight ? "rgba(15, 23, 42, 0.1)" : "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, W - 96, H - 96);

  const isBanglaQuote = BANGLA_REGEX.test(q.text);
  const rawQuoteFont = isBanglaQuote ? state.settings.fontBnQuote : state.settings.fontEnQuote;
  const fontSize = q.text.length > 220 ? 38 : q.text.length > 120 ? 46 : 56;
  const lineHeight = Math.round(fontSize * 1.48);

  ctx.font = `400 ${fontSize}px ${rawQuoteFont}`;
  ctx.fillStyle = isLight ? "#16181d" : "#f4f6fb";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxTextWidth = W - 260;
  const words = q.text.split(/\s+/);
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxTextWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const totalTextHeight = lines.length * lineHeight;
  let startY = (H / 2) - (totalTextHeight / 2) - 24;

  for (const line of lines) {
    ctx.fillText(line, W / 2, startY);
    startY += lineHeight;
  }

  const authorText = `— ${q.author || "Unknown"}`;
  const isBanglaAuthor = BANGLA_REGEX.test(authorText);
  const rawAuthorFont = isBanglaAuthor ? state.settings.fontBnAuthor : state.settings.fontEnAuthor;
  ctx.font = `400 26px ${rawAuthorFont}`;
  ctx.fillStyle = isLight ? "rgba(22, 24, 29, 0.68)" : "rgba(244, 246, 251, 0.68)";
  ctx.fillText(authorText, W / 2, startY + 34);

  ctx.font = `400 20px ${state.settings.fontMonogram}`;
  ctx.fillStyle = state.settings.accentColor || "#5eead4";
  ctx.fillText(state.settings.monogram || "@siammehraf", W / 2, H - 92);

  canvas.toBlob(blob => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quieter-quote-${Date.now().toString(36)}.png`;
    a.click();
    showToast("Saved quote card as PNG");
  }, "image/png");
}

/* ==========================================================================
   Idle Auto-Hide Top-Right Controls
   ========================================================================== */
function setupIdleAutoHide() {
  const resetTimer = () => {
    const controls = document.getElementById("top-controls");
    if (!controls) return;
    controls.classList.remove("is-idle");
    clearTimeout(idleTimer);

    if (!state.settings.idleAutoHide) return;
    const delayMs = Math.max(1, Number(state.settings.idleDelaySec || 3)) * 1000;
    idleTimer = setTimeout(() => {
      const drawerOpen = !document.getElementById("studio-drawer").classList.contains("hidden");
      if (!drawerOpen) controls.classList.add("is-idle");
    }, delayMs);
  };

  ["mousemove", "mousedown", "keydown", "touchstart"].forEach(evt => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });
  resetTimer();
}

/* ==========================================================================
   Clock & Date
   ========================================================================== */
function startClock() {
  const update = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: !state.settings.use24h
    });
    const dateStr = now.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric"
    });
    document.getElementById("clock-time").textContent = timeStr;
    document.getElementById("clock-date").textContent = dateStr;
  };
  update();
  setInterval(update, 1000);
}

/* ==========================================================================
   8 Glassy Site Tiles + Right-Click Context Management
   ========================================================================== */
function getFaviconUrl(pageUrl) {
  try {
    const u = new URL(chrome.runtime.getURL("/_favicon/"));
    u.searchParams.set("pageUrl", pageUrl);
    u.searchParams.set("size", "64");
    return u.toString();
  } catch {
    return "";
  }
}

function normalizeUrl(raw) {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

async function renderShortcutTiles() {
  const grid = document.getElementById("tiles-grid");
  grid.innerHTML = "";

  const pinned = (state.settings.pinnedSites || []).slice(0, 8).map((s, idx) => ({
    ...s,
    pinned: true,
    pinnedIndex: idx
  }));

  const hiddenSet = new Set((state.settings.hiddenTopUrls || []).map(normalizeUrl));
  document.getElementById("btn-reset-hidden-sites").classList.toggle("hidden", hiddenSet.size === 0);

  let topSites = [];
  if (pinned.length < 8 && chrome.topSites && chrome.topSites.get) {
    try {
      const rawTop = await chrome.topSites.get();
      const pinnedUrls = new Set(pinned.map(p => normalizeUrl(p.url)));
      topSites = rawTop
        .filter(t => {
          const norm = normalizeUrl(t.url);
          return !pinnedUrls.has(norm) && !hiddenSet.has(norm);
        })
        .slice(0, 8 - pinned.length)
        .map(t => ({
          title: t.title || new URL(t.url).hostname,
          url: t.url,
          pinned: false,
          pinnedIndex: -1
        }));
    } catch {
      topSites = [];
    }
  }

  const combined = [...pinned, ...topSites].slice(0, 8);

  for (const site of combined) {
    const a = document.createElement("a");
    a.className = "site-tile";
    a.href = site.url;
    a.title = `${site.title} (Right-click to manage)`;

    if (site.pinned) {
      const dot = document.createElement("span");
      dot.className = "tile-pin-dot";
      dot.title = "Pinned Favourite";
      a.appendChild(dot);
    }

    const iconBox = document.createElement("div");
    iconBox.className = "tile-icon-box";
    const img = document.createElement("img");
    img.src = getFaviconUrl(site.url);
    img.alt = "";
    img.onerror = () => {
      img.remove();
      iconBox.textContent = (site.title || "?").charAt(0).toUpperCase();
    };
    iconBox.appendChild(img);

    const label = document.createElement("span");
    label.className = "tile-label";
    label.textContent = site.title;

    a.appendChild(iconBox);
    a.appendChild(label);

    a.addEventListener("contextmenu", e => {
      e.preventDefault();
      openTileContextMenu(e.clientX, e.clientY, site);
    });

    grid.appendChild(a);
  }

  if (combined.length < 8) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "site-tile";
    addBtn.title = "Pin a Favourite Site";
    addBtn.innerHTML = `
      <div class="tile-icon-box" style="font-size:18px;font-weight:500;">+</div>
      <span class="tile-label">Add Site</span>
    `;
    addBtn.addEventListener("click", () => openSiteModal());
    grid.appendChild(addBtn);
  }
}

function openTileContextMenu(x, y, site) {
  state.ctxTargetSite = site;
  const menu = document.getElementById("tile-context-menu");
  const pinBtn = document.getElementById("ctx-pin-tile");
  const hideBtn = document.getElementById("ctx-hide-tile");

  pinBtn.textContent = site.pinned ? "Unpin Favourite" : "Pin as Favourite";
  hideBtn.textContent = site.pinned ? "Remove Shortcut" : "Hide from Suggestions";

  menu.classList.remove("hidden");
  const maxX = window.innerWidth - 185;
  const maxY = window.innerHeight - 130;
  menu.style.left = `${Math.min(x, maxX)}px`;
  menu.style.top = `${Math.min(y, maxY)}px`;
}

function openSiteModal(prefill = null, editIndex = null) {
  state.editingPinnedIndex = editIndex;
  document.getElementById("site-modal-title").textContent = editIndex !== null ? "Edit Shortcut" : "Pin Favourite Site";
  document.getElementById("site-title-input").value = prefill ? prefill.title : "";
  document.getElementById("site-url-input").value = prefill ? prefill.url : "";
  document.getElementById("site-modal").classList.remove("hidden");
  document.getElementById("site-title-input").focus();
}

/* ==========================================================================
   Optional Toggleable Bookmarks Strip
   ========================================================================== */
async function initBookmarksStrip() {
  const toggle = document.getElementById("toggle-bookmarks-bar");
  const folderWrap = document.getElementById("bookmarks-folder-wrap");
  const folderSelect = document.getElementById("select-bookmarks-folder");

  toggle.checked = !!state.settings.bookmarksBarEnabled;
  folderWrap.classList.toggle("hidden", !state.settings.bookmarksBarEnabled);

  if (!chrome.bookmarks || !chrome.bookmarks.getTree) return;

  try {
    const tree = await chrome.bookmarks.getTree();
    const folders = [];
    const walk = nodes => {
      for (const node of nodes) {
        if (node.children) {
          if (node.title) folders.push({ id: node.id, title: node.title });
          walk(node.children);
        }
      }
    };
    walk(tree);

    folderSelect.innerHTML = "";
    for (const f of folders) {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.title;
      if (f.id === state.settings.bookmarksFolderId) opt.selected = true;
      folderSelect.appendChild(opt);
    }
  } catch { /* ignore */ }

  await renderBookmarksStrip();
}

async function renderBookmarksStrip() {
  const bar = document.getElementById("bookmarks-bar");
  if (!state.settings.bookmarksBarEnabled || !chrome.bookmarks) {
    bar.classList.add("hidden");
    return;
  }

  try {
    const children = await chrome.bookmarks.getChildren(state.settings.bookmarksFolderId || "1");
    const links = children.filter(c => c.url);
    bar.innerHTML = "";

    if (links.length === 0) {
      bar.innerHTML = `<span class="helper-text" style="padding:2px 6px;">No bookmarks in selected folder</span>`;
    } else {
      for (const bm of links.slice(0, 24)) {
        const a = document.createElement("a");
        a.className = "bm-link";
        a.href = bm.url;
        a.title = `${bm.title}\n${bm.url}`;

        const badge = document.createElement("span");
        badge.className = "bm-icon-badge";
        const img = document.createElement("img");
        img.src = getFaviconUrl(bm.url);
        img.alt = "";
        img.onerror = () => badge.remove();
        badge.appendChild(img);

        const span = document.createElement("span");
        span.textContent = bm.title || new URL(bm.url).hostname;

        a.appendChild(badge);
        a.appendChild(span);
        bar.appendChild(a);
      }
    }
    bar.classList.remove("hidden");
  } catch {
    bar.classList.add("hidden");
  }
}

/* ==========================================================================
   Settings, Themes, Backgrounds & Dynamic Typography
   ========================================================================== */
function applySettingsToUI() {
  const s = state.settings;
  document.documentElement.setAttribute("data-theme", s.theme);
  document.documentElement.setAttribute("data-gradient", s.gradient);

  document.documentElement.style.setProperty("--accent", s.accentColor || "#5eead4");
  document.documentElement.style.setProperty("--glass-alpha", ((s.glassAlpha ?? 56) / 100).toFixed(2));
  document.documentElement.style.setProperty("--monogram-font", s.fontMonogram);
  document.documentElement.style.setProperty("--ui-font", s.fontUI);
  document.documentElement.style.setProperty("--quote-scale", (s.quoteScale / 100).toFixed(2));
  document.documentElement.style.setProperty("--quote-lh", String(s.quoteLineHeight));

  document.body.classList.toggle("breathing-glow", s.breathingGlow !== false);

  document.getElementById("toggle-idle-hide").checked = s.idleAutoHide !== false;
  document.getElementById("idle-delay-wrap").classList.toggle("hidden", s.idleAutoHide === false);
  document.getElementById("slider-idle-delay").value = s.idleDelaySec || 3;
  document.getElementById("idle-delay-val").textContent = s.idleDelaySec || 3;
  document.getElementById("toggle-breathing-glow").checked = s.breathingGlow !== false;

  document.getElementById("slider-glass-alpha").value = s.glassAlpha ?? 56;
  document.getElementById("glass-alpha-val").textContent = s.glassAlpha ?? 56;
  document.getElementById("input-custom-accent").value = s.accentColor || "#5eead4";
  document.querySelectorAll(".accent-dot").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.accent.toLowerCase() === (s.accentColor || "#5eead4").toLowerCase());
  });

  document.getElementById("slider-quote-scale").value = s.quoteScale;
  document.getElementById("quote-scale-val").textContent = s.quoteScale;
  document.getElementById("slider-quote-lh").value = s.quoteLineHeight;
  document.getElementById("quote-lh-val").textContent = Number(s.quoteLineHeight).toFixed(2);

  document.getElementById("icon-sun").classList.toggle("hidden", s.theme !== "dark");
  document.getElementById("icon-moon").classList.toggle("hidden", s.theme === "dark");

  document.getElementById("monogram-display").textContent = s.monogram || "@siammehraf";
  document.getElementById("input-monogram").value = s.monogram || "@siammehraf";
  document.getElementById("toggle-24h").checked = !!s.use24h;
  document.getElementById("toggle-show-category").checked = s.showCategory !== false;

  document.querySelectorAll(".swatch").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.grad === s.gradient);
  });

  document.documentElement.style.setProperty("--dim-opacity", (s.bgDim / 100).toFixed(2));
  document.documentElement.style.setProperty("--bg-blur", `${s.bgBlur}px`);
  document.getElementById("slider-dim").value = s.bgDim;
  document.getElementById("dim-val").textContent = s.bgDim;
  document.getElementById("slider-blur").value = s.bgBlur;
  document.getElementById("blur-val").textContent = s.bgBlur;
  document.getElementById("toggle-online-photo").checked = !!s.onlinePhotoEnabled;

  applyBackgroundPhoto();
  populateFontSelectors();
  renderSavedQuotesList();
  renderPinnedSitesList();
}

async function applyBackgroundPhoto() {
  const s = state.settings;
  const photoEl = document.getElementById("bg-photo");
  let activeSrc = s.bgPhotoDataUrl || "";

  if (!activeSrc && s.onlinePhotoEnabled) {
    const today = new Date().toISOString().slice(0, 10);
    if (s.cachedOnlinePhoto && s.cachedOnlineDate === today) {
      activeSrc = s.cachedOnlinePhoto;
    } else {
      try {
        const res = await fetch("https://picsum.photos/1920/1080?grayscale&blur=1");
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        state.settings.cachedOnlinePhoto = dataUrl;
        state.settings.cachedOnlineDate = today;
        await saveState(["settings"]);
        activeSrc = dataUrl;
      } catch {
        activeSrc = s.cachedOnlinePhoto || "";
      }
    }
  }

  if (activeSrc) {
    photoEl.style.backgroundImage = `url("${activeSrc}")`;
    photoEl.classList.add("has-image");
    document.body.classList.add("photo-active");
  } else {
    photoEl.style.backgroundImage = "";
    photoEl.classList.remove("has-image");
    document.body.classList.remove("photo-active");
  }
}

function blobToDataUrl(blob) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

function compressUploadedImage(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const maxDim = 1920;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = url;
  });
}

function populateFontSelectors() {
  const customOptions = (state.settings.customFonts || []).map(name => ({
    label: `${name} (PC)`,
    value: `'${name}', sans-serif`
  }));
  const allOptions = [...DEFAULT_FONTS, ...customOptions];

  const mapping = {
    "font-en-quote": state.settings.fontEnQuote,
    "font-en-author": state.settings.fontEnAuthor,
    "font-bn-quote": state.settings.fontBnQuote,
    "font-bn-author": state.settings.fontBnAuthor,
    "font-monogram": state.settings.fontMonogram,
    "font-ui": state.settings.fontUI
  };

  for (const [selectId, currentVal] of Object.entries(mapping)) {
    const sel = document.getElementById(selectId);
    sel.innerHTML = "";
    for (const opt of allOptions) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === currentVal) o.selected = true;
      sel.appendChild(o);
    }
  }
}

/* ==========================================================================
   Bulk Parser & Full Backup Detector
   ========================================================================== */
function parseImportPayload(raw, filename = "") {
  const trimmed = raw.trim();
  if (!trimmed) return { type: "empty" };

  if (filename.endsWith(".json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsedJson = JSON.parse(trimmed);
      if (parsedJson && typeof parsedJson === "object" && !Array.isArray(parsedJson) && Array.isArray(parsedJson.quotes)) {
        return {
          type: "full-backup",
          quotes: parsedJson.quotes.map(item => ({
            id: item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            text: String(item.text || item.quote || "").trim(),
            author: String(item.author || item.writer || "Unknown").trim(),
            tag: item.tag === "own" ? "own" : "collected",
            category: String(item.category || "").trim().toLowerCase(),
            favorite: !!item.favorite
          })).filter(q => q.text),
          settings: parsedJson.settings && typeof parsedJson.settings === "object" ? parsedJson.settings : null
        };
      }
      if (Array.isArray(parsedJson)) {
        const items = parsedJson
          .map(item => ({
            text: String(item.text || item.quote || "").trim(),
            author: String(item.author || item.writer || "Unknown").trim(),
            tag: item.tag === "own" ? "own" : "collected",
            category: String(item.category || "").trim().toLowerCase(),
            favorite: !!item.favorite
          }))
          .filter(q => q.text);
        return { type: "quotes", items };
      }
    } catch { /* fall through */ }
  }

  if (trimmed.includes("==========")) {
    const blocks = trimmed.split("==========");
    const results = [];
    for (const block of blocks) {
      const lines = block.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length >= 3) {
        const bookTitle = lines[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
        const body = lines.slice(2).join(" ").trim();
        if (body) results.push({ text: body, author: bookTitle || "Kindle", tag: "collected", category: "kindle", favorite: false });
      }
    }
    if (results.length > 0) return { type: "quotes", items: results };
  }

  const lines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsed = [];

  for (let line of lines) {
    line = line.replace(/^[-*>]\s+/, "").trim();
    if (!line || line.toLowerCase() === "quote,author") continue;

    const match = line.match(/^(.+?)\s+(?:—|–|--|\|)\s+(.+)$/);
    if (match) {
      parsed.push({
        text: match[1].replace(/^["“]|["”]$/g, "").trim(),
        author: match[2].trim(),
        tag: "collected",
        category: "",
        favorite: false
      });
    } else if (filename.endsWith(".csv") && line.includes(",")) {
      const idx = line.lastIndexOf(",");
      parsed.push({
        text: line.slice(0, idx).replace(/^"|"$/g, "").trim(),
        author: line.slice(idx + 1).replace(/^"|"$/g, "").trim() || "Unknown",
        tag: "collected",
        category: "",
        favorite: false
      });
    } else {
      parsed.push({
        text: line.replace(/^["“]|["”]$/g, "").trim(),
        author: "Unknown",
        tag: "collected",
        category: "",
        favorite: false
      });
    }
  }
  return { type: "quotes", items: parsed.filter(q => q.text) };
}

/* ==========================================================================
   Drawer Lists Rendering (Fast DocumentFragment Batching)
   ========================================================================== */
function renderSavedQuotesList(filter = "") {
  const listEl = document.getElementById("saved-quotes-list");
  const countEl = document.getElementById("quote-count-label");
  countEl.textContent = `${state.quotes.length} saved`;

  const qLower = filter.toLowerCase();
  const visible = state.quotes.filter(
    q =>
      q.text.toLowerCase().includes(qLower) ||
      (q.author || "").toLowerCase().includes(qLower) ||
      (q.category || "").toLowerCase().includes(qLower)
  );

  const frag = document.createDocumentFragment();
  for (const item of visible.slice(0, 80)) {
    const li = document.createElement("li");
    li.className = "quote-item";
    const starMark = item.favorite ? "★ " : "";
    const catPart = item.category ? ` · ${formatCategoryLabel(item.category)}` : "";
    li.innerHTML = `
      <div>
        <div class="quote-item-body">${starMark}${escapeHtml(item.text)}</div>
        <div class="quote-item-meta">— ${escapeHtml(item.author || "Unknown")}${escapeHtml(catPart)}</div>
      </div>
      <button type="button" class="icon-btn small" data-del-quote="${item.id}" title="Delete">✕</button>
    `;
    frag.appendChild(li);
  }
  listEl.replaceChildren(frag);
}

function renderPinnedSitesList() {
  const listEl = document.getElementById("pinned-sites-list");
  const frag = document.createDocumentFragment();
  (state.settings.pinnedSites || []).forEach((site, idx) => {
    const li = document.createElement("li");
    li.className = "quote-item";
    li.innerHTML = `
      <div>
        <div class="quote-item-body">${escapeHtml(site.title)}</div>
        <div class="quote-item-meta">${escapeHtml(site.url)}</div>
      </div>
      <button type="button" class="icon-btn small" data-del-site="${idx}" title="Remove">✕</button>
    `;
    frag.appendChild(li);
  });
  listEl.replaceChildren(frag);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ==========================================================================
   Event Bindings
   ========================================================================== */
function bindEvents() {
  document.addEventListener("click", () => {
    document.getElementById("tile-context-menu").classList.add("hidden");
  });

  // Right-click tile actions
  document.getElementById("ctx-pin-tile").addEventListener("click", async () => {
    const site = state.ctxTargetSite;
    if (!site) return;
    if (site.pinned && site.pinnedIndex >= 0) {
      state.settings.pinnedSites.splice(site.pinnedIndex, 1);
      showToast("Unpinned favourite");
    } else {
      state.settings.pinnedSites.push({ title: site.title, url: site.url });
      state.settings.pinnedSites = state.settings.pinnedSites.slice(0, 8);
      showToast(`Pinned "${site.title}"`);
    }
    await saveState(["settings"]);
    renderPinnedSitesList();
    await renderShortcutTiles();
  });

  document.getElementById("ctx-edit-tile").addEventListener("click", () => {
    const site = state.ctxTargetSite;
    if (!site) return;
    openSiteModal(site, site.pinned ? site.pinnedIndex : null);
  });

  document.getElementById("ctx-hide-tile").addEventListener("click", async () => {
    const site = state.ctxTargetSite;
    if (!site) return;
    if (site.pinned && site.pinnedIndex >= 0) {
      state.settings.pinnedSites.splice(site.pinnedIndex, 1);
      showToast("Shortcut removed");
    } else {
      const norm = normalizeUrl(site.url);
      if (!state.settings.hiddenTopUrls.includes(norm)) {
        state.settings.hiddenTopUrls.push(norm);
      }
      showToast(`Hidden "${site.title}"`);
    }
    await saveState(["settings"]);
    renderPinnedSitesList();
    await renderShortcutTiles();
  });

  document.getElementById("btn-reset-hidden-sites").addEventListener("click", async () => {
    state.settings.hiddenTopUrls = [];
    await saveState(["settings"]);
    await renderShortcutTiles();
    showToast("Hidden shortcuts restored");
  });

  // Top Bar Controls
  document.getElementById("btn-prev-quote").addEventListener("click", displayPreviousQuote);
  document.getElementById("btn-next-quote").addEventListener("click", () => displayNextQuote(true));

  document.getElementById("btn-fav-quote").addEventListener("click", async () => {
    if (!state.currentQuote || state.currentQuote.id === EMPTY_PLACEHOLDER_QUOTE.id) return;
    state.currentQuote.favorite = !state.currentQuote.favorite;
    const idx = state.quotes.findIndex(q => q.id === state.currentQuote.id);
    if (idx !== -1) state.quotes[idx].favorite = state.currentQuote.favorite;
    await saveState(["quotes"]);
    document.getElementById("btn-fav-quote").classList.toggle("is-favorited", state.currentQuote.favorite);
    renderSavedQuotesList(document.getElementById("search-quotes-input").value);
    updateFilterStatusUI();
    showToast(state.currentQuote.favorite ? "Added to Favorites" : "Removed from Favorites");
  });

  document.getElementById("btn-copy-quote").addEventListener("click", () => {
    if (!state.currentQuote) return;
    const formatted = `"${state.currentQuote.text}" — ${state.currentQuote.author || "Unknown"}`;
    navigator.clipboard.writeText(formatted);
    showToast("Quote copied to clipboard");
  });

  document.getElementById("btn-export-png").addEventListener("click", exportQuoteAsPng);

  document.getElementById("btn-calm-mode").addEventListener("click", () => {
    document.body.classList.toggle("calm-mode");
    if (document.body.classList.contains("calm-mode")) {
      showToast("Calm mode enabled (Press Esc to restore)");
    }
  });

  document.getElementById("btn-theme-toggle").addEventListener("click", async () => {
    state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
    await saveState(["settings"]);
    applySettingsToUI();
  });

  document.getElementById("btn-reset-filter").addEventListener("click", async () => {
    state.settings.filterCategory = "all";
    state.settings.filterAuthor = "all";
    state.shuffleQueue = [];
    await saveState(["settings", "shuffleQueue"]);
    populateFilterOptions();
    displayNextQuote(true);
    showToast("Stage filter reset");
  });

  // Keyboard shortcuts (capture phase so '/' overrides browser Quick Find)
  window.addEventListener("keydown", e => {
    const active = document.activeElement;
    const isTyping = active && (["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) || active.isContentEditable);

    if (isTyping) {
      if (e.key === "Escape") active.blur();
      return;
    }

    if (e.key === "/" || e.code === "Slash") {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById("search-input");
      input.focus();
      input.select();
    } else if (e.key === "ArrowRight") {
      displayNextQuote(true);
    } else if (e.key === "ArrowLeft") {
      displayPreviousQuote();
    } else if (e.key === "Escape") {
      document.body.classList.remove("calm-mode");
      document.getElementById("studio-drawer").classList.add("hidden");
      document.getElementById("site-modal").classList.add("hidden");
      document.getElementById("tile-context-menu").classList.add("hidden");
    }
  }, { capture: true });

  // Multi-Engine Spotlight Search Bar
  const searchInput = document.getElementById("search-input");
  const enginePill = document.getElementById("search-engine-pill");
  const engineLabel = document.getElementById("search-engine-label");
  const googleIcon = document.getElementById("search-google-icon");

  const detectEnginePrefix = val => {
    const m = val.match(/^(yt|gh|w|ddg|g)\s+(.*)$/i);
    if (!m) return null;
    const key = m[1].toLowerCase();
    return { key, query: m[2], engine: SEARCH_ENGINES[key] };
  };

  searchInput.addEventListener("input", () => {
    const detected = detectEnginePrefix(searchInput.value);
    if (detected && detected.key !== "g") {
      googleIcon.classList.add("hidden");
      engineLabel.textContent = detected.engine.name;
      engineLabel.classList.remove("hidden");
      enginePill.classList.add("is-custom");
      searchInput.classList.add("has-engine-label");
    } else {
      googleIcon.classList.remove("hidden");
      engineLabel.classList.add("hidden");
      enginePill.classList.remove("is-custom");
      searchInput.classList.remove("has-engine-label");
    }
  });

  document.getElementById("search-form").addEventListener("submit", e => {
    const val = searchInput.value.trim();
    if (!val) {
      e.preventDefault();
      return;
    }
    const detected = detectEnginePrefix(val);
    if (detected && detected.query.trim()) {
      e.preventDefault();
      window.location.href = detected.engine.url(detected.query.trim());
      return;
    }
    if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(val) && !val.includes(" ")) {
      e.preventDefault();
      window.location.href = /^https?:\/\//i.test(val) ? val : `https://${val}`;
    }
  });

  // Drawer Open / Close & Tabs
  const drawer = document.getElementById("studio-drawer");
  document.getElementById("btn-open-drawer").addEventListener("click", () => {
    document.getElementById("drawer-body").scrollTop = 0;
    drawer.classList.remove("hidden");
  });
  document.getElementById("btn-close-drawer").addEventListener("click", () => drawer.classList.add("hidden"));
  drawer.addEventListener("click", e => {
    if (e.target === drawer) drawer.classList.add("hidden");
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.remove("hidden");
      document.getElementById("drawer-body").scrollTop = 0;
    });
  });

  // Stage Filter Selectors (Category / Favorites & Author)
  document.getElementById("filter-category-select").addEventListener("change", async e => {
    state.settings.filterCategory = e.target.value;
    state.shuffleQueue = [];
    await saveState(["settings", "shuffleQueue"]);
    updateFilterStatusUI();
    displayNextQuote(true);
  });

  document.getElementById("filter-author-select").addEventListener("change", async e => {
    state.settings.filterAuthor = e.target.value;
    state.shuffleQueue = [];
    await saveState(["settings", "shuffleQueue"]);
    updateFilterStatusUI();
    displayNextQuote(true);
  });

  // Add Single Quote
  document.getElementById("add-quote-form").addEventListener("submit", async e => {
    e.preventDefault();
    const text = document.getElementById("new-quote-text").value.trim();
    const author = document.getElementById("new-quote-author").value.trim() || "Unknown";
    const category = document.getElementById("new-quote-category").value.trim().toLowerCase();
    if (!text) return;

    const newQuote = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text,
      author,
      tag: "collected",
      category,
      favorite: false
    };
    state.quotes.unshift(newQuote);
    state.shuffleQueue.unshift(newQuote.id);
    await saveState(["quotes", "shuffleQueue"]);

    e.target.reset();
    renderSavedQuotesList();
    populateFilterOptions();
    renderBilingualQuote(newQuote);
    showToast("Quote added");
  });

  // Delete Quote
  document.getElementById("saved-quotes-list").addEventListener("click", async e => {
    const id = e.target.dataset.delQuote;
    if (!id) return;
    state.quotes = state.quotes.filter(q => q.id !== id);
    await saveState(["quotes"]);
    renderSavedQuotesList(document.getElementById("search-quotes-input").value);
    populateFilterOptions();
    showToast("Quote removed");
  });

  document.getElementById("search-quotes-input").addEventListener("input", e => {
    renderSavedQuotesList(e.target.value);
  });

  // Bulk Paste & File / Full Backup Import
  const showBulkPreview = parsedResult => {
    const box = document.getElementById("bulk-preview-box");
    const list = document.getElementById("bulk-preview-list");

    if (parsedResult.type === "full-backup") {
      state.pendingFullBackup = parsedResult;
      state.pendingBulk = [];
      document.getElementById("bulk-preview-count").textContent = `Full Backup: ${parsedResult.quotes.length} quotes + settings`;
      list.innerHTML = parsedResult.quotes.slice(0, 6).map(i => `<li class="quote-item-meta">“${escapeHtml(i.text.slice(0, 60))}…” — ${escapeHtml(i.author)}</li>`).join("");
      box.classList.remove("hidden");
    } else if (parsedResult.type === "quotes" && parsedResult.items.length > 0) {
      state.pendingFullBackup = null;
      state.pendingBulk = parsedResult.items;
      document.getElementById("bulk-preview-count").textContent = `${parsedResult.items.length} quotes ready`;
      list.innerHTML = parsedResult.items.slice(0, 8).map(i => `<li class="quote-item-meta">“${escapeHtml(i.text.slice(0, 65))}…” — ${escapeHtml(i.author)}</li>`).join("");
      box.classList.remove("hidden");
    } else {
      box.classList.add("hidden");
    }
  };

  document.getElementById("btn-parse-bulk").addEventListener("click", () => {
    const raw = document.getElementById("bulk-paste-input").value;
    const res = parseImportPayload(raw);
    if (res.type === "empty" || (res.items && res.items.length === 0)) return showToast("No valid lines found");
    showBulkPreview(res);
  });

  document.getElementById("import-file-input").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const res = parseImportPayload(text, file.name.toLowerCase());
    if (res.type === "empty" || (res.items && res.items.length === 0)) return showToast("No quotes parsed from file");
    showBulkPreview(res);
  });

  document.getElementById("btn-confirm-bulk").addEventListener("click", async () => {
    if (state.pendingFullBackup) {
      const backup = state.pendingFullBackup;
      state.quotes = backup.quotes;
      if (backup.settings) {
        state.settings = { ...DEFAULT_SETTINGS, ...backup.settings };
      }
      state.shuffleQueue = [];
      state.pendingFullBackup = null;
      await saveState(["quotes", "settings", "shuffleQueue"]);

      document.getElementById("bulk-preview-box").classList.add("hidden");
      applySettingsToUI();
      populateFilterOptions();
      await renderShortcutTiles();
      await initBookmarksStrip();
      displayNextQuote(false);
      showToast(`Restored full backup (${backup.quotes.length} quotes)`);
      return;
    }

    if (!state.pendingBulk.length) return;
    const stamped = state.pendingBulk.map((item, idx) => ({
      id: (Date.now() + idx).toString(36) + Math.random().toString(36).slice(2, 5),
      ...item
    }));
    state.quotes.unshift(...stamped);
    state.shuffleQueue = [];
    await saveState(["quotes", "shuffleQueue"]);

    state.pendingBulk = [];
    document.getElementById("bulk-paste-input").value = "";
    document.getElementById("bulk-preview-box").classList.add("hidden");
    renderSavedQuotesList();
    populateFilterOptions();
    displayNextQuote(true);
    showToast(`Imported ${stamped.length} quotes`);
  });

  // Full Backup Export, Quotes-Only Export & Clear
  document.getElementById("btn-export-full").addEventListener("click", () => {
    const fullSnapshot = {
      app: "Quieter",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      quotes: state.quotes,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(fullSnapshot, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quieter-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Exported full profile + quotes backup");
  });

  document.getElementById("btn-export-json").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.quotes, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quieter-quotes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast("Exported quotes JSON");
  });

  document.getElementById("btn-clear-quotes").addEventListener("click", async () => {
    if (!confirm("Delete all saved quotes? Export a backup first if needed.")) return;
    state.quotes = [];
    state.shuffleQueue = [];
    state.historyStack = [];
    await saveState(["quotes", "shuffleQueue"]);
    renderSavedQuotesList();
    populateFilterOptions();
    displayNextQuote(false);
    showToast("Collection cleared");
  });

  // Typography Font Pickers
  const fontBindings = [
    ["font-en-quote", "fontEnQuote", true],
    ["font-en-author", "fontEnAuthor", true],
    ["font-bn-quote", "fontBnQuote", true],
    ["font-bn-author", "fontBnAuthor", true],
    ["font-monogram", "fontMonogram", false],
    ["font-ui", "fontUI", false]
  ];
  for (const [id, key, isQuoteFont] of fontBindings) {
    document.getElementById(id).addEventListener("change", async e => {
      state.settings[key] = e.target.value;
      await saveState(["settings"]);
      if (isQuoteFont) {
        if (state.currentQuote) renderBilingualQuote(state.currentQuote);
      } else {
        document.documentElement.style.setProperty("--monogram-font", state.settings.fontMonogram);
        document.documentElement.style.setProperty("--ui-font", state.settings.fontUI);
      }
    });
  }

  // Quote Size & Line-Spacing Sliders
  document.getElementById("slider-quote-scale").addEventListener("input", async e => {
    state.settings.quoteScale = Number(e.target.value);
    document.getElementById("quote-scale-val").textContent = e.target.value;
    document.documentElement.style.setProperty("--quote-scale", (state.settings.quoteScale / 100).toFixed(2));
    await saveState(["settings"]);
  });

  document.getElementById("slider-quote-lh").addEventListener("input", async e => {
    state.settings.quoteLineHeight = Number(e.target.value);
    document.getElementById("quote-lh-val").textContent = Number(e.target.value).toFixed(2);
    document.documentElement.style.setProperty("--quote-lh", String(state.settings.quoteLineHeight));
    await saveState(["settings"]);
  });

  document.getElementById("btn-scan-pc-fonts").addEventListener("click", async () => {
    if (!window.queryLocalFonts) {
      return showToast("Browser blocked font scan — type the font name manually below");
    }
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map(f => f.family))].sort();
      state.settings.customFonts = [...new Set([...state.settings.customFonts, ...families])];
      await saveState(["settings"]);
      populateFontSelectors();
      showToast(`Loaded ${families.length} local PC fonts`);
    } catch {
      showToast("Permission denied — enter font name manually");
    }
  });

  document.getElementById("btn-add-custom-font").addEventListener("click", async () => {
    const name = document.getElementById("custom-font-name").value.trim();
    if (!name) return;
    if (!state.settings.customFonts.includes(name)) {
      state.settings.customFonts.push(name);
      await saveState(["settings"]);
      populateFontSelectors();
    }
    document.getElementById("custom-font-name").value = "";
    showToast(`Added "${name}" to font pickers`);
  });

  // Atmosphere, Accent Color & Glass Opacity Controls
  document.getElementById("toggle-idle-hide").addEventListener("change", async e => {
    state.settings.idleAutoHide = e.target.checked;
    document.getElementById("idle-delay-wrap").classList.toggle("hidden", !e.target.checked);
    await saveState(["settings"]);
    setupIdleAutoHide();
  });

  document.getElementById("slider-idle-delay").addEventListener("input", async e => {
    state.settings.idleDelaySec = Number(e.target.value);
    document.getElementById("idle-delay-val").textContent = e.target.value;
    await saveState(["settings"]);
    setupIdleAutoHide();
  });

  document.getElementById("toggle-breathing-glow").addEventListener("change", async e => {
    state.settings.breathingGlow = e.target.checked;
    document.body.classList.toggle("breathing-glow", e.target.checked);
    await saveState(["settings"]);
  });

  document.getElementById("accent-swatches").addEventListener("click", async e => {
    const color = e.target.dataset.accent;
    if (!color) return;
    state.settings.accentColor = color;
    await saveState(["settings"]);
    applySettingsToUI();
  });

  document.getElementById("input-custom-accent").addEventListener("input", async e => {
    state.settings.accentColor = e.target.value;
    document.documentElement.style.setProperty("--accent", e.target.value);
    document.querySelectorAll(".accent-dot").forEach(b => b.classList.remove("active"));
    await saveState(["settings"]);
  });

  document.getElementById("slider-glass-alpha").addEventListener("input", async e => {
    state.settings.glassAlpha = Number(e.target.value);
    document.getElementById("glass-alpha-val").textContent = e.target.value;
    document.documentElement.style.setProperty("--glass-alpha", (state.settings.glassAlpha / 100).toFixed(2));
    await saveState(["settings"]);
  });

  // Identity & Bookmarks Strip Controls
  document.getElementById("input-monogram").addEventListener("input", async e => {
    state.settings.monogram = e.target.value;
    document.getElementById("monogram-display").textContent = e.target.value || "@siammehraf";
    await saveState(["settings"]);
  });

  document.getElementById("toggle-24h").addEventListener("change", async e => {
    state.settings.use24h = e.target.checked;
    await saveState(["settings"]);
  });

  document.getElementById("toggle-show-category").addEventListener("change", async e => {
    state.settings.showCategory = e.target.checked;
    await saveState(["settings"]);
    if (state.currentQuote) renderBilingualQuote(state.currentQuote);
  });

  document.getElementById("toggle-bookmarks-bar").addEventListener("change", async e => {
    state.settings.bookmarksBarEnabled = e.target.checked;
    document.getElementById("bookmarks-folder-wrap").classList.toggle("hidden", !e.target.checked);
    await saveState(["settings"]);
    await renderBookmarksStrip();
  });

  document.getElementById("select-bookmarks-folder").addEventListener("change", async e => {
    state.settings.bookmarksFolderId = e.target.value;
    await saveState(["settings"]);
    await renderBookmarksStrip();
  });

  document.getElementById("gradient-swatches").addEventListener("click", async e => {
    const grad = e.target.dataset.grad;
    if (!grad) return;
    state.settings.gradient = grad;
    await saveState(["settings"]);
    applySettingsToUI();
  });

  document.getElementById("bg-photo-input").addEventListener("change", async e => {
    const file = e.target.files[0];
    if (!file) return;
    const compressed = await compressUploadedImage(file);
    state.settings.bgPhotoDataUrl = compressed;
    await saveState(["settings"]);
    applyBackgroundPhoto();
    showToast("Background photo updated");
  });

  document.getElementById("btn-remove-photo").addEventListener("click", async () => {
    state.settings.bgPhotoDataUrl = "";
    state.settings.onlinePhotoEnabled = false;
    document.getElementById("toggle-online-photo").checked = false;
    await saveState(["settings"]);
    applyBackgroundPhoto();
    showToast("Background photo cleared");
  });

  document.getElementById("toggle-online-photo").addEventListener("change", async e => {
    state.settings.onlinePhotoEnabled = e.target.checked;
    await saveState(["settings"]);
    applyBackgroundPhoto();
  });

  document.getElementById("slider-dim").addEventListener("input", async e => {
    state.settings.bgDim = Number(e.target.value);
    document.getElementById("dim-val").textContent = e.target.value;
    document.documentElement.style.setProperty("--dim-opacity", (state.settings.bgDim / 100).toFixed(2));
    await saveState(["settings"]);
  });

  document.getElementById("slider-blur").addEventListener("input", async e => {
    state.settings.bgBlur = Number(e.target.value);
    document.getElementById("blur-val").textContent = e.target.value;
    document.documentElement.style.setProperty("--bg-blur", `${state.settings.bgBlur}px`);
    await saveState(["settings"]);
  });

  // Pinned Sites Modal
  const siteModal = document.getElementById("site-modal");
  document.getElementById("btn-open-site-modal-drawer").addEventListener("click", () => openSiteModal());
  document.getElementById("btn-close-site-modal").addEventListener("click", () => siteModal.classList.add("hidden"));

  document.getElementById("site-form").addEventListener("submit", async e => {
    e.preventDefault();
    const title = document.getElementById("site-title-input").value.trim();
    const url = normalizeUrl(document.getElementById("site-url-input").value);
    if (!title || !url) return;

    if (state.editingPinnedIndex !== null && state.editingPinnedIndex >= 0) {
      state.settings.pinnedSites[state.editingPinnedIndex] = { title, url };
      showToast("Shortcut updated");
    } else {
      state.settings.pinnedSites.push({ title, url });
      state.settings.pinnedSites = state.settings.pinnedSites.slice(0, 8);
      showToast("Favourite shortcut added");
    }
    state.editingPinnedIndex = null;
    await saveState(["settings"]);

    e.target.reset();
    siteModal.classList.add("hidden");
    renderPinnedSitesList();
    await renderShortcutTiles();
  });

  document.getElementById("pinned-sites-list").addEventListener("click", async e => {
    const idx = e.target.dataset.delSite;
    if (idx === undefined) return;
    state.settings.pinnedSites.splice(Number(idx), 1);
    await saveState(["settings"]);
    renderPinnedSitesList();
    await renderShortcutTiles();
    showToast("Shortcut removed");
  });
}
