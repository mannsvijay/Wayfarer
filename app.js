"use strict";

/* =========================================================
   Settings
   ========================================================= */
const CONFIG = {
  // Optional: add your email to raise MyMemory's free limit
  // from ~5,000 to ~50,000 characters per day.
  MYMEMORY_EMAIL: "",
  RATE_CACHE_HOURS: 6,
  DEFAULT_FROM: "USD",
  DEFAULT_TO: "INR",
};

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("wayfarer:" + key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem("wayfarer:" + key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function spin(btn) {
  btn.classList.toggle("is-spun");
}

/* =========================================================
   Tabs
   ========================================================= */
const tabs = $$('[role="tab"]');
const TAB_NAMES = tabs.map((t) => t.dataset.tab);

function showTab(name, focus = false) {
  if (!TAB_NAMES.includes(name)) name = "translate";
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    $("#panel-" + t.dataset.tab).hidden = !on;
    if (on && focus) t.focus();
  });
  if (location.hash.slice(1) !== name) {
    try { history.replaceState(null, "", "#" + name); } catch { /* file:// in some browsers */ }
  }
  store.set("tab", name);
}

tabs.forEach((t, i) => {
  t.addEventListener("click", () => showTab(t.dataset.tab));
  t.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[n].dataset.tab, true);
  });
});
window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

/* =========================================================
   1. TRANSLATOR
   ========================================================= */
const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["bn", "Bengali"], ["ta", "Tamil"], ["te", "Telugu"],
  ["mr", "Marathi"], ["gu", "Gujarati"], ["pa", "Punjabi"], ["kn", "Kannada"], ["ml", "Malayalam"],
  ["ur", "Urdu"], ["ne", "Nepali"], ["or", "Odia"], ["as", "Assamese"], ["si", "Sinhala"],
  ["es", "Spanish"], ["fr", "French"], ["de", "German"], ["it", "Italian"], ["pt", "Portuguese"],
  ["nl", "Dutch"], ["ru", "Russian"], ["uk", "Ukrainian"], ["pl", "Polish"], ["tr", "Turkish"],
  ["ar", "Arabic"], ["fa", "Persian"], ["he", "Hebrew"], ["zh-CN", "Chinese (Simplified)"],
  ["zh-TW", "Chinese (Traditional)"], ["ja", "Japanese"], ["ko", "Korean"], ["th", "Thai"],
  ["vi", "Vietnamese"], ["id", "Indonesian"], ["ms", "Malay"], ["tl", "Filipino"], ["sw", "Swahili"],
  ["el", "Greek"], ["sv", "Swedish"], ["no", "Norwegian"], ["da", "Danish"], ["fi", "Finnish"],
  ["cs", "Czech"], ["hu", "Hungarian"], ["ro", "Romanian"], ["bg", "Bulgarian"], ["hr", "Croatian"],
  ["sr", "Serbian"], ["sk", "Slovak"], ["af", "Afrikaans"], ["am", "Amharic"],
].sort((a, b) => a[1].localeCompare(b[1]));

const AUTO = "Autodetect";
const srcLang = $("#srcLang");
const tgtLang = $("#tgtLang");
const srcText = $("#srcText");
const tgtText = $("#tgtText");
const transStatus = $("#transStatus");
const translateBtn = $("#translateBtn");

function langName(code) {
  if (!code) return "";
  if (code === AUTO) return "Detected language";
  const exact = LANGUAGES.find(([c]) => c.toLowerCase() === code.toLowerCase());
  if (exact) return exact[1];
  const base = code.split("-")[0].toLowerCase();
  const partial = LANGUAGES.find(([c]) => c.split("-")[0].toLowerCase() === base);
  return partial ? partial[1] : code;
}

function fillLanguageSelects() {
  const auto = new Option("Detect language", AUTO);
  srcLang.add(auto);
  for (const [code, name] of LANGUAGES) {
    srcLang.add(new Option(name, code));
    tgtLang.add(new Option(name, code));
  }
  srcLang.value = store.get("srcLang", "en");
  tgtLang.value = store.get("tgtLang", "hi");
  if (!srcLang.value) srcLang.value = "en";
  if (!tgtLang.value) tgtLang.value = "hi";
}

