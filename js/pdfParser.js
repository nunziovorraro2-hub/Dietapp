// ============================================================
// Estrae il testo/le posizioni dal PDF (pdf.js via CDN) e interpreta
// il piano alimentare. Gestisce due formati molto comuni:
//
//  A) TABELLA SETTIMANALE: i 7 giorni sono colonne, i pasti sono righe
//     (il formato tipico dei software per nutrizionisti come Progeo
//     Medical: ogni cella è centrata verticalmente e può avere
//     un'altezza diversa dalle altre, quindi il parsing lavora
//     colonna per colonna, individuando i "salti" verticali tra un
//     pasto e l'altro invece di usare bande fisse).
//  B) SEQUENZIALE: un giorno dopo l'altro nel testo, con i pasti
//     elencati uno sotto l'altro.
//
// In entrambi i casi il risultato va sempre rivisto dall'utente prima
// di essere salvato: nessuna interpretazione automatica di un PDF
// "libero" può essere garantita al 100%.
// ============================================================

const DAY_NAMES = [
  { label: "Lunedì", index: 0, re: /^luned[iì]$/i },
  { label: "Martedì", index: 1, re: /^marted[iì]$/i },
  { label: "Mercoledì", index: 2, re: /^mercoled[iì]$/i },
  { label: "Giovedì", index: 3, re: /^gioved[iì]$/i },
  { label: "Venerdì", index: 4, re: /^venerd[iì]$/i },
  { label: "Sabato", index: 5, re: /^sabato$/i },
  { label: "Domenica", index: 6, re: /^domenica$/i },
];
// Versione "libera" (senza ancoraggio) usata per il parsing sequenziale,
// dove il nome del giorno può comparire dentro una frase più lunga.
const DAY_NAMES_LOOSE = DAY_NAMES.map((d) => ({ ...d, re: new RegExp(d.re.source.replace(/\^|\$/g, ""), "i") }));

const MEAL_KEYWORDS = [
  { label: "Colazione", re: /colazione/i },
  { label: "Metà mattina", re: /met[aà]\s*mattina|spuntino\s*(del\s*)?mattin[oa]/i },
  { label: "Pranzo", re: /pranzo/i },
  { label: "Merenda", re: /merenda|spuntino\s*(del\s*)?pomeriggio/i },
  { label: "Cena", re: /\bcena\b/i },
  { label: "Post cena", re: /post\s*cena/i },
  { label: "Arco della giornata", re: /^arco/i },
  { label: "Spuntino", re: /spuntino/i },
];

// Testo "di contorno" da ignorare ovunque compaia nella pagina
// (intestazioni/piè di pagina dello studio, numeri di pagina, firma software)
const NOISE_RE = /powered\s*by|elaborato\s*da|biologa\s*nutrizionista|^\d{1,4}$/i;
function isNoise(str) {
  return NOISE_RE.test((str || "").trim());
}

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function cleanBullet(str) {
  return (str || "").replace(/^[\s\-•*·▪●○]+/, "").trim();
}

// ------------------------------------------------------------
// Estrazione con posizione (x, y) di ogni frammento di testo,
// necessaria per capire le tabelle a griglia
// ------------------------------------------------------------
async function extractPagesWithPositions(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const items = content.items
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))
      .filter((it) => it.str && it.str.trim().length > 0 && !isNoise(it.str));
    pages.push(items);
  }
  return pages;
}

