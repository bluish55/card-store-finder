let db;

function initSupabase() {
  db = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
}

async function checkSession() {
  const { data: { session } } = await db.auth.getSession();
  if (session) {
    // OAuth 콜백으로 돌아온 경우 → 메인으로 이동
    location.href = 'index.html';
  }
}

async function signInWith(provider) {
  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: window.location.origin + '/login.html'
    }
  });
  if (error) alert('로그인 중 오류가 발생했어요: ' + error.message);
}

window.addEventListener('load', () => {
  initSupabase();
  checkSession();
});
