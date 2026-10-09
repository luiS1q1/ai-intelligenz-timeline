"use strict";
const COMP = Object.fromEntries(COMPANIES.map(c => [c[0], {id:c[0], name:c[1], color:c[2]}]));
MODELS.forEach((m, i) => { m.ts = new Date(m.d + "T12:00:00Z").getTime(); m.i = i; });
const T0 = new Date("2020-01-01T00:00:00Z").getTime();
const T1 = Date.now() + 20 * 86400000;
const TIER_NAMES = {1:"Meilenstein", 2:"Großes Release", 3:"Nennenswert", 4:"Punkt-Release", 5:"Klein-Release"};
const DAY = 86400000;

const canvas = document.getElementById("tl");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const detailcard = document.getElementById("detailcard");
const detailbody = document.getElementById("detailbody");
let W = 0, H = 0, dpr = 1;
let view0 = T0, view1 = T1;                 // visible time window
let target = {v0: view0, v1: view1};        // animation target
let tierMode = 0;                            // 0 = auto, 1..5 manual
let enabled = new Set(COMPANIES.map(c => c[0]));
let hoverM = null, pinnedM = null, loadProgress = 0, loadStart = performance.now();

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function autoTier() {
  const spanDays = (view1 - view0) / DAY;
  if (spanDays > 1100) return 1;
  if (spanDays > 500) return 2;
  if (spanDays > 230) return 3;
  if (spanDays > 85) return 4;
  return 5;
}
function maxTier() { return tierMode === 0 ? autoTier() : tierMode; }

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  W = r.width; H = r.height;
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

// ---- layout geometry
const PADL = 54, PADR = 24, PADT = 48, PADB = 46;
const MAXSCORE = 62;
function plotRect() { return {x: PADL, y: PADT, w: W - PADL - PADR, h: H - PADT - PADB}; }
function tsToX(ts) {
  const p = plotRect();
  return p.x + (ts - view0) / (view1 - view0) * p.w;
}
function xToTs(x) {
  const p = plotRect();
  return view0 + (x - p.x) / p.w * (view1 - view0);
}

// ---- visible set
function visibleModels() {
  const mt = maxTier();
  return MODELS.filter(m => m.t <= mt && enabled.has(m.c) && m.ts >= view0 - DAY*2 && m.ts <= view1 + DAY*2);
}

