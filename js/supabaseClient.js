// ============================================================
// Inizializza il client Supabase (libreria caricata via CDN in index.html)
// ============================================================
window.sb = supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY
);
