// ============================================================
// App — stato, routing, wiring degli eventi
// ============================================================

const State = {
  user: null,
  diet: null,
  weekStart: null,
  weekLogs: [],
  selectedDayIndex: 0,
  parsedDays: null,
};

function $(id) { return document.getElementById(id); }

// ------------------------------------------------------------
// Avvio
// ------------------------------------------------------------
async function init() {
  wireAuthForms();
  wireTopNav();
  wireUploadFlow();
  wireWeightForm();

  const session = await Auth.getSession();
  if (session) {
    State.user = session.user;
    await enterApp();
  } else {
    showAuthScreen();
  }

  window.sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      State.user = null;
      showAuthScreen();
    }
  });
}

function showAuthScreen() {
  $("view-auth").classList.remove("hidden");
  $("view-app").classList.add("hidden");
}

async function enterApp() {
  $("view-auth").classList.add("hidden");
  $("view-app").classList.remove("hidden");
  UI.showQuote();
  setInterval(UI.showQuote, 25000);
  await loadDiet();
  switchRoute("week");
}

// ------------------------------------------------------------
// Autenticazione
// ------------------------------------------------------------
function wireAuthForms() {
  $("switch-to-signup").addEventListener("click", () => {
    $("form-login").classList.add("hidden");
    $("form-signup").classList.remove("hidden");
    $("switch-to-signup-wrap").classList.add("hidden");
    $("switch-to-login-wrap").classList.remove("hidden");
    $("auth-subtitle").textContent = "Crea un account per iniziare il tuo percorso.";
  });
  $("switch-to-login").addEventListener("click", () => {
    $("form-signup").classList.add("hidden");
    $("form-login").classList.remove("hidden");
    $("switch-to-login-wrap").classList.add("hidden");
    $("switch-to-signup-wrap").classList.remove("hidden");
    $("auth-subtitle").textContent = "Accedi per continuare il tuo piano alimentare.";
  });

  $("form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-error").classList.add("hidden");
    try {
      const { user } = await Auth.signIn($("login-email").value, $("login-password").value);
      State.user = user;
      await enterApp();
    } catch (err) {
      $("login-error").textContent = translateAuthError(err.message);
      $("login-error").classList.remove("hidden");
    }
  });

  $("form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("signup-error").classList.add("hidden");
    $("signup-success").classList.add("hidden");
    try {
      await Auth.signUp($("signup-email").value, $("signup-password").value, $("signup-name").value);
      $("signup-success").classList.remove("hidden");
      $("form-signup").reset();
    } catch (err) {
      $("signup-error").textContent = translateAuthError(err.message);
      $("signup-error").classList.remove("hidden");
    }
  });

  $("btn-logout").addEventListener("click", async () => {
    await Auth.signOut();
  });
}

function translateAuthError(msg) {
  if (/invalid login credentials/i.test(msg)) return "Email o password non corrette.";
  if (/already registered/i.test(msg)) return "Esiste già un account con questa email.";
  if (/password/i.test(msg) && /6/i.test(msg)) return "La password deve avere almeno 6 caratteri.";
  return msg;
}

// ------------------------------------------------------------
// Routing tra le viste
// ------------------------------------------------------------
function wireTopNav() {
  document.querySelectorAll("[data-route]").forEach((btn) => {
    btn.addEventListener("click", () => switchRoute(btn.dataset.route));
  });
}

function switchRoute(route) {
  ["week", "progress", "upload"].forEach((r) => {
    $("route-" + r).classList.toggle("hidden", r !== route);
  });
  document.querySelectorAll(".topbar nav button").forEach((b) => {
    b.classList.toggle("active", b.dataset.route === route);
  });
  if (route === "progress") renderProgress();
}

