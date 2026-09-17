// ============================================================
// Funzioni di rendering — separate dalla logica applicativa (app.js)
// ============================================================

const DAY_LABELS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function showQuote() {
  document.getElementById("quote-text").textContent = getRandomQuote();
}

// Restituisce il lunedì (00:00 locale) della settimana della data data
function startOfWeek(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = lunedì
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function isSameDate(a, b) {
  return toDateStr(a) === toDateStr(b);
}

function dayPercent(day, logsByMeal) {
  if (!day.diet_meals || day.diet_meals.length === 0) return 0;
  const done = day.diet_meals.filter((m) => logsByMeal[m.id]?.completed).length;
  return Math.round((done / day.diet_meals.length) * 100);
}

/**
 * Renderizza la striscia dei 7 giorni.
 * weekLogs: array di meal_logs della settimana corrente (log_date compreso)
 */
function renderWeekStrip(diet, weekStart, weekLogs, selectedIndex) {
  const strip = document.getElementById("week-strip");
  strip.innerHTML = "";
  const today = new Date();

  for (let i = 0; i < 7; i++) {
    const day = diet.days.find((d) => d.day_index === i);
    const cellDate = new Date(weekStart);
    cellDate.setDate(cellDate.getDate() + i);
    const dateStr = toDateStr(cellDate);

    const logsByMeal = {};
    weekLogs
      .filter((l) => l.log_date === dateStr)
      .forEach((l) => (logsByMeal[l.diet_meal_id] = l));

    const pct = day ? dayPercent(day, logsByMeal) : 0;

    const btn = document.createElement("button");
    btn.className = "day-tab" + (i === selectedIndex ? " active" : "") + (isSameDate(cellDate, today) ? " today" : "");
    btn.style.setProperty("--pct", pct);
    btn.innerHTML = `
      <span class="dname">${DAY_LABELS_SHORT[i]}</span>
      <span class="dring"><span>${day ? pct + "%" : "–"}</span></span>
    `;
    btn.addEventListener("click", () => window.App.selectDay(i));
    strip.appendChild(btn);
  }
}

function renderDayDetail(day, dateStr, logsForDate, onToggle) {
  const wrap = document.getElementById("day-detail");
  if (!day || !day.diet_meals || day.diet_meals.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><h2>Nessun pasto per questo giorno</h2><p>Puoi aggiungerlo dalla schermata "Piano".</p></div>`;
    return;
  }

  const logsByMeal = {};
  logsForDate.forEach((l) => (logsByMeal[l.diet_meal_id] = l));

  wrap.innerHTML = `<h2>${day.day_label}</h2>` + day.diet_meals
    .map((m) => {
      const done = !!logsByMeal[m.id]?.completed;
      return `
        <div class="meal-row ${done ? "done" : ""}" data-meal-id="${m.id}">
          <button class="meal-check ${done ? "done" : ""}" aria-label="Segna come completato">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0f1b16" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>
          </button>
          <div class="meal-body">
            <div class="mtype">${m.meal_type}${m.meal_time ? `<span class="mtime">${m.meal_time}</span>` : ""}</div>
            <div class="mitems">${escapeHtml(m.items)}</div>
          </div>
        </div>
      `;
    })
    .join("");

  wrap.querySelectorAll(".meal-check").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".meal-row");
      const mealId = row.dataset.mealId;
      const willBeDone = !btn.classList.contains("done");
      onToggle(mealId, willBeDone);
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ------------------------------------------------------------
// Revisione piano interpretato dal PDF
// ------------------------------------------------------------
let reviewCounter = 0;

function renderReview(days) {
  const wrap = document.getElementById("review-days");
  wrap.innerHTML = "";
  days.forEach((day) => wrap.appendChild(buildReviewDayEl(day)));
}

function buildReviewDayEl(day) {
  const id = "d" + reviewCounter++;
  const el = document.createElement("div");
  el.className = "review-day";
  el.dataset.id = id;
  el.innerHTML = `
    <div class="review-day-head">
      <select class="day-index-select">
        ${window.DietParser.DAY_NAMES.map(
          (d) => `<option value="${d.index}" ${d.index === day.dayIndex ? "selected" : ""}>${d.label}</option>`
        ).join("")}
      </select>
      <button class="btn btn-ghost btn-sm remove-day" style="margin-left:auto;">Rimuovi giorno</button>
    </div>
    <div class="review-meals"></div>
    <button class="add-meal-btn" style="margin: 0 1.1rem 1rem;">+ aggiungi pasto</button>
  `;
  const mealsWrap = el.querySelector(".review-meals");
  day.meals.forEach((m) => mealsWrap.appendChild(buildReviewMealEl(m)));

  el.querySelector(".remove-day").addEventListener("click", () => el.remove());
  el.querySelector(".add-meal-btn").addEventListener("click", () => {
    mealsWrap.appendChild(buildReviewMealEl({ mealType: "Pasto", items: "" }));
  });

  return el;
}

function buildReviewMealEl(meal) {
  const el = document.createElement("div");
  el.className = "review-meal";
  el.innerHTML = `
    <input class="meal-type-input" type="text" value="${escapeAttr(meal.mealType)}" placeholder="Es. Colazione" />
    <textarea placeholder="Un alimento per riga">${escapeHtml(meal.items)}</textarea>
    <button class="remove-meal" aria-label="Rimuovi pasto">✕</button>
  `;
  el.querySelector(".remove-meal").addEventListener("click", () => el.remove());
  return el;
}

function escapeAttr(str) {
  return (str || "").replace(/"/g, "&quot;");
}

function collectReviewData() {
  const days = [];
  document.querySelectorAll("#review-days .review-day").forEach((dayEl) => {
    const dayIndex = parseInt(dayEl.querySelector(".day-index-select").value, 10);
    const dayLabel = window.DietParser.DAY_NAMES.find((d) => d.index === dayIndex).label;
    const meals = [];
    dayEl.querySelectorAll(".review-meal").forEach((mealEl) => {
      const mealType = mealEl.querySelector(".meal-type-input").value.trim();
      const items = mealEl.querySelector("textarea").value.trim();
      if (mealType || items) meals.push({ mealType: mealType || "Pasto", items });
    });
    days.push({ dayIndex, dayLabel, meals });
  });
  return days;
}

// ------------------------------------------------------------
// Grafico peso disegnato a mano su canvas (nessuna libreria)
// ------------------------------------------------------------
function drawWeightChart(canvas, logs) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (logs.length < 2) {
    ctx.fillStyle = "#7c887e";
    ctx.font = "14px Karla";
    ctx.fillText(
      logs.length === 0 ? "Aggiungi il tuo peso per vedere il grafico." : "Aggiungi almeno un'altra rilevazione.",
      12, h / 2
    );
    return;
  }

  const weights = logs.map((l) => l.weight_kg);
  const min = Math.min(...weights) - 0.5;
  const max = Math.max(...weights) + 0.5;
  const pad = 24;

  const xFor = (i) => pad + (i / (logs.length - 1)) * (w - pad * 2);
  const yFor = (v) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);

  // area sotto la curva
  ctx.beginPath();
  ctx.moveTo(xFor(0), h - pad);
  logs.forEach((l, i) => ctx.lineTo(xFor(i), yFor(l.weight_kg)));
  ctx.lineTo(xFor(logs.length - 1), h - pad);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(242,183,5,0.28)");
  grad.addColorStop(1, "rgba(242,183,5,0)");
  ctx.fillStyle = grad;
  ctx.fill();

  // linea
  ctx.beginPath();
  logs.forEach((l, i) => {
    const x = xFor(i), y = yFor(l.weight_kg);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#f2b705";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  // punti
  logs.forEach((l, i) => {
    ctx.beginPath();
    ctx.arc(xFor(i), yFor(l.weight_kg), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#efeadc";
    ctx.fill();
  });
}

window.UI = {
  showQuote,
  startOfWeek,
  toDateStr,
  renderWeekStrip,
  renderDayDetail,
  renderReview,
  collectReviewData,
  drawWeightChart,
};