function groupIntoLines(items, tolerance = 2.5) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const lines = [];
  sorted.forEach((it) => {
    let line = lines.find((l) => Math.abs(l.y - it.y) <= tolerance);
    if (!line) {
      line = { y: it.y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  });
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

// ------------------------------------------------------------
// Estrazione di solo testo (fallback + "raw_text" salvato nel DB)
// ------------------------------------------------------------
async function extractTextFromPdf(file) {
  const pages = await extractPagesWithPositions(file);
  let fullText = "";
  pages.forEach((items) => {
    groupIntoLines(items).forEach((line) => {
      fullText += line.items.map((it) => it.str).join(" ") + "\n";
    });
    fullText += "\n";
  });
  return fullText;
}

// ------------------------------------------------------------
// FORMATO A — tabella settimanale (giorni in colonna)
// ------------------------------------------------------------
function tryParseGridPage(items) {
  const lines = groupIntoLines(items);

  // Cerca la riga di intestazione: una riga con almeno 4 nomi di giorno
  // riconosciuti come frammenti di testo distinti.
  let headerLine = null;
  let headerCols = null;
  for (const line of lines) {
    const matches = [];
    line.items.forEach((it) => {
      const day = DAY_NAMES.find((d) => d.re.test(it.str.trim()));
      if (day) matches.push({ index: day.index, x: it.x });
    });
    if (matches.length >= 4) {
      const uniq = [];
      matches
        .sort((a, b) => a.x - b.x)
        .forEach((m) => {
          if (!uniq.some((u) => u.index === m.index)) uniq.push(m);
        });
      if (uniq.length >= 4) {
        headerLine = line;
        headerCols = uniq;
        break;
      }
    }
  }
  if (!headerCols) return null;

  const cols = [...headerCols].sort((a, b) => a.x - b.x);
  const boundaries = [];
  for (let i = 0; i < cols.length - 1; i++) boundaries.push((cols[i].x + cols[i + 1].x) / 2);
  function colIndexForX(x) {
    let ci = 0;
    while (ci < boundaries.length && x >= boundaries[ci]) ci++;
    return cols[ci].index;
  }
  const leftEdge = cols[0].x;
  const bodyLines = lines.filter((l) => l.y < headerLine.y - 1);

  // Righe-etichetta (Colazione, Pranzo, ...) trovate nella colonna di sinistra
  const rowLabels = [];
  bodyLines.forEach((line) => {
    const first = line.items[0];
    if (first && first.x < leftEdge - 5) {
      const meal = MEAL_KEYWORDS.find((m) => m.re.test(first.str.trim()));
      if (meal && !rowLabels.some((r) => r.label === meal.label)) rowLabels.push({ label: meal.label, y: line.y });
    }
  });
  if (rowLabels.length === 0) return null;
  rowLabels.sort((a, b) => b.y - a.y);

  // Per ogni colonna (giorno), si lavora SOLO sulla sequenza verticale di
  // quella colonna: si individuano i "salti" più larghi del normale
  // interlinea (che segnalano il passaggio a un pasto diverso) e si
  // assegnano i blocchi risultanti alle etichette di riga più vicine,
  // mantenendo l'ordine (una colonna non può "tornare indietro" a un
  // pasto precedente).
  const days = cols.map((c) => {
    const dayMeta = DAY_NAMES.find((d) => d.index === c.index);

    const colLines = [];
    bodyLines.forEach((line) => {
      const itemsInCol = line.items.filter((it) => it.x >= leftEdge - 5 && colIndexForX(it.x) === c.index);
      if (itemsInCol.length) colLines.push({ y: line.y, text: itemsInCol.map((it) => it.str).join(" ") });
    });
    colLines.sort((a, b) => b.y - a.y);

    const gaps = [];
    for (let i = 1; i < colLines.length; i++) gaps.push(colLines[i - 1].y - colLines[i].y);
    const typical = median(gaps.filter((g) => g > 0)) || 12;
    const bigGap = typical * 1.6;

    const blocks = [];
    colLines.forEach((cl, i) => {
      if (i === 0 || colLines[i - 1].y - cl.y > bigGap) blocks.push({ lines: [cl] });
      else blocks[blocks.length - 1].lines.push(cl);
    });

    let labelPtr = 0;
    const mealsMap = {};
    blocks.forEach((block) => {
      const avgY = block.lines.reduce((s, l) => s + l.y, 0) / block.lines.length;
      while (
        labelPtr + 1 < rowLabels.length &&
        Math.abs(avgY - rowLabels[labelPtr + 1].y) < Math.abs(avgY - rowLabels[labelPtr].y)
      ) {
        labelPtr++;
      }
      const label = rowLabels[labelPtr].label;
      if (!mealsMap[label]) mealsMap[label] = [];
      block.lines.forEach((l) => mealsMap[label].push(cleanBullet(l.text)));
    });

    const meals = rowLabels
      .map((r) => r.label)
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((label) => ({ mealType: label, items: (mealsMap[label] || []).filter(Boolean).join("\n") }))
      .filter((m) => m.items);

    return { dayIndex: c.index, dayLabel: dayMeta ? dayMeta.label : `Giorno ${c.index + 1}`, meals };
  });

  return days.some((d) => d.meals.length > 0) ? days : null;
}

// ------------------------------------------------------------
// FORMATO B — sequenziale (fallback): un giorno dopo l'altro nel testo
// ------------------------------------------------------------
function findAllMatches(text, patterns) {
  const matches = [];
  patterns.forEach((p) => {
    const re = new RegExp(p.re.source, "gi");
    let m;
    while ((m = re.exec(text)) !== null) {
      matches.push({ index: m.index, endIndex: m.index + m[0].length, label: p.label, meta: p });
    }
  });
  matches.sort((a, b) => a.index - b.index);
  return matches;
}

function cleanItemsBlock(block) {
  return block
    .split("\n")
    .map(cleanBullet)
    .filter((l) => l.length > 0)
    .filter((l) => !MEAL_KEYWORDS.some((mk) => mk.re.test(l) && l.length < 25))
    .join("\n");
}

function parseDietTextSequential(rawText) {
  const dayMatches = findAllMatches(rawText, DAY_NAMES_LOOSE);
  if (dayMatches.length === 0) {
    return [{ dayIndex: 0, dayLabel: "Giorno 1", meals: parseMealsFromBlock(rawText) }];
  }
  const days = [];
  for (let i = 0; i < dayMatches.length; i++) {
    const start = dayMatches[i].endIndex;
    const end = i + 1 < dayMatches.length ? dayMatches[i + 1].index : rawText.length;
    const block = rawText.slice(start, end);
    const dayMeta = dayMatches[i].meta;
    days.push({ dayIndex: dayMeta.index, dayLabel: dayMeta.label, meals: parseMealsFromBlock(block) });
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
    if (items) meals.push({ mealType: mealMatches[i].label, items });
  }
  return meals;
}

// ------------------------------------------------------------
// Punto di ingresso unico usato dall'app
// ------------------------------------------------------------
async function parseDietFile(file) {
  const pages = await extractPagesWithPositions(file);

  let rawText = "";
  pages.forEach((items) => {
    groupIntoLines(items).forEach((line) => {
      rawText += line.items.map((it) => it.str).join(" ") + "\n";
    });
    rawText += "\n";
  });

  // 1) prova il formato a tabella settimanale, pagina per pagina
  //    (si ferma alla prima pagina che produce una tabella valida:
  //    se il piano ha più settimane alternate, viene importata la prima —
  //    le altre si possono caricare in un secondo momento ripetendo l'upload)
  for (const items of pages) {
    const grid = tryParseGridPage(items);
    if (grid) return { days: grid, rawText, format: "grid" };
  }

  // 2) fallback: formato sequenziale su tutto il testo
  const days = parseDietTextSequential(rawText);
  return { days, rawText, format: "sequential" };
}

window.DietParser = {
  parseDietFile,
  extractTextFromPdf,
  parseDietText: parseDietTextSequential,
  DAY_NAMES,
  MEAL_KEYWORDS,
};