// ---- draw
function draw(now) {
  loadProgress = clamp((now - loadStart) / 900, 0, 1);
  const ease = 1 - Math.pow(1 - loadProgress, 3);
  // smooth window lerp
  view0 += (target.v0 - view0) * 0.22;
  view1 += (target.v1 - view1) * 0.22;
  if (Math.abs(target.v0 - view0) < 500 && Math.abs(target.v1 - view1) < 500) { view0 = target.v0; view1 = target.v1; }

  ctx.clearRect(0, 0, W, H);
  const p = plotRect();
  const baseline = p.y + p.h;

  // horizontal score gridlines
  ctx.font = "10px 'JetBrains Mono', monospace";
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let s = 0; s <= 60; s += 10) {
    const y = baseline - s / MAXSCORE * p.h;
    ctx.strokeStyle = s === 0 ? "#2a3454" : "#151c2e";
    ctx.beginPath(); ctx.moveTo(p.x, y); ctx.lineTo(p.x + p.w, y); ctx.stroke();
    ctx.fillStyle = "#5a647c";
    ctx.fillText(s === 0 ? "0" : String(s), p.x - 9, y);
  }
  ctx.save();
  ctx.translate(14, baseline - p.h / 2); ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center"; ctx.fillStyle = "#5a647c";
  ctx.font = "600 10px Inter, sans-serif";
  ctx.fillText("INTELLIGENZ-INDEX", 0, 0);
  ctx.restore();

  // time gridlines + labels
  const spanDays = (view1 - view0) / DAY;
  const steps = [["year", 365], ["quarter", 91], ["month", 30], ["week", 7], ["day", 1]];
  let step = steps[0];
  for (const st of steps) { if (spanDays / st[1] <= 14) { step = st; break; } }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const fmt = step[0] === "year" ? {year: "numeric"} : step[0] === "quarter" || step[0] === "month" ? {month: "short", year: "2-digit"} : {day: "numeric", month: "short"};
  let d = new Date(view0);
  if (step[0] === "year") { d = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); }
  else if (step[0] === "quarter") { d = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)); }
  else if (step[0] === "month") { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); }
  else if (step[0] === "week") { d = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY); }
  else { d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  ctx.font = "600 10.5px Inter, sans-serif";
  while (d.getTime() <= view1) {
    const x = tsToX(d.getTime());
    if (x >= p.x - 40 && x <= p.x + p.w + 40) {
      ctx.strokeStyle = step[0] === "year" ? "#232c48" : "#121828";
      ctx.beginPath(); ctx.moveTo(x, p.y); ctx.lineTo(x, baseline); ctx.stroke();
      ctx.fillStyle = step[0] === "year" ? "#7d87a0" : "#4d5568";
      let label;
      if (step[0] === "year") label = String(d.getUTCFullYear());
      else if (step[0] === "quarter") label = ["Q1","Q2","Q3","Q4"][Math.floor(d.getUTCMonth()/3)] + " " + String(d.getUTCFullYear()).slice(2);
      else label = d.toLocaleDateString("de-DE", fmt);
      ctx.fillText(label, x, baseline + 9);
    }
    if (step[0] === "year") d = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
    else if (step[0] === "quarter") d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
    else if (step[0] === "month") d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    else if (step[0] === "week") d = new Date(d.getTime() + 7 * DAY);
    else d = new Date(d.getTime() + DAY);
  }

  // "today" marker
  const nowX = tsToX(Date.now());
  if (nowX >= p.x && nowX <= p.x + p.w) {
    ctx.strokeStyle = "#e0555566"; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(nowX, p.y); ctx.lineTo(nowX, baseline); ctx.stroke();
    ctx.setLineDash([]);
  }

  // bars
  const vis = visibleModels().slice().sort((a, b) => a.ts - b.ts);
  const bw = clamp(Math.max(2, Math.min(16, p.w / Math.max(vis.length, 1) * 0.32)), 2, 16);
  const showLabels = vis.length <= 40 && bw >= 3.5;

  // greedy label placement: try offsets above the bar, skip labels that would collide
  vis.forEach(m => { m.labelDy = 0; m.labelText = m.n; });
  if (showLabels) {
    ctx.font = "600 10px Inter, sans-serif";
    const occupied = [];
    for (const m of vis) {
      let text = m.n;
      if (ctx.measureText(text).width > 130) {
        while (text.length > 4 && ctx.measureText(text + "\u2026").width > 130) text = text.slice(0, -1);
        text += "\u2026";
      }
      const tw = ctx.measureText(text).width;
      const x = tsToX(m.ts);
      const barTop = baseline - m.s / MAXSCORE * p.h * ease;
      let placed = false;
      for (const dy of [0, -14, -28]) {
        const rect = {x0: x - tw / 2 - 3, x1: x + tw / 2 + 3, y0: barTop - 8 + dy - 11, y1: barTop - 8 + dy};
        if (!occupied.some(o => rect.x0 < o.x1 && rect.x1 > o.x0 && rect.y0 < o.y1 && rect.y1 > o.y0)) {
          m.labelDy = dy; m.labelText = text; placed = true;
          occupied.push(rect);
          break;
        }
      }
      if (!placed) m.labelText = null;
    }
  }

  for (const m of vis) {
    const x = tsToX(m.ts);
    const col = COMP[m.c].color;
    const h = m.s / MAXSCORE * p.h * ease;
    if (h < 1) continue;
    const y = baseline - h;
    const hovered = m === hoverM || m === pinnedM;
    ctx.globalAlpha = m.est ? 0.88 : 1;

    // glow for milestones / hover
    if (m.t === 1 || hovered) {
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = hovered ? 18 : 9;
      ctx.fillStyle = col;
      ctx.fillRect(x - bw / 2, y, bw, h);
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(0, y, 0, baseline);
      g.addColorStop(0, col); g.addColorStop(1, col + "33");
      ctx.fillStyle = g;
      ctx.fillRect(x - bw / 2, y, bw, h);
    }
    if (m.est) { // dashed outline marks estimates
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = m.t === 1 || hovered ? col : "#ffffff2e";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - bw / 2 + 0.5, y + 0.5, bw - 1, h - 1);
      ctx.setLineDash([]);
    }
    if (hovered) {
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      ctx.strokeRect(x - bw / 2 - 1.5, y - 1.5, bw + 3, h + 1.5);
    }
    // milestone dot
    if (m.t === 1) {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(x, y - 7, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    // label
    if (showLabels && m.labelText) {
      ctx.font = (m.t === 1 ? "700" : "500") + " 10px Inter, sans-serif";
      ctx.fillStyle = m.t === 1 ? "#e8ecf4" : "#96a0b8";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const ly = baseline - m.s / MAXSCORE * p.h * ease - 8 + m.labelDy;
      ctx.fillText(m.labelText, x, ly);
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(draw);
}

function modelAt(mx, my) {
  const p = plotRect();
  if (my < p.y - 14 || my > p.y + p.h) return null;
  let best = null, bestD = 16;
  for (const m of visibleModels()) {
    const x = tsToX(m.ts);
    const d = Math.abs(x - mx);
    const yBar = p.y + p.h - m.s / MAXSCORE * p.h;
    if (d < bestD && my > yBar - 12) { bestD = d; best = m; }
  }
  return best;
}
// ---- interaction
let dragging = false, dragX = 0, dragV0 = 0, dragV1 = 0, moved = false;
canvas.addEventListener("mousedown", e => {
  dragging = true; moved = false; dragX = e.clientX; dragV0 = target.v0; dragV1 = target.v1;
  canvas.classList.add("dragging");
});
window.addEventListener("mouseup", () => { dragging = false; canvas.classList.remove("dragging"); });
canvas.addEventListener("mousemove", e => {
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  if (dragging) {
    const dx = e.clientX - dragX;
    if (Math.abs(dx) > 3) moved = true;
    const dts = dx / plotRect().w * (dragV1 - dragV0);
    setView(dragV0 - dts, dragV1 - dts);
    tooltip.style.display = "none"; hoverM = null;
    return;
  }
  const p = plotRect();
  hoverM = modelAt(mx, my);
  if (best) {
    const col = COMP[best.c];
    tooltip.innerHTML = `<div class="tn">${best.n}</div><div class="tc" style="color:${col.color}">${col.name}</div>` +
      `<div class="ts">Index: <b>${best.s}</b> &middot; ${new Date(best.ts).toLocaleDateString("de-DE", {day:"numeric", month:"long", year:"numeric"})}</div>` +
      (best.est ? `<div class="te">≈ kalibrierte Schätzung</div>` : `<div class="te" style="color:#34d399">AA-gemessen</div>`);
    tooltip.style.display = "block";
    const tw = 250;
    tooltip.style.left = clamp(mx + 16, 8, W - tw - 8) + "px";
    tooltip.style.top = clamp(my - 20, 8, H - 120) + "px";
    canvas.style.cursor = "pointer";
  } else {
    tooltip.style.display = "none";
    canvas.style.cursor = "grab";
  }
});
canvas.addEventListener("mouseleave", () => { tooltip.style.display = "none"; hoverM = null; });
canvas.addEventListener("click", e => {
  if (moved) return;
  const r = canvas.getBoundingClientRect();
  const m = modelAt(e.clientX - r.left, e.clientY - r.top);
  if (m) { pinnedM = m; showDetail(m); }
  else { pinnedM = null; detailcard.classList.remove("open"); }
});
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const mx = e.clientX - r.left;
  const tsAt = xToTs(mx);
  const f = Math.exp(e.deltaY * 0.0016);
  zoomAround(tsAt, f);
}, {passive: false});

function zoomAround(ts, f) {
  const span = (view1 - view0) * f;
  const minSpan = 10 * DAY, maxSpan = (T1 - T0) * 1.02;
  const s = clamp(span, minSpan, maxSpan);
  const frac = (ts - view0) / (view1 - view0);
  let v0 = ts - frac * s, v1 = v0 + s;
  if (v0 < T0 - 30*DAY) { v0 = T0 - 30*DAY; v1 = v0 + s; }
  if (v1 > T1 + 30*DAY) { v1 = T1 + 30*DAY; v0 = v1 - s; }
  setView(v0, v1);
}
function setView(v0, v1) {
  const s = clamp(v1 - v0, 10 * DAY, (T1 - T0) * 1.02);
  v0 = clamp(v0, T0 - 30*DAY, T1 - s + 30*DAY);
  target = {v0, v1: v0 + s};
}
// touch pinch
let touches = {};
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    touches = {d, span: view1 - view0, mid: (e.touches[0].clientX + e.touches[1].clientX) / 2};
  }
}, {passive: true});
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2 && touches.d) {
    e.preventDefault();
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const r = canvas.getBoundingClientRect();
    const tsAt = xToTs(touches.mid - r.left);
    zoomAround(tsAt, touches.d / Math.max(d, 1));
  }
}, {passive: false});
canvas.addEventListener("touchend", () => { touches = {}; });

