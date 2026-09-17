// ============================================================
// Autenticazione utente (email + password via Supabase Auth)
// ============================================================

async function signUp(email, password, fullName) {
  const { data, error } = await window.sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.user) {
    await window.sb.from("profiles").upsert({
      id: data.user.id,
      full_name: fullName || null,
    });
  }
  return data;
}

async function signIn(email, password) {
  const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signOut() {
  await window.sb.auth.signOut();
}

async function getSession() {
  const { data } = await window.sb.auth.getSession();
  return data.session;
}

window.Auth = { signUp, signIn, signOut, getSession };