function decodeEntities(text) {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

// Split long lines into pieces under the API's 500-byte limit, at sentence or word breaks.
function chunkText(text, max = 450) {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) || [text];
  const chunks = [];
  let current = "";
  for (let s of sentences) {
    while (s.length > max) {
      let cut = s.lastIndexOf(" ", max);
      if (cut < max * 0.5) cut = max;
      if (current) { chunks.push(current); current = ""; }
      chunks.push(s.slice(0, cut));
      s = s.slice(cut);
    }
    if ((current + s).length > max) {
      if (current) chunks.push(current);
      current = s;
    } else {
      current += s;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks.map((c) => c.trim()).filter(Boolean);
}

async function translateChunk(q, from, to) {
  const params = new URLSearchParams({ q, langpair: `${from}|${to}` });
  if (CONFIG.MYMEMORY_EMAIL) params.set("de", CONFIG.MYMEMORY_EMAIL);
  let res;
  try {
    res = await fetch("https://api.mymemory.translated.net/get?" + params.toString());
  } catch {
    throw new Error("No connection. Check your internet and try again.");
  }
  if (res.status === 429) throw new Error("Daily free translation limit reached. Try again tomorrow.");
  if (!res.ok) throw new Error(`Translation service error (${res.status}). Try again shortly.`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText || "";
  if (/MYMEMORY WARNING/i.test(translated)) {
    throw new Error("Daily free translation limit reached. Try again tomorrow.");
  }
  if (Number(data.responseStatus) !== 200) {
    const detail = String(data.responseDetails || "").toLowerCase();
    if (detail.includes("invalid language") || detail.includes("language pair")) {
      throw new Error("This language pair isn’t supported. Pick a different language.");
    }
    if (detail.includes("same")) throw new Error("Choose two different languages.");
    throw new Error("Couldn’t translate this text. Try again or shorten it.");
  }
  const detected = data?.responseData?.detectedLanguage || data?.detectedLanguage || null;
  return { text: decodeEntities(translated), detected };
}

let translateSeq = 0;

async function translate() {
  const raw = srcText.value;
  if (!raw.trim()) {
    tgtText.textContent = "";
    setStatus("Type some text first.", true);
    srcText.focus();
    return;
  }
  const from = srcLang.value;
  const to = tgtLang.value;
  if (from === to) {
    tgtText.textContent = raw.trim();
    setStatus("Both languages are the same.");
    return;
  }

  const seq = ++translateSeq;
  translateBtn.disabled = true;
  translateBtn.textContent = "Translating…";
  tgtText.classList.add("is-loading");
  setStatus("Translating…");

  try {
    const lines = raw.split("\n");
    const out = [];
    let detected = null;
    for (const line of lines) {
      if (!line.trim()) { out.push(""); continue; }
      const pieces = chunkText(line);
      const translatedPieces = [];
      for (const piece of pieces) {
        const r = await translateChunk(piece, from, to);
        if (seq !== translateSeq) return; // a newer request replaced this one
        translatedPieces.push(r.text);
        if (r.detected) detected = r.detected;
      }
      out.push(translatedPieces.join(" "));
    }
    const result = out.join("\n").trim();
    tgtText.textContent = result;
    setStatus(from === AUTO && detected ? `Translated from ${langName(detected)}` : `Translated to ${langName(to)}`);
    addTranslationHistory({ from, to, input: raw.trim(), output: result });
  } catch (err) {
    if (seq !== translateSeq) return;
    tgtText.textContent = "";
    setStatus(err.message, true);
  } finally {
    if (seq === translateSeq) {
      translateBtn.disabled = false;
      translateBtn.textContent = "Translate";
      tgtText.classList.remove("is-loading");
    }
  }
}

function setStatus(text, isError = false) {
  transStatus.textContent = text;
  transStatus.classList.toggle("is-error", isError);
}

function speak(text, lang) {
  if (!text) { toast("Nothing to read aloud yet"); return; }
  if (!("speechSynthesis" in window)) { toast("Read-aloud isn’t supported in this browser"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  if (lang && lang !== AUTO) u.lang = lang;
  speechSynthesis.speak(u);
}

function updateCharCount() {
  $("#charCount").textContent = `${srcText.value.length} / 5000`;
}

/* --- translation history --- */
let transHistory = store.get("transHistory", []);

function addTranslationHistory(entry) {
  transHistory = transHistory.filter((h) => !(h.input === entry.input && h.to === entry.to));
  transHistory.unshift(entry);
  transHistory = transHistory.slice(0, 8);
  store.set("transHistory", transHistory);
  renderTranslationHistory();
}

function renderTranslationHistory() {
  const list = $("#transHistory");
  list.textContent = "";
  $("#transHistoryWrap").hidden = transHistory.length === 0;
  transHistory.forEach((h) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";
    btn.innerHTML = `<span class="h-langs"></span><span class="h-text"></span><span class="h-text h-out"></span>`;
    btn.querySelector(".h-langs").textContent = `${langName(h.from)} to ${langName(h.to)}`;
    btn.querySelectorAll(".h-text")[0].textContent = h.input;
    btn.querySelectorAll(".h-text")[1].textContent = h.output;
    btn.addEventListener("click", () => {
      srcLang.value = h.from;
      tgtLang.value = h.to;
      srcText.value = h.input;
      tgtText.textContent = h.output;
      updateCharCount();
      setStatus("Restored from history");
      srcText.focus();
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function initTranslator() {
  fillLanguageSelects();
  srcText.value = store.get("srcDraft", "");
  updateCharCount();
  renderTranslationHistory();

  translateBtn.addEventListener("click", translate);
  srcText.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); translate(); }
  });
  srcText.addEventListener("input", () => {
    updateCharCount();
    store.set("srcDraft", srcText.value);
  });

  const onLangChange = () => {
    store.set("srcLang", srcLang.value);
    store.set("tgtLang", tgtLang.value);
    if (srcText.value.trim() && tgtText.textContent) translate();
  };
  srcLang.addEventListener("change", onLangChange);
  tgtLang.addEventListener("change", onLangChange);

  $("#swapLang").addEventListener("click", (e) => {
    spin(e.currentTarget);
    const from = srcLang.value === AUTO ? "en" : srcLang.value;
    const to = tgtLang.value;
    srcLang.value = to;
    tgtLang.value = from;
    const out = tgtText.textContent;
    if (out) {
      tgtText.textContent = srcText.value;
      srcText.value = out;
      updateCharCount();
      store.set("srcDraft", srcText.value);
    }
    store.set("srcLang", srcLang.value);
    store.set("tgtLang", tgtLang.value);
    setStatus("");
  });

  $("#clearSrc").addEventListener("click", () => {
    srcText.value = "";
    tgtText.textContent = "";
    setStatus("");
    updateCharCount();
    store.set("srcDraft", "");
    srcText.focus();
  });
  $("#copyTgt").addEventListener("click", async () => {
    const ok = await copyText(tgtText.textContent);
    toast(ok ? "Translation copied" : "Nothing to copy yet");
  });
  $("#speakSrc").addEventListener("click", () => speak(srcText.value.trim(), srcLang.value));
  $("#speakTgt").addEventListener("click", () => speak(tgtText.textContent, tgtLang.value));
  $("#clearTransHistory").addEventListener("click", () => {
    transHistory = [];
    store.set("transHistory", transHistory);
    renderTranslationHistory();
    toast("History cleared");
  });
}

/* =========================================================
   2. CURRENCY CONVERTER
   ========================================================= */
// Approximate USD-based rates, used only when there is no internet and no saved rates.
const FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.78, INR: 86, JPY: 150, CNY: 7.2, AUD: 1.52, CAD: 1.37, CHF: 0.88,
  SGD: 1.34, AED: 3.6725, SAR: 3.75, QAR: 3.64, KWD: 0.307, OMR: 0.385, BHD: 0.376, HKD: 7.8,
  NZD: 1.65, ZAR: 18.2, BRL: 5.5, MXN: 18.5, RUB: 90, KRW: 1380, THB: 35, MYR: 4.5, IDR: 16000,
  PHP: 57, VND: 25400, PKR: 280, BDT: 120, LKR: 300, NPR: 137.6, TRY: 38, SEK: 10.5, NOK: 10.8,
  DKK: 6.9, PLN: 3.9, CZK: 23, HUF: 360, ILS: 3.7, EGP: 49, NGN: 1550, KES: 129,
};

const fromCur = $("#fromCur");
const toCur = $("#toCur");
const amountInput = $("#amount");
let rateData = null; // { rates, updated (ms), source, fetchedAt }

const currencyNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "currency" }); } catch { return null; }
})();