// buttons
document.getElementById("zin").onclick = () => zoomAround((view0 + view1) / 2, 0.6);
document.getElementById("zout").onclick = () => zoomAround((view0 + view1) / 2, 1 / 0.6);
document.getElementById("zfit").onclick = () => setView(T0, T1);
document.getElementById("znow").onclick = () => { const s = 180 * DAY; setView(Date.now() - s, Date.now() + 10 * DAY); };
window.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (e.key === "+" || e.key === "=") zoomAround((view0 + view1) / 2, 0.6);
  if (e.key === "-") zoomAround((view0 + view1) / 2, 1 / 0.6);
  if (e.key === "0") setView(T0, T1);
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const s = view1 - view0, dts = s * 0.2 * (e.key === "ArrowRight" ? 1 : -1);
    setView(view0 + dts, view1 + dts);
  }
});

// detail slider
const slider = document.getElementById("tierslider");
const tierval = document.getElementById("tierval");
slider.addEventListener("input", () => {
  tierMode = parseInt(slider.value, 10);
  tierval.textContent = tierMode === 0 ? "Auto (Zoom)" : TIER_NAMES[tierMode];
});

// detail card
function showDetail(m) {
  const col = COMP[m.c];
  detailbody.innerHTML =
    `<div class="dc-comp" style="color:${col.color}">${col.name}</div>` +
    `<div class="dc-name">${m.n}</div>` +
    `<div class="dc-date">${new Date(m.ts).toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"long", year:"numeric"})}</div>` +
    `<div class="dc-score" style="color:${col.color}">${m.s}</div>` +
    `<div class="dc-src">Intelligenz-Index &middot; <span class="${m.est ? "est" : "aa"}">${m.est ? "≈ kalibrierte Schätzung von Fo" : "von Artificial Analysis gemessen"}</span></div>` +
    (m.note ? `<div class="dc-note">${m.note}</div>` : "") +
    `<div class="dc-tier">${TIER_NAMES[m.t]}</div>`;
  detailcard.classList.add("open");
}
document.getElementById("closecard").onclick = () => { detailcard.classList.remove("open"); pinnedM = null; };

