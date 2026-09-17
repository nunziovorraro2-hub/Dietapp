// ============================================================
// Estrae il testo da un PDF (pdf.js via CDN) e lo interpreta
// riconoscendo giorni della settimana e tipi di pasto.
// Il risultato è pensato per essere rivisto/corretto dall'utente
// prima di essere salvato: l'interpretazione automatica di un
// PDF "libero" non può essere garantita al 100%.
// ============================================================

const DAY_NAMES = [
  { label: "Lunedì", index: 0, re: /luned[iì]/i },
  { label: "Martedì", index: 1, re: /marted[iì]/i },
  { label: "Mercoledì", index: 2, re: /mercoled[iì]/i },
  { label: "Giovedì", index: 3, re: /gioved[iì]/i },
  { label: "Venerdì", index: 4, re: /venerd[iì]/i },
  { label: "Sabato", index: 5, re: /sabato/i },
  { label: "Domenica", index: 6, re: /domenica/i },
];

const MEAL_KEYWORDS = [
  { label: "Colazione", re: /colazione/i },
  { label: "Spuntino mattutino", re: /spuntino\s*(del\s*)?mattin[oa]/i },
  { label: "Pranzo", re: /pranzo/i },
  { label: "Spuntino pomeridiano", re: /spuntino\s*(del\s*)?pomeriggio|merenda/i },
  { label: "Spuntino", re: /spuntino/i },
  { label: "Cena", re: /cena/i },
  { label: "Post cena", re: /post\s*cena/i },
];

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Ricostruisce righe usando la posizione verticale (y) di ogni frammento
    const lines = {};
    content.items.forEach((item) => {
      const y = Math.round(item.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push(item.str);
    });
    const sortedY = Object.keys(lines).sort((a, b) => b - a);
    sortedY.forEach((y) => {
      fullText += lines[y].join(" ") + "\n";
    });
    fullText += "\n";
  }
  return fullText;
}

function findAllMatches(text, patterns) {
  // Ritorna [{ index, endIndex, label, matchedTag }] ordinati per posizione nel testo
  const matches = [];
  patterns.forEach((p) => {
    const re = new RegExp(p.re.source, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        index: m.index,
        endIndex: m.index + m[0].length,
        label: p.label,
        meta: p,
      });
    }
  });
  matches.sort((a, b) => a.index - b.index);
  return matches;
}

function cleanItemsBlock(block) {
  return block
    .split("\n")
    .map((l) => l.replace(/^[\s\-•*·▪●○]+/, "").trim())
    .filter((l) => l.length > 0)
    // scarta righe che sono di nuovo un'etichetta di pasto isolata
    .filter((l) => !MEAL_KEYWORDS.some((mk) => mk.re.test(l) && l.length < 25))
    .join("\n");
}

/**
 * Interpreta il testo grezzo del PDF in una struttura:
 * [{ dayIndex, dayLabel, meals: [{ mealType, items }] }, ...]
 */
function parseDietText(rawText) {
  const dayMatches = findAllMatches(rawText, DAY_NAMES);

  if (dayMatches.length === 0) {
    // Fallback: nessun giorno riconosciuto, tutto in un unico blocco
    // che l'utente potrà smistare manualmente nella schermata di revisione.
    return [
      {
        dayIndex: 0,
        dayLabel: "Giorno 1",
        meals: parseMealsFromBlock(rawText),
      },
    ];
  }

  const days = [];
  for (let i = 0; i < dayMatches.length; i++) {
    const start = dayMatches[i].endIndex;
    const end = i + 1 < dayMatches.length ? dayMatches[i + 1].index : rawText.length;
    const block = rawText.slice(start, end);
    const dayMeta = dayMatches[i].meta;
    days.push({
      dayIndex: dayMeta.index,
      dayLabel: dayMeta.label,
      meals: parseMealsFromBlock(block),
    });
  }
  return days;
}

function parseMealsFromBlock(block) {
  const mealMatches = findAllMatches(block, MEAL_KEYWORDS);
  if (mealMatches.length === 0) {
    const cleaned = cleanItemsBlock(block);
    return cleaned ? [{ mealType: "Pasto", items: cleaned }] : [];
  }
  const meals = [];
  for (let i = 0; i < mealMatches.length; i++) {
    const start = mealMatches[i].endIndex;
    const end = i + 1 < mealMatches.length ? mealMatches[i + 1].index : block.length;
    const items = cleanItemsBlock(block.slice(start, end));
    if (items) {
      meals.push({ mealType: mealMatches[i].label, items });
    }
  }
  return meals;
}

window.DietParser = { extractTextFromPdf, parseDietText, DAY_NAMES, MEAL_KEYWORDS };
