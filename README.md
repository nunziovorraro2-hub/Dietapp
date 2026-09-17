# Percorso — gestione avanzamento dieta

App web (HTML/CSS/JS puri, nessun framework, nessuna build) per:
- caricare il PDF del piano alimentare fornito dalla nutrizionista;
- farlo interpretare automaticamente in giorni/pasti (con revisione e correzione manuale prima di salvare, perché ogni PDF è diverso);
- consultare la settimana in modo grafico e animato, con frasi motivazionali;
- segnare i pasti fatti e tracciare l'avanzamento (streak, % settimanale, peso nel tempo).

Autenticazione utente e database sono su **un tuo progetto Supabase** (non quello del connettore collegato a Claude). Il deploy è pensato per **Cloudflare Pages**, con codice su **GitHub**.

## Struttura del progetto

```
diet-app/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── config.js        ← qui vanno le TUE chiavi Supabase
│   ├── supabaseClient.js
│   ├── auth.js
│   ├── pdfParser.js
│   ├── dietStore.js
│   ├── quotes.js
│   ├── ui.js
│   └── app.js
└── supabase/
    └── schema.sql        ← schema del database da eseguire su Supabase
```

Nessuna build, nessun bundler: sono file statici serviti così come sono.

## 1. Progetto Supabase — già fatto ✅

Lo schema (`supabase/schema.sql`) è già stato applicato sul tuo progetto Supabase collegato: le 6 tabelle (`profiles`, `diets`, `diet_days`, `diet_meals`, `meal_logs`, `weight_logs`) esistono già, tutte con Row Level Security attiva.

`js/config.js` è già compilato con l'URL e la anon key del tuo progetto — non devi copiare nulla a mano.

Un'unica cosa da controllare tu: in **Authentication > Settings** del progetto Supabase, decidi se lasciare attiva la "Confirm email" (l'utente deve cliccare un link ricevuto via mail prima di poter accedere) oppure disattivarla per registrarti/testare più velocemente.

## 2. Prova l'app in locale

Puoi provare subito l'app aprendo `index.html` con un server locale qualsiasi, ad esempio:

```bash
npx serve .
# oppure
python3 -m http.server 8080
```

(Aprire il file direttamente con doppio click a volte blocca il caricamento dei moduli/PDF per via delle policy del browser: meglio un piccolo server locale.)

## 3. Pubblica su GitHub

```bash
cd diet-app
git init
git add .
git commit -m "Prima versione dell'app dieta"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/diet-app.git
git push -u origin main
```

## 4. Deploy su Cloudflare Pages

1. Vai su [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Seleziona il repository appena creato.
3. Impostazioni di build:
   - **Framework preset**: `None`
   - **Build command**: (lascia vuoto)
   - **Build output directory**: `/`
4. Clicca **Save and Deploy**. Dopo qualche secondo l'app sarà online su un dominio `*.pages.dev` (collegabile poi a un dominio tuo da **Custom domains**).

Ogni `git push` su `main` farà ripartire automaticamente il deploy.

## Come funziona l'interpretazione del PDF

1. Il PDF viene letto **nel browser** con `pdf.js` (nessun upload a server esterni): il testo viene estratto pagina per pagina.
2. Un parser euristico (`js/pdfParser.js`) cerca i nomi dei giorni della settimana (Lunedì, Martedì, …) e le etichette dei pasti (Colazione, Pranzo, Spuntino, Cena, …) per suddividere il testo in giorni e pasti.
3. Il risultato viene mostrato in una schermata di **revisione modificabile**: puoi correggere il giorno, il tipo di pasto o il testo prima di salvare. Questo passaggio è volutamente sempre presente, perché ogni piano nutrizionale è formattato in modo diverso e un'interpretazione automatica al 100% non è affidabile.
4. Solo dopo la conferma i dati vengono scritti su Supabase.

Quando la nutrizionista aggiorna il piano, basta ripetere il caricamento dalla sezione "Piano": il piano precedente viene disattivato (rimane comunque salvato nello storico) e il nuovo diventa quello attivo.

## Personalizzazione

- **Frasi motivazionali**: modifica l'array in `js/quotes.js`.
- **Colori e stile**: tutti i colori sono definiti come variabili CSS in cima a `css/style.css` (`:root`), così puoi cambiare la palette in un solo punto.
- **Riconoscimento pasti**: se la tua dieta usa etichette diverse (es. "Merenda" invece di "Spuntino"), aggiungi il pattern in `MEAL_KEYWORDS` dentro `js/pdfParser.js`.