// company chips
const chipbar = document.getElementById("chipbar");
COMPANIES.forEach(([id, name, color]) => {
  const count = MODELS.filter(m => m.c === id).length;
  const chip = document.createElement("div");
  chip.className = "chip"; chip.style.setProperty("--c", color);
  chip.innerHTML = `<span class="dot"></span>${name}<span style="opacity:.5;font-weight:500">${count}</span>`;
  chip.onclick = () => {
    if (enabled.has(id) && enabled.size === 1) return; // keep at least one
    enabled.has(id) ? enabled.delete(id) : enabled.add(id);
    chip.classList.toggle("off");
  };
  chipbar.appendChild(chip);
});

// stats
(function stats() {
  const best = MODELS.reduce((a, b) => (b.s > a.s ? b : a));
  const el = document.getElementById("stats");
  el.innerHTML =
    `<div class="stat"><b>${MODELS.length}</b> Releases</div>` +
    `<div class="stat">Zeitraum <b>2020&ndash;heute</b></div>` +
    `<div class="stat">Bestwert <b>${best.n} &middot; ${best.s}</b></div>`;
})();

// search
const searchEl = document.getElementById("search");
const resultsEl = document.getElementById("searchresults");
let selIdx = -1, currentResults = [];
function renderResults() {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) { resultsEl.style.display = "none"; currentResults = []; return; }
  currentResults = MODELS.filter(m => m.n.toLowerCase().includes(q) || COMP[m.c].name.toLowerCase().includes(q)).slice(0, 8);
  selIdx = currentResults.length ? 0 : -1;
  resultsEl.innerHTML = currentResults.map((m, i) =>
    `<div class="sr ${i === selIdx ? "sel" : ""}" data-i="${i}"><span>${m.n}</span><span class="d">${COMP[m.c].name} &middot; ${m.d}</span></div>`).join("");
  resultsEl.style.display = currentResults.length ? "block" : "none";
  resultsEl.querySelectorAll(".sr").forEach(el => el.onclick = () => pickResult(parseInt(el.dataset.i, 10)));
}
function pickResult(i) {
  const m = currentResults[i];
  if (!m) return;
  const s = 150 * DAY;
  setView(m.ts - s * 0.7, m.ts + s * 0.3);
  pinnedM = m; showDetail(m);
  resultsEl.style.display = "none";
  searchEl.value = "";
}
searchEl.addEventListener("input", renderResults);
searchEl.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { selIdx = Math.min(selIdx + 1, currentResults.length - 1); }
  else if (e.key === "ArrowUp") { selIdx = Math.max(selIdx - 1, 0); }
  else if (e.key === "Enter") { pickResult(selIdx); return; }
  else if (e.key === "Escape") { resultsEl.style.display = "none"; searchEl.blur(); }
  else return;
  e.preventDefault();
  resultsEl.querySelectorAll(".sr").forEach((el, i) => el.classList.toggle("sel", i === selIdx));
});
document.addEventListener("click", e => { if (!e.target.closest(".searchwrap")) resultsEl.style.display = "none"; });

resize();
requestAnimationFrame(draw);