// ------------------------------------------------------------
// Vista settimana
// ------------------------------------------------------------
async function loadDiet() {
  $("week-loading").classList.remove("hidden");
  $("week-empty").classList.add("hidden");
  $("week-content").classList.add("hidden");

  const diet = await DietStore.getActiveDiet(State.user.id);
  State.diet = diet;
  $("week-loading").classList.add("hidden");

  if (!diet || !diet.days || diet.days.length === 0) {
    $("week-empty").classList.remove("hidden");
    return;
  }

  State.weekStart = UI.startOfWeek(new Date());
  const weekEnd = new Date(State.weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  State.weekLogs = await DietStore.getWeekLogs(State.user.id, UI.toDateStr(State.weekStart), UI.toDateStr(weekEnd));

  const today = (new Date().getDay() + 6) % 7;
  State.selectedDayIndex = diet.days.find((d) => d.day_index === today) ? today : diet.days[0].day_index;

  $("week-content").classList.remove("hidden");
  renderWeekUI();
}

function renderWeekUI() {
  UI.renderWeekStrip(State.diet, State.weekStart, State.weekLogs, State.selectedDayIndex);
  const day = State.diet.days.find((d) => d.day_index === State.selectedDayIndex);
  const cellDate = new Date(State.weekStart);
  cellDate.setDate(cellDate.getDate() + State.selectedDayIndex);
  const dateStr = UI.toDateStr(cellDate);
  const logsForDate = State.weekLogs.filter((l) => l.log_date === dateStr);

  UI.renderDayDetail(day, dateStr, logsForDate, async (mealId, willBeDone) => {
    await DietStore.toggleMealLog(State.user.id, mealId, dateStr, willBeDone);
    State.weekLogs = State.weekLogs.filter((l) => !(l.diet_meal_id === mealId && l.log_date === dateStr));
    State.weekLogs.push({ diet_meal_id: mealId, log_date: dateStr, completed: willBeDone });
    renderWeekUI();
  });
}

function selectDay(index) {
  State.selectedDayIndex = index;
  renderWeekUI();
}

// ------------------------------------------------------------
// Caricamento e interpretazione del PDF
// ------------------------------------------------------------
function wireUploadFlow() {
  const zone = $("upload-zone");
  const input = $("pdf-input");

  zone.addEventListener("click", () => input.click());
  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) handlePdfFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => {
    if (input.files[0]) handlePdfFile(input.files[0]);
  });

  $("add-day-btn").addEventListener("click", () => {
    document.getElementById("review-days").appendChild(
      buildReviewDayEl({ dayIndex: 0, meals: [] })
    );
  });

  $("cancel-review-btn").addEventListener("click", () => {
    $("review-wrap").classList.add("hidden");
    input.value = "";
  });

  $("save-diet-btn").addEventListener("click", async () => {
    const days = UI.collectReviewData();
    if (days.length === 0) {
      alert("Aggiungi almeno un giorno prima di salvare.");
      return;
    }
    const btn = $("save-diet-btn");
    btn.disabled = true;
    btn.textContent = "Salvataggio…";
    try {
      await DietStore.saveDiet(State.user.id, {
        title: "Piano alimentare",
        filename: State.lastFilename,
        rawText: State.lastRawText,
        days,
      });
      $("review-wrap").classList.add("hidden");
      input.value = "";
      await loadDiet();
      switchRoute("week");
    } catch (err) {
      alert("Errore durante il salvataggio: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Salva piano";
    }
  });
}

async function handlePdfFile(file) {
  if (file.type !== "application/pdf") {
    alert("Carica un file PDF.");
    return;
  }
  $("upload-status").classList.remove("hidden");
  $("review-wrap").classList.add("hidden");
  $("upload-status-text").textContent = "Leggo il PDF…";

  try {
    const result = await DietParser.parseDietFile(file);
    State.lastRawText = result.rawText;
    State.lastFilename = file.name;

    $("upload-status-text").textContent = "Interpreto il piano…";
    await new Promise((r) => setTimeout(r, 250)); // lascia respirare la UI

    State.parsedDays = result.days;
    UI.renderReview(result.days);

    $("upload-status").classList.add("hidden");
    $("review-wrap").classList.remove("hidden");

    if (result.format === "grid") {
      const totalMeals = result.days.reduce((s, d) => s + d.meals.length, 0);
      if (totalMeals === 0) {
        alert(
          "Ho letto il PDF ma non sono riuscito a riconoscere i pasti automaticamente. " +
          "Puoi comunque compilare i giorni a mano qui sotto."
        );
      }
    }
  } catch (err) {
    $("upload-status").classList.add("hidden");
    alert("Non sono riuscito a leggere questo PDF: " + err.message);
  }
}

// ------------------------------------------------------------
// Vista avanzamento
// ------------------------------------------------------------
async function renderProgress() {
  if (!State.diet) return;

  const totalMealsPerWeek = State.diet.days.reduce((sum, d) => sum + d.diet_meals.length, 0);
  const doneCount = State.weekLogs.filter((l) => l.completed).length;
  const pct = totalMealsPerWeek > 0 ? Math.round((doneCount / totalMealsPerWeek) * 100) : 0;
  $("stat-week-pct").textContent = pct + "%";

  $("stat-streak").textContent = computeStreak(State.weekLogs) + " gg";

  $("weight-date").valueAsDate = new Date();
  const weightLogs = await DietStore.getWeightLogs(State.user.id);
  UI.drawWeightChart($("weightChart"), weightLogs);
}

function computeStreak(logs) {
  const doneDates = new Set(logs.filter((l) => l.completed).map((l) => l.log_date));
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = UI.toDateStr(d);
    if (doneDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

function wireWeightForm() {
  $("form-weight").addEventListener("submit", async (e) => {
    e.preventDefault();
    const dateStr = $("weight-date").value;
    const weight = parseFloat($("weight-value").value);
    if (!dateStr || Number.isNaN(weight)) return;
    await DietStore.addWeightLog(State.user.id, dateStr, weight, null);
    $("weight-value").value = "";
    const weightLogs = await DietStore.getWeightLogs(State.user.id);
    UI.drawWeightChart($("weightChart"), weightLogs);
  });
}

window.App = { selectDay };

document.addEventListener("DOMContentLoaded", init);