function currencyName(code) {
  try { return currencyNames ? currencyNames.of(code) : code; } catch { return code; }
}

function flag(code) {
  if (code === "EUR") return "🇪🇺";
  if (code.startsWith("X")) return "🏳️";
  const cc = code.slice(0, 2).toUpperCase();
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function fillCurrencySelects(codes) {
  const keepFrom = fromCur.value || store.get("fromCur", CONFIG.DEFAULT_FROM);
  const keepTo = toCur.value || store.get("toCur", CONFIG.DEFAULT_TO);
  const sorted = [...codes].sort();
  for (const sel of [fromCur, toCur]) {
    sel.textContent = "";
    for (const code of sorted) {
      sel.add(new Option(`${flag(code)}  ${code}, ${currencyName(code)}`, code));
    }
  }
  fromCur.value = codes.includes(keepFrom) ? keepFrom : "USD";
  toCur.value = codes.includes(keepTo) ? keepTo : (codes.includes("EUR") ? "EUR" : sorted[0]);
}

function fractionDigits(code) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}

function formatMoney(value, code) {
  const abs = Math.abs(value);
  let digits = fractionDigits(code);
  if (abs > 0 && abs < 1) digits = Math.max(digits, 4);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: code, currencyDisplay: "narrowSymbol",
      minimumFractionDigits: Math.min(digits, fractionDigits(code)),
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${code}`;
  }
}

function formatRate(value) {
  return Number(value.toPrecision(6)).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function parseAmount(text) {
  const cleaned = String(text).replace(/[,\s_]/g, "");
  if (cleaned === "") return NaN;
  // allow simple sums like "1500+250"
  try { return CalcEngine.evaluate(cleaned); } catch { return NaN; }
}

function convert() {
  const from = fromCur.value;
  const to = toCur.value;
  const amount = parseAmount(amountInput.value);
  store.set("fromCur", from);
  store.set("toCur", to);
  store.set("amount", amountInput.value);

  const resultFrom = $("#resultFrom");
  const resultMain = $("#resultMain");
  const rateLine = $("#rateLine");
  const rateLineInverse = $("#rateLineInverse");

  if (!rateData || !rateData.rates[from] || !rateData.rates[to]) {
    resultFrom.textContent = "";
    resultMain.textContent = "—";
    rateLine.textContent = "No rate available for this pair.";
    rateLineInverse.textContent = "";
    return;
  }
  const rate = rateData.rates[to] / rateData.rates[from];

  if (Number.isNaN(amount)) {
    resultFrom.textContent = "Enter an amount, like 250 or 1,500.";
    resultMain.textContent = "—";
  } else {
    resultFrom.textContent = `${formatMoney(amount, from)} ${from} equals`;
    resultMain.textContent = `${formatMoney(amount * rate, to)} ${to}`;
  }
  rateLine.textContent = `1 ${from} = ${formatRate(rate)} ${to}`;
  rateLineInverse.textContent = `1 ${to} = ${formatRate(1 / rate)} ${from}`;
  renderQuickTable(from, to, rate);
}

function renderQuickTable(from, to, rate) {
  $("#quickFromHead").textContent = from;
  $("#quickToHead").textContent = to;
  const body = $("#quickBody");
  body.textContent = "";
  const steps = [1, 5, 10, 25, 50, 100, 500, 1000, 5000, 10000];
  for (const n of steps) {
    const tr = document.createElement("tr");
    const a = document.createElement("td");
    const b = document.createElement("td");
    a.textContent = formatMoney(n, from);
    b.textContent = formatMoney(n * rate, to);
    tr.append(a, b);
    body.appendChild(tr);
  }
}

function setRateStatus(text) {
  $("#rateStatus").textContent = text;
}

function describeRates(data) {
  if (data.source === "offline") return "Offline: showing approximate built-in rates.";
  const when = data.updated ? new Date(data.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "recently";
  return `Rates updated ${when}`;
}

function applyRates(data) {
  rateData = data;
  fillCurrencySelects(Object.keys(data.rates));
  convert();
}

async function fetchJSON(url, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLiveRates() {
  // Primary: ExchangeRate-API open endpoint (no key, ~160 currencies)
  try {
    const d = await fetchJSON("https://open.er-api.com/v6/latest/USD");
    if (d.result === "success" && d.rates) {
      return { rates: d.rates, updated: d.time_last_update_unix * 1000, source: "ExchangeRate-API", fetchedAt: Date.now() };
    }
  } catch { /* try backup */ }
  // Backup: Frankfurter (European Central Bank data, ~30 currencies)
  const d = await fetchJSON("https://api.frankfurter.app/latest?from=USD");
  return { rates: { USD: 1, ...d.rates }, updated: Date.parse(d.date), source: "Frankfurter", fetchedAt: Date.now() };
}

async function loadRates(force = false) {
  const cached = store.get("rates", null);
  const fresh = cached && Date.now() - cached.fetchedAt < CONFIG.RATE_CACHE_HOURS * 3600 * 1000;

  applyRates(cached || { rates: FALLBACK_RATES, updated: null, source: "offline", fetchedAt: 0 });
  if (fresh && !force) { setRateStatus(describeRates(cached)); return; }

  setRateStatus("Updating rates…");
  $("#refreshRates").disabled = true;
  try {
    const live = await fetchLiveRates();
    store.set("rates", live);
    applyRates(live);
    setRateStatus(describeRates(live));
    if (force) toast("Rates refreshed");
  } catch {
    setRateStatus(cached ? `Couldn’t refresh. ${describeRates(cached)}` : "Offline: showing approximate built-in rates.");
    if (force) toast("Couldn’t reach the rate service");
  } finally {
    $("#refreshRates").disabled = false;
  }
}

function initCurrency() {
  amountInput.value = store.get("amount", "1");
  fromCur.value = store.get("fromCur", CONFIG.DEFAULT_FROM);
  toCur.value = store.get("toCur", CONFIG.DEFAULT_TO);
  amountInput.addEventListener("input", convert);
  fromCur.addEventListener("change", convert);
  toCur.addEventListener("change", convert);
  $("#swapCur").addEventListener("click", (e) => {
    spin(e.currentTarget);
    [fromCur.value, toCur.value] = [toCur.value, fromCur.value];
    convert();
  });
  $("#refreshRates").addEventListener("click", () => loadRates(true));
  loadRates();
}

/* =========================================================
   3. CALCULATOR
   ========================================================= */
const calc = {
  expr: "",
  lastResult: null,
  justEvaluated: false,
};
const OPS = "+-*/";
let calcHistory = store.get("calcHistory", []);

const pretty = (s) => s.replace(/\*/g, " × ").replace(/\//g, " ÷ ").replace(/\+/g, " + ").replace(/(?<=[\d)%])-/g, " − ").replace(/-/g, "−");

function currentNumber() {
  const m = calc.expr.match(/[0-9.]*$/);
  return m ? m[0] : "";
}

function openParens() {
  let n = 0;
  for (const c of calc.expr) { if (c === "(") n++; else if (c === ")") n--; }
  return n;
}

function pressKey(key) {
  const last = calc.expr.slice(-1);

  if (/^[0-9]$/.test(key)) {
    if (calc.justEvaluated) calc.expr = "";
    if (last === ")" || last === "%") calc.expr += "*";
    if (currentNumber() === "0") calc.expr = calc.expr.slice(0, -1);
    calc.expr += key;
  } else if (key === ".") {
    if (calc.justEvaluated) calc.expr = "";
    if (currentNumber().includes(".")) return;
    if (last === ")" || last === "%") calc.expr += "*";
    if (!/[0-9]$/.test(calc.expr)) calc.expr += "0";
    calc.expr += ".";
  } else if (OPS.includes(key)) {
    if (calc.justEvaluated && calc.lastResult !== null) calc.expr = String(calc.lastResult);
    if (calc.expr === "" || last === "(") {
      if (key === "-") calc.expr += "-";
      else if (calc.expr === "") calc.expr = "0" + key;
    } else if (OPS.includes(last)) {
      // replace the previous operator, but allow "×−" for negative numbers
      if (key === "-" && (last === "*" || last === "/")) calc.expr += "-";
      else calc.expr = calc.expr.replace(/[+\-*/]+$/, "") + key;
    } else if (last === ".") {
      calc.expr = calc.expr.slice(0, -1) + key;
    } else {
      calc.expr += key;
    }
  } else if (key === "%") {
    if (calc.justEvaluated && calc.lastResult !== null) calc.expr = String(calc.lastResult);
    if (/[0-9)]$/.test(calc.expr)) calc.expr += "%";
  } else if (key === "(") {
    if (calc.justEvaluated) calc.expr = "";
    if (/[0-9)%.]$/.test(calc.expr)) calc.expr += "*";
    calc.expr += "(";
  } else if (key === ")") {
    if (openParens() > 0 && /[0-9)%]$/.test(calc.expr)) calc.expr += ")";
  } else if (key === "Backspace") {
    if (calc.justEvaluated) { calc.justEvaluated = false; }
    calc.expr = calc.expr.slice(0, -1);
  } else if (key === "Escape") {
    calc.expr = "";
    calc.lastResult = null;
  } else if (key === "Enter" || key === "=") {
    equals();
    return;
  } else {
    return;
  }
  calc.justEvaluated = false;
  renderCalc();
}

function equals() {
  if (!calc.expr) return;
  const exprEl = $("#calcExpr");
  const resEl = $("#calcResult");
  try {
    const expr = calc.expr.replace(/[+\-*/.(]+$/, "");
    const value = CalcEngine.clean(CalcEngine.evaluate(expr));
    exprEl.textContent = pretty(expr) + " =";
    resEl.textContent = CalcEngine.format(value);
    resEl.className = "calc-result";
    addCalcHistory(pretty(expr), CalcEngine.format(value), value);
    calc.lastResult = value;
    calc.expr = String(value);
    calc.justEvaluated = true;
  } catch (err) {
    resEl.textContent = err.message;
    resEl.className = "calc-result is-error";
  }
}

function renderCalc() {
  const exprEl = $("#calcExpr");
  const resEl = $("#calcResult");
  exprEl.textContent = pretty(calc.expr);
  resEl.className = "calc-result";
  if (!calc.expr) { resEl.textContent = "0"; return; }
  // live preview while typing
  const trimmed = calc.expr.replace(/[+\-*/.(]+$/, "");
  try {
    const v = CalcEngine.evaluate(trimmed);
    resEl.textContent = CalcEngine.format(v);
    resEl.classList.add("is-preview");
  } catch {
    resEl.textContent = pretty(currentNumber() || "0");
    resEl.classList.add("is-preview");
  }
}

function addCalcHistory(expr, display, value) {
  calcHistory.unshift({ expr, display, value });
  calcHistory = calcHistory.slice(0, 12);
  store.set("calcHistory", calcHistory);
  renderCalcHistory();
}

function renderCalcHistory() {
  const list = $("#calcHistory");
  list.textContent = "";
  $("#calcHistoryWrap").hidden = calcHistory.length === 0;
  calcHistory.forEach((h) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item is-calc";
    btn.innerHTML = `<span class="h-text"></span>`;
    btn.firstChild.textContent = `${h.expr} = ${h.display}`;
    btn.title = "Use this result";
    btn.addEventListener("click", () => {
      calc.expr = String(h.value);
      calc.lastResult = h.value;
      calc.justEvaluated = true;
      $("#calcExpr").textContent = h.expr + " =";
      $("#calcResult").textContent = h.display;
      $("#calcResult").className = "calc-result";
    });
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function currentCalcValue() {
  if (calc.justEvaluated && calc.lastResult !== null) return calc.lastResult;
  try { return CalcEngine.clean(CalcEngine.evaluate(calc.expr.replace(/[+\-*/.(]+$/, ""))); } catch { return null; }
}

function flashKey(key) {
  const btn = $(`.k[data-key="${CSS.escape(key)}"]`);
  if (!btn) return;
  btn.classList.add("is-pressed");
  setTimeout(() => btn.classList.remove("is-pressed"), 110);
}

function initCalculator() {
  $$("[data-key]").forEach((btn) => btn.addEventListener("click", () => pressKey(btn.dataset.key)));

  document.addEventListener("keydown", (e) => {
    if ($("#panel-calculator").hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    let key = e.key;
    if (key === "x" || key === "X") key = "*";
    if (key === "=") key = "Enter";
    if (key === "Delete") key = "Escape";
    const allowed = /^[0-9]$/.test(key) || "+-*/%().".includes(key) || ["Enter", "Backspace", "Escape"].includes(key);
    if (!allowed || key.length === 0) return;
    const active = document.activeElement;
    if (key === "Enter" && active?.tagName === "BUTTON" && !active.dataset.key && $("#panel-calculator").contains(active)) return;
    e.preventDefault();
    flashKey(key);
    pressKey(key);
  });

  $("#calcCopy").addEventListener("click", async () => {
    const v = currentCalcValue();
    const ok = v !== null && await copyText(String(v));
    toast(ok ? "Result copied" : "Nothing to copy yet");
  });
  $("#calcToCurrency").addEventListener("click", () => {
    const v = currentCalcValue();
    if (v === null) { toast("Finish the calculation first"); return; }
    amountInput.value = String(v);
    showTab("currency");
    convert();
    amountInput.focus();
  });
  $("#clearCalcHistory").addEventListener("click", () => {
    calcHistory = [];
    store.set("calcHistory", calcHistory);
    renderCalcHistory();
    toast("History cleared");
  });

  renderCalc();
  renderCalcHistory();
}

/* =========================================================
   Start
   ========================================================= */
initTranslator();
initCurrency();
initCalculator();
showTab(location.hash.slice(1) || store.get("tab", "translate"));
