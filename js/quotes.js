// ============================================================
// Frasi motivazionali mostrate nell'app
// ============================================================
window.MOTIVATIONAL_QUOTES = [
  "Ogni pasto è una scelta. Oggi scegli te stesso.",
  "Non è una gara: è costanza, un giorno alla volta.",
  "Piccoli passi, ogni giorno, portano lontano.",
  "Il progresso non si vede sempre sulla bilancia.",
  "Sei più forte della scusa che stai per usare.",
  "Disciplina è ricordarsi cosa vuoi davvero.",
  "Un pasto sano non è una rinuncia, è un investimento.",
  "La costanza batte la perfezione, sempre.",
  "Oggi conta. Anche se sembra un giorno qualsiasi.",
  "Non devi essere estremo, devi essere costante.",
  "Il corpo che vuoi si costruisce con le abitudini di oggi.",
  "Va bene anche un giorno imperfetto: domani si continua.",
  "Nutrirsi bene è un atto di rispetto verso te stesso.",
  "Il risultato arriva quando smetti di cercare scorciatoie.",
  "Sei a un pasto di distanza dal sentirti meglio.",
  "La motivazione ti fa iniziare, l'abitudine ti fa continuare.",
  "Chi resta costante, vince. Sempre.",
  "Ogni scelta sana di oggi è un regalo per te di domani.",
];

function getRandomQuote() {
  const list = window.MOTIVATIONAL_QUOTES;
  return list[Math.floor(Math.random() * list.length)];
}
window.getRandomQuote = getRandomQuote;
