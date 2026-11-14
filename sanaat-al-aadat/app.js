'use strict';
// صناعة العادات v2: مهام يومية ومهام خاصة (قراءة PDF، فيديو)، نقاط ومكافآت، مستويات، شارات، ترتيب ومنصّة

const DAYS = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };
const WINDOWS = { 1: 'اليوم فقط (حتى نصف الليل)', 2: 'اليوم وأمس (48 ساعة)', 3: 'آخر 3 أيام', 7: 'آخر أسبوع' };
const MONTH_NAMES = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const COLORS = ['#61038d', '#20149a', '#e5197d', '#1f9d63', '#c26a00', '#0b7fa6', '#8a2be2', '#b0306a'];
const avatarColor = (id) => COLORS[Math.abs(Number(id) || 0) % COLORS.length];
// صورة المشارك، أو أول حرف من اسمه على لون ثابت
function avatar(id, name, url, cls = '') {
  if (url) return `<span class="av ${cls} img" style="background:${avatarColor(id)}"><img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`;
  return `<span class="av ${cls}" style="background:${avatarColor(id)}">${esc(String(name || '?').trim().charAt(0))}</span>`;
}

// المستويات: المستوى L يبدأ من 25×L×(L−1) نقطة (0، 50، 150، 300، 500، 750…)
const LEVEL_TITLES = ['مبتدئ', 'مجتهد', 'مثابر', 'مواظب', 'متميّز', 'بطل', 'نجم', 'قدوة', 'فارس', 'أسطورة'];
const LEVEL_COLORS = ['#f5b52e', '#f07a1a', '#e5197d', '#c04fd0', '#8a5cf6', '#2e8bf0', '#19b394', '#61038d', '#20149a', '#d4a106'];
const levelStart = (L) => 25 * L * (L - 1);
function level(points) {
  const p = Math.max(0, points || 0);
  const L = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * p) / 25)) / 2));
  const from = levelStart(L);
  const to = levelStart(L + 1);
  return {
    level: L, title: LEVEL_TITLES[Math.min(L - 1, LEVEL_TITLES.length - 1)], color: LEVEL_COLORS[(L - 1) % LEVEL_COLORS.length],
    toGo: to - p, pct: Math.round(((p - from) / (to - from)) * 100), next: LEVEL_TITLES[Math.min(L, LEVEL_TITLES.length - 1)],
  };
}

// أحاديث صحيحة قصيرة للتحفيز (يتغيّر كل يوم)
const QUOTES = [
  ['«أحبُّ الأعمال إلى الله أدومُها وإن قلّ»', 'متفق عليه'],
  ['سُئل النبي ﷺ: أيّ العمل أحبّ إلى الله؟ قال: «الصلاة على وقتها»', 'متفق عليه'],
  ['«ركعتا الفجر خيرٌ من الدنيا وما فيها»', 'رواه مسلم'],
  ['«اقرؤوا القرآن فإنه يأتي يوم القيامة شفيعًا لأصحابه»', 'رواه مسلم'],
  ['«من صلّى البَرْدَين دخل الجنة»', 'متفق عليه'],
  ['«إنّ الله وِترٌ يحبّ الوِتر»', 'متفق عليه'],
  ['«كلمتان خفيفتان على اللسان، ثقيلتان في الميزان: سبحان الله وبحمده، سبحان الله العظيم»', 'متفق عليه'],
];

// الشارات: تُحسب من أيام المشارك ونقاطه
const BADGES = [
  { id: 'first', icon: '🌱', name: 'أول خطوة', desc: 'سجّل أول مهمة', v: (x) => [x.activeDays, 1] },
  { id: 's3', icon: '🔥', name: 'ثلاثة أيام', desc: 'سلسلة 3 أيام متتالية في مهمة', v: (x) => [x.bestStreak, 3] },
  { id: 's7', icon: '⚡', name: 'أسبوع ذهبي', desc: 'سلسلة 7 أيام متتالية', v: (x) => [x.bestStreak, 7] },
  { id: 's14', icon: '🏅', name: 'أسبوعان', desc: 'سلسلة 14 يومًا متتالية', v: (x) => [x.bestStreak, 14] },
  { id: 's30', icon: '👑', name: 'شهر كامل', desc: 'سلسلة 30 يومًا متتالية', v: (x) => [x.bestStreak, 30] },
  { id: 'p1', icon: '✨', name: 'يوم مثالي', desc: 'أكمل كل المهام اليومية في يوم واحد', v: (x) => [x.perfectDays, 1] },
  { id: 'p7', icon: '💎', name: 'أسبوع مثالي', desc: '7 أيام مثالية متتالية', v: (x) => [x.bestPerfectRun, 7] },
  { id: 'pray', icon: '🕌', name: 'حارس الصلاة', desc: 'كل الصلوات على وقتها 7 أيام متتالية', v: (x) => [x.prayRun, 7], when: (x) => x.hasPrayers },
  { id: 'read1', icon: '📚', name: 'قارئ', desc: 'أنهِ قراءة أول ملف', v: (x) => [x.pdfDone, 1], when: (x) => x.hasPdf },
  { id: 'read5', icon: '📖', name: 'قارئ نهِم', desc: 'أنهِ قراءة 5 ملفات', v: (x) => [x.pdfDone, 5], when: (x) => x.hasPdf },
  { id: 'video', icon: '🎬', name: 'متابع', desc: 'شاهد أول فيديو حتى آخره', v: (x) => [x.videoDone, 1], when: (x) => x.hasVideo },
  { id: 'pts100', icon: '💯', name: 'مئة نقطة', desc: 'اجمع 100 نقطة', v: (x) => [x.points, 100] },
  { id: 'pts500', icon: '🚀', name: '500 نقطة', desc: 'اجمع 500 نقطة', v: (x) => [x.points, 500] },
  { id: 'pts1000', icon: '🌟', name: 'ألف نقطة', desc: 'اجمع 1000 نقطة', v: (x) => [x.points, 1000] },
  { id: 'top1', icon: '🥇', name: 'المتصدّر', desc: 'المرتبة الأولى في ترتيب الأسبوع', v: (x) => [x.weekRank === 1 ? 1 : 0, 1] },
  { id: 'days30', icon: '📅', name: 'مواظب', desc: 'نشاط في 30 يومًا مختلفًا', v: (x) => [x.activeDays, 30] },
];

const TEMPLATES = [
  { title: 'الصلوات الخمس على وقتها', icon: '🕋', points: 5, items: ['الصبح', 'الظهر', 'العصر', 'المغرب', 'العشاء'] },
  { title: 'سنّة الفجر', icon: '🌅', points: 5 },
  { title: 'الشفع والوتر', icon: '🌙', points: 5 },
  { title: 'أذكار الصباح', icon: '☀️', points: 5 },
  { title: 'أذكار المساء', icon: '🌆', points: 5 },
  { title: 'ورد القرآن', icon: '📖', points: 5 },
];

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const sb = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);

const S = {
  session: null, me: null, challenges: [], members: [], memberId: null, logs: [], myLogs: new Set(), google: false,
  rules: '', editDays: 2, perfectBonus: 10, streakBonus: 10,
  overall: null, week: null, tab: 'today', day: null, period: 'week', boardId: 0,
  openId: null, detMonth: null, detailId: null, month: null, editing: null, pending: null, authMode: 'login',
  sel: {}, quest: null, quiz: {},
};

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis' }).format(new Date());
const fmt = (s) => { const [, m, d] = s.split('-'); return `${Number(d)}/${Number(m)}`; };
const dayName = (s) => DAYS[(parse(s).getDay() + 6) % 7];
const key = (cid, day, item = 0) => `${cid}|${day}|${item}`;
const nItems = (c) => c.items?.length || 1;
const doneCount = (c, d) => { let n = 0; for (let i = 0; i < nItems(c); i++) if (S.myLogs.has(key(c.id, d, i))) n++; return n; };
const isFull = (c, d) => doneCount(c, d) >= nItems(c);
const inRange = (c, d) => d >= c.start_date && (!c.end_date || d <= c.end_date);
const dailies = (d = today()) => S.challenges.filter((c) => c.active && (c.kind || 'daily') === 'daily' && inRange(c, d));
const quests = () => S.challenges.filter((c) => c.active && c.kind === 'once' && c.start_date <= today());
const onceDone = (c) => S.logs.some((l) => l.challenge_id === c.id);
const member = () => S.members.find((m) => m.id === S.memberId);
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${many}`);
const ptsLabel = (n) => `${n} نقطة`;

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), 2600);
}

// ---------- مؤثرات: صوت، اهتزاز، قصاصات، نقاط طائرة ----------
const FX = {
  sound: recall('sound') !== 'off',
  ctx: null,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  chime(big = false) {
    if (!this.sound) return;
    try {
      this.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
      const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [659.25, 987.77];
      notes.forEach((f, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        const t0 = this.ctx.currentTime + i * (big ? 0.11 : 0.08);
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.connect(g).connect(this.ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.4);
      });
    } catch {}
  },
  buzz(ms = 25) { try { navigator.vibrate?.(ms); } catch {} },
  float(el, text) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = document.createElement('div');
    f.className = 'float-pts';
    f.textContent = text;
    f.style.left = `${r.left + r.width / 2}px`;
    f.style.top = `${r.top}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 1100);
  },
  confetti(amount = 80, origin = null) {
    if (this.reduced) return;
    const cv = $('#fx');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.scale(dpr, dpr);
    const cols = ['#61038d', '#e5197d', '#f5b52e', '#6fb6ff', '#1f9d63', '#8a5cf6'];
    const ox = origin ? origin.x : innerWidth / 2;
    const oy = origin ? origin.y : innerHeight / 3;
    const parts = Array.from({ length: amount }, () => ({
      x: ox, y: oy, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 11 - 3, s: 5 + Math.random() * 6,
      c: cols[(Math.random() * cols.length) | 0], r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    }));
    let frame = 0;
    cancelAnimationFrame(this.raf);
    const step = () => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (++frame < 110) this.raf = requestAnimationFrame(step);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    step();
  },
};

// نافذة احتفال (يوم مثالي، مستوى جديد، شارة)
const celebrations = [];
function celebrate(c) {
  celebrations.push(c);
  if (celebrations.length === 1) showCelebration();
}
function showCelebration() {
  const c = celebrations[0];
  if (!c) return;
  const m = $('#modal');
  m.innerHTML = `<div class="modal-card pop" role="dialog" aria-modal="true" aria-labelledby="cel-t">
    <div class="cel-icon">${c.icon}</div>
    <h2 id="cel-t">${esc(c.title)}</h2>
    <p>${esc(c.text)}</p>
    ${c.pts ? `<div class="cel-pts">+${c.pts} نقطة</div>` : ''}
    <button class="btn big" type="button" id="cel-ok">${esc(c.btn || 'رائع! 🎉')}</button>
  </div>`;
  m.hidden = false;
  FX.chime(true);
  FX.buzz([30, 60, 30]);
  FX.confetti(140);
  $('#cel-ok').focus();
  $('#cel-ok').addEventListener('click', () => {
    m.hidden = true;
    celebrations.shift();
    if (celebrations.length) setTimeout(showCelebration, 200);
  });
}

const AUTH_ERRORS = {
  'Invalid login credentials': 'الإيميل أو كلمة السر غير صحيحة.',
  'Email not confirmed': 'أكّد بريدك أولًا من الرسالة التي وصلتك.',
  'User already registered': 'هذا الإيميل مسجّل، ادخل بكلمة السر.',
};
const authError = (e) => AUTH_ERRORS[e?.message] || (/at least 6/.test(e?.message || '') ? 'كلمة السر 6 أحرف على الأقل.' : e?.message || 'حدث خطأ');

// ---------- التسجيل والدخول ----------
function renderAuth() {
  $('#nav').hidden = true;
  $('#top-actions').hidden = true;
  document.body.classList.remove('with-nav');
  const signup = S.authMode === 'signup';
  const reset = S.authMode === 'reset';
  $('#view').innerHTML = `<div class="auth">
    <section class="hero auth-hero">
      <span class="pill-yellow">تحدٍّ يومي للعائلة</span>
      <h2>كل عادة يومية<br><em>تحدٍّ وتنافس!</em></h2>
      <ul class="perks">
        <li><b>🕋</b> الصلوات على وقتها، الأذكار، القرآن</li>
        <li><b>⭐</b> نقاط ومستويات وشارات</li>
        <li><b>🏆</b> ترتيب أسبوعي ومنصّة الأبطال</li>
        <li><b>✅</b> سجّل الدخول، ثم ينتظر حسابك قبول المشرف</li>
      </ul>
    </section>
    <div class="card" style="display:grid;gap:.8rem">
      ${S.google ? `<button class="btn google big" type="button" id="google">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        الدخول بحساب Google (الأسهل)</button>
      <div class="or">أو بالإيميل وكلمة السر</div>` : ''}
      ${reset ? '' : `<div class="seg two"><button type="button" data-mode="login" aria-pressed="${!signup}">دخول</button><button type="button" data-mode="signup" aria-pressed="${signup}">حساب جديد</button></div>`}
      <form id="auth-form" novalidate>
        ${signup ? '<label>اسمك<input id="a-name" maxlength="60" required autocomplete="name"></label>' : ''}
        <label>الإيميل<input id="a-email" type="email" required autocomplete="email" dir="ltr"></label>
        ${reset ? '' : `<label>كلمة السر<input id="a-pass" type="password" minlength="6" required autocomplete="${signup ? 'new-password' : 'current-password'}" dir="ltr"></label>`}
        <p class="error" id="a-err" hidden></p>
        <button class="btn big" type="submit">${reset ? 'إرسال رابط تغيير كلمة السر' : signup ? 'إنشاء الحساب' : 'دخول'}</button>
        ${reset ? '<button class="link small" type="button" data-mode="login">→ رجوع للدخول</button>' : signup ? '' : '<button class="link small" type="button" data-mode="reset">نسيت كلمة السر؟</button>'}
      </form>
    </div>
  </div>`;
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.authMode = b.dataset.mode; renderAuth(); }));
  $('#google')?.addEventListener('click', async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
    if (error) showErr(error);
  });
  const showErr = (e) => { $('#a-err').textContent = authError(e); $('#a-err').hidden = false; };
  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#a-email').value.trim();
    const btn = e.submitter || $('#auth-form button[type=submit]');
    btn.disabled = true;
    try {
      if (reset) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        toast('أرسلنا لك رابطًا على بريدك');
      } else if (signup) {
        const name = $('#a-name').value.trim();
        if (!name) throw new Error('الاسم إجباري');
        const password = $('#a-pass').value;
        const { data, error } = await sb.functions.invoke('signup', { body: { email, password, name } });
        if (error) {
          let msg = 'تعذّر إنشاء الحساب';
          try { msg = (await error.context.json()).error || msg; } catch {}
          throw new Error(msg);
        }
        if (!data?.ok) throw new Error('تعذّر إنشاء الحساب');
        const { error: e2 } = await sb.auth.signInWithPassword({ email, password });
        if (e2) throw e2;
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password: $('#a-pass').value });
        if (error) throw error;
      }
    } catch (err) {
      showErr(err);
    } finally {
      btn.disabled = false;
    }
  });
}

function renderNewPassword() {
  $('#view').innerHTML = `<div class="auth"><form class="card" id="np-form" style="display:grid;gap:.7rem">
    <h3>كلمة سر جديدة</h3>
    <label>كلمة السر<input id="np" type="password" minlength="6" required dir="ltr" autocomplete="new-password"></label>
    <p class="error" id="np-err" hidden></p>
    <button class="btn" type="submit">حفظ</button></form></div>`;
  $('#np-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: $('#np').value });
    if (error) { $('#np-err').textContent = authError(error); $('#np-err').hidden = false; return; }
    toast('تم تغيير كلمة السر');
    S.recovery = false;
    start();
  });
}

// ---------- تحميل البيانات ----------
async function loadMe() {
  const uid = S.session.user.id;
  let { data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  for (let i = 0; !data && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 600));
    ({ data } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle());
  }
  S.me = data;
}

async function loadMembers() {
  const { data } = await sb.from('members').select('id, name, joined_on, avatar_url').eq('account_id', S.me.id).order('id');
  S.members = data || [];
  S.memberId = S.members[0]?.id ?? null;
}

async function loadAll() {
  const [{ data: ch }, { data: logs }, { data: settings }] = await Promise.all([
    sb.from('challenges').select('*').order('sort').order('id'),
    S.memberId ? sb.from('habit_logs').select('challenge_id, day, item, created_at').eq('member_id', S.memberId) : Promise.resolve({ data: [] }),
    sb.from('app_settings').select('key, value'),
  ]);
  const set = Object.fromEntries((settings || []).map((x) => [x.key, x.value]));
  S.rules = typeof set.rules === 'string' ? set.rules : '';
  S.editDays = Math.max(1, Number(set.edit_days) || 2);
  S.perfectBonus = Number(set.perfect_bonus ?? 10) || 0;
  S.streakBonus = Number(set.streak_bonus ?? 10) || 0;
  S.challenges = (ch || []).map((c) => ({ ...c, kind: c.kind || 'daily' }));
  S.logs = logs || [];
  S.myLogs = new Set(S.logs.map((l) => key(l.challenge_id, l.day, l.item)));
  await loadRanks();
}

async function loadRanks() {
  const [all, week] = await Promise.all([
    sb.rpc('ranking2', { p_challenge: null, p_period: 'all' }),
    sb.rpc('ranking2', { p_challenge: null, p_period: 'week' }),
  ]);
  S.overall = ranked(all.data || []);
  S.week = ranked(week.data || []);
}

function ranked(rows) {
  const same = (a, b) => a.points === b.points && a.days === b.days && a.streak === b.streak;
  rows.forEach((r, i) => (r.rank = i && same(r, rows[i - 1]) ? rows[i - 1].rank : i + 1));
  return rows;
}
const meIn = (rows) => rows?.find((r) => r.member_id === S.memberId);

// ---------- حساب الإحصائيات محليًا ----------
// سلسلة مهمة يومية حتى اليوم (أو أمس إن لم يُكمَل اليوم بعد)
function streakOf(c, upTo = today()) {
  let d = isFull(c, upTo) ? upTo : addDays(upTo, -1);
  let s = 0;
  while (d >= c.start_date && isFull(c, d)) { s++; d = addDays(d, -1); }
  return s;
}
function bestRun(days) {
  const list = [...days].sort();
  let best = 0, run = 0, prev = null;
  for (const d of list) { run = prev && diff(prev, d) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}
// يوم مثالي: كل المهام اليومية المفتوحة في ذلك اليوم كاملة
function isPerfect(d) {
  const list = dailies(d);
  return list.length > 0 && list.every((c) => isFull(c, d));
}
function activeDays() { return new Set(S.logs.map((l) => l.day)); }
function activityStreak() {
  const days = activeDays();
  let d = days.has(today()) ? today() : addDays(today(), -1);
  let s = 0;
  while (days.has(d)) { s++; d = addDays(d, -1); }
  return s;
}

function badgeStats() {
  const fullDays = {};
  for (const c of S.challenges.filter((x) => x.kind === 'daily')) {
    fullDays[c.id] = new Set([...new Set(S.logs.filter((l) => l.challenge_id === c.id).map((l) => l.day))].filter((d) => isFull(c, d)));
  }
  const days = activeDays();
  const perfect = [...days].filter(isPerfect);
  const prayers = S.challenges.filter((c) => c.kind === 'daily' && nItems(c) >= 5);
  const once = S.challenges.filter((c) => c.kind === 'once' && onceDone(c));
  const o = meIn(S.overall);
  const w = meIn(S.week);
  return {
    activeDays: days.size,
    bestStreak: Math.max(0, ...Object.values(fullDays).map(bestRun)),
    perfectDays: perfect.length,
    bestPerfectRun: bestRun(perfect),
    hasPrayers: prayers.length > 0,
    prayRun: Math.max(0, ...prayers.map((c) => bestRun(fullDays[c.id] || []))),
    hasPdf: S.challenges.some((c) => c.kind === 'once' && c.pdf_url),
    hasVideo: S.challenges.some((c) => c.kind === 'once' && youtubeId(c.video_url)),
    pdfDone: once.filter((c) => c.pdf_url).length,
    videoDone: once.filter((c) => youtubeId(c.video_url)).length,
    points: o?.points || 0,
    weekRank: w?.points ? w.rank : 0,
  };
}
function badges() {
  const x = badgeStats();
  const kept = new Set((recall('badges:' + S.memberId) || '').split(',').filter(Boolean));
  return BADGES.filter((b) => !b.when || b.when(x) || kept.has(b.id)).map((b) => {
    const [cur, goal] = b.v(x);
    return { ...b, cur: Math.min(cur, goal), goal, got: cur >= goal || kept.has(b.id) };
  });
}
// الشارات والمستوى الجديدان منذ آخر مرة
function checkRewards() {
  if (!S.memberId) return;
  const k = 'badges:' + S.memberId;
  const stored = recall(k);
  const list = badges();
  const got = list.filter((b) => b.got).map((b) => b.id);
  if (stored !== null) {
    const before = new Set(stored.split(',').filter(Boolean));
    for (const b of list) if (b.got && !before.has(b.id)) celebrate({ icon: b.icon, title: `شارة جديدة: ${b.name}`, text: b.desc + ' — بارك الله فيك!' });
  }
  const keep = new Set([...(stored || '').split(',').filter(Boolean), ...got]);
  store(k, [...keep].join(','));
  const lk = 'level:' + S.memberId;
  const lv = level(meIn(S.overall)?.points || 0);
  const prev = Number(recall(lk) || 0);
  if (prev && lv.level > prev) celebrate({ icon: '⭐', title: `المستوى ${lv.level}: ${lv.title}!`, text: 'ارتقيت إلى مستوى جديد. واصل هكذا!' });
  store(lk, String(lv.level));
}

// ---------- الواجهة ----------
const editable = (c, d) => {
  const now = today();
  return d <= now && inRange(c, d) && (S.me.is_admin || diff(d, now) < S.editDays);
};
const openDays = () => Array.from({ length: Math.min(S.editDays, 7) }, (_, i) => addDays(today(), -i));

let players = [];
function cleanupPlayers() { players.forEach((p) => { clearInterval(p.timer); try { p.player?.destroy(); } catch {} }); players = []; }

async function render() {
  cleanupPlayers();
  if (!S.me.is_admin && S.me.status && S.me.status !== 'approved') return renderPending();
  document.querySelectorAll('#nav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.tab === S.tab)));
  $('#tab-admin').hidden = !S.me.is_admin;
  if (S.me.is_admin) sb.rpc('admin_accounts').then(({ data }) => {
    const n = (data || []).filter((a) => a.status === 'pending').length;
    $('#admin-dot').hidden = !n;
    $('#admin-dot').textContent = n || '';
  });
  const pendingQuests = quests().filter((c) => !onceDone(c) && (!c.end_date || c.end_date >= today())).length;
  $('#quest-dot').hidden = !pendingQuests;
  $('#quest-dot').textContent = pendingQuests || '';
  const v = $('#view');
  if (!S.members.length && S.tab !== 'admin' && S.tab !== 'rules') v.innerHTML = renderMembers();
  else if (S.tab === 'today') v.innerHTML = S.openId ? renderMonth(S.challenges.find((c) => c.id === S.openId)) : renderToday();
  else if (S.tab === 'quests') v.innerHTML = renderQuests();
  else if (S.tab === 'board') v.innerHTML = await renderBoard();
  else if (S.tab === 'me') v.innerHTML = renderMe();
  else if (S.tab === 'rules') v.innerHTML = renderRules();
  else v.innerHTML = await renderAdmin();
  bind();
  mountPlayers();
}

// كل حساب = مشارك واحد
const membersBar = () => '';

// حالة نادرة: حساب دون مشارك (يُنشأ عادةً تلقائيًا)
function renderMembers() {
  return `<form class="card" id="members-form" style="display:grid;gap:.8rem">
    <h2>👋 مرحبًا! ما اسمك في التحدّي؟</h2>
    <input id="new-member" maxlength="60" value="${esc(S.me.display_name || '')}" required>
    <button class="btn big" type="submit">ابدأ</button>
  </form>`;
}

const confirmBox = (top = false) => (S.pending && !!S.pending.top === top ? `<div class="confirm card warnbox"><span>${esc(S.pending.label)}</span>
  <button class="btn small" type="button" id="p-yes">تأكيد</button><button class="btn ghost small" type="button" id="p-no">إلغاء</button></div>` : '');

// بطاقة البطل: المستوى، النقاط، السلسلة، الترتيب
function heroCard() {
  const o = meIn(S.overall);
  const w = meIn(S.week);
  const pts = o?.points || 0;
  const lv = level(pts);
  const m = member();
  const flame = activityStreak();
  let chase = '';
  if (w && S.week.length > 1) {
    const above = S.week.filter((r) => r.points > w.points).sort((a, b) => a.points - b.points)[0];
    if (!w.points) chase = 'سجّل أول مهمة لتدخل ترتيب الأسبوع!';
    else if (above) chase = `ينقصك <b>${above.points - w.points + 1}</b> نقطة لتتجاوز ${esc(above.name)} 💪`;
    else chase = 'أنت في الصدارة هذا الأسبوع! حافظ عليها 👑';
  }
  return `<section class="hero">
    <div class="hero-top">
      <button class="av-btn" type="button" data-goto="me" aria-label="ملفي">${avatar(m?.id, m?.name, m?.avatar_url, 'lg')}</button>
      <div class="hero-who">
        <b>${esc(m?.name || '')}</b>
        <span class="lv-chip" style="--lv:${lv.color}">⭐ المستوى ${lv.level} · ${lv.title}</span>
      </div>
      <button class="hero-rank" type="button" data-goto="board">
        <span>${w?.points ? (w.rank <= 3 ? MEDALS[w.rank - 1] : '#' + w.rank) : '🏆'}</span><small>الأسبوع</small>
      </button>
    </div>
    <div class="hero-stats">
      <div><b class="num">${pts}</b><small>نقطة</small></div>
      <div><b class="num">${flame}<span class="flame ${flame ? 'on' : ''}">🔥</span></b><small>${flame === 1 ? 'يوم متتالٍ' : 'أيام متتالية'}</small></div>
      <div><b class="num">${badges().filter((b) => b.got).length}</b><small>شارة</small></div>
    </div>
    <div class="xp"><div class="xp-bar"><span style="width:${lv.pct}%"></span></div>
      <small>${lv.toGo} نقطة للمستوى ${lv.level + 1} (${lv.next})</small></div>
    ${chase ? `<p class="chase">${chase}</p>` : ''}
  </section>`;
}

function ring(done, total) {
  const pct = total ? done / total : 0;
  const r = 34, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
    <circle cx="40" cy="40" r="${r}" class="ring-bg"/>
    <circle cx="40" cy="40" r="${r}" class="ring-fg ${pct >= 1 ? 'full' : ''}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg><div class="ring-txt"><b>${Math.round(pct * 100)}%</b></div>`;
}

function renderToday() {
  const now = today();
  if (!S.day || !openDays().includes(S.day)) S.day = now;
  const d = S.day;
  const list = dailies(d);
  const q = quests().filter((c) => !onceDone(c) && (!c.end_date || c.end_date >= now));
  const total = list.reduce((t, c) => t + nItems(c), 0);
  const done = list.reduce((t, c) => t + Math.min(doneCount(c, d), nItems(c)), 0);
  const earned = list.reduce((t, c) => t + Math.min(doneCount(c, d), nItems(c)) * (c.points ?? 1), 0) + (isPerfect(d) ? S.perfectBonus : 0);
  const quote = QUOTES[diff('2026-01-01', now) % QUOTES.length];
  const days = openDays();
  return `${membersBar()}
    ${heroCard()}
    ${days.length > 1 ? `<div class="seg" style="grid-template-columns:repeat(${days.length},minmax(0,1fr))" role="group" aria-label="اليوم">${days
      .map((x, i) => `<button type="button" data-day="${x}" aria-pressed="${x === d}">${i === 0 ? 'اليوم' : i === 1 ? 'أمس' : `${dayName(x)} ${fmt(x)}`}${isPerfect(x) ? ' ✨' : ''}</button>`)
      .join('')}</div>` : ''}
    <section class="card today-card">
      <div class="ring-wrap">${ring(done, total)}</div>
      <div class="today-info">
        <h2>${d === now ? 'مهام اليوم' : `مهام ${d === addDays(now, -1) ? 'أمس' : fmt(d)}`}</h2>
        <p class="muted small" style="margin:0">${done}/${total} منجزة · <b class="good">+${earned}</b> نقطة</p>
        ${!list.length ? '' : isPerfect(d)
          ? `<span class="perfect-on">✨ يوم مثالي! +${S.perfectBonus} مكافأة</span>`
          : S.perfectBonus ? `<span class="perfect-hint">أكمل الكل لتربح <b>+${S.perfectBonus}</b> مكافأة اليوم المثالي</span>` : ''}
      </div>
    </section>
    ${!list.length ? `<div class="card empty"><div class="empty-ico">🌱</div><h3>لا توجد مهام يومية بعد</h3><p class="muted">${
      S.me.is_admin ? 'أضف أول مهمة من تبويب «الإدارة».' : 'ستظهر هنا المهام عندما يضيفها المشرف.'}</p></div>` : ''}
    <div class="tasks">${list.map((c) => taskCard(c, d)).join('')}</div>
    ${q.length ? `<button class="card quest-teaser" type="button" data-goto="quests">
      <span class="qt-ico">🎯</span><span><b>${q.length === 1 ? 'تحدٍّ خاص ينتظرك' : `${q.length} تحديات خاصة تنتظرك`}</b><small class="muted">قراءة، فيديو… نقاط إضافية!</small></span><span class="go">←</span></button>` : ''}
    <figure class="quote"><blockquote>${esc(quote[0])}</blockquote><figcaption>${esc(quote[1])}</figcaption></figure>
    <p class="muted small center">${S.editDays === 1 ? 'يمكن تسجيل اليوم فقط (حتى نصف الليل).' : `يمكن تسجيل آخر ${S.editDays} أيام.`} المكافآت: +${S.streakBonus} كل 7 أيام متتالية في مهمة.</p>`;
}

function weekDots(c, d) {
  return `<div class="wdots" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => addDays(d, i - 6))
    .map((x) => {
      const n = inRange(c, x) ? doneCount(c, x) : -1;
      return `<span class="wd ${n < 0 ? 'out' : n >= nItems(c) ? 'full' : n ? 'part' : ''} ${x === d ? 'cur' : ''}" title="${fmt(x)}"><i>${dayName(x)}</i></span>`;
    })
    .join('')}</div>`;
}

function videoBlock(c) {
  const id = youtubeId(c.video_url);
  if (!id) return '';
  if (!S.video?.[c.id]) return `<button class="btn ghost small" type="button" data-video="${c.id}">▶ مشاهدة الفيديو</button>`;
  return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1" title="${esc(c.title)}"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
    <button class="link small" type="button" data-video="${c.id}">إخفاء الفيديو</button>`;
}

function taskCard(c, d) {
  const n = doneCount(c, d);
  const N = nItems(c);
  const full = n >= N;
  const ok = editable(c, d);
  const st = streakOf(c, d);
  const toBonus = 7 - (st % 7);
  return `<section class="task ${full ? 'is-done' : ''}">
    <div class="task-head">
      <span class="task-ico">${esc(c.icon || '⭐')}</span>
      <button class="task-title" type="button" data-open="${c.id}">
        <b>${esc(c.title)}</b>
        <small><span class="pts">+${c.points ?? 1}${N > 1 ? ' لكل واحدة' : ''}</span>${st ? ` · <span class="streak">🔥 ${st}</span>` : ''}${st && S.streakBonus && toBonus < 7 ? ` · <span class="muted">${toBonus === 1 ? 'غدًا' : `بعد ${toBonus} أيام`} مكافأة +${S.streakBonus}</span>` : ''}</small>
      </button>
      ${N === 1 ? `<button class="check ${full ? 'on' : ''}" type="button" data-c="${c.id}" data-d="${d}" aria-pressed="${full}" aria-label="${esc(c.title)}" ${ok ? '' : 'disabled'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>` : `<span class="count ${full ? 'on' : ''}">${n}/${N}</span>`}
    </div>
    ${c.description ? `<p class="muted small desc">${esc(c.description)}</p>` : ''}
    ${N > 1 ? `<div class="items">${c.items
      .map((t, i) => {
        const on = S.myLogs.has(key(c.id, d, i));
        return `<button class="item ${on ? 'on' : ''}" type="button" data-ic="${c.id}" data-id="${d}" data-ii="${i}" aria-pressed="${on}" ${ok ? '' : 'disabled'}>${on ? '✓ ' : ''}${esc(t)}</button>`;
      })
      .join('')}</div>` : ''}
    ${videoBlock(c)}
    ${weekDots(c, d)}
  </section>`;
}

// ---------- التحديات الخاصة (مرة واحدة) ----------
function questState(c) {
  const vid = youtubeId(c.video_url);
  const watched = Number(sessionStorage.getItem(`w:${S.memberId}:${c.id}`) || 0);
  const opened = sessionStorage.getItem(`o:${S.memberId}:${c.id}`) === '1';
  const needVideo = !!vid && watched < 1;
  const needPdf = !!c.pdf_url && !opened;
  const quiz = c.quiz?.q && Array.isArray(c.quiz.choices) && c.quiz.choices.length > 1 ? c.quiz : null;
  const quizOk = !quiz || S.quiz[c.id] === 'ok';
  return { vid, watched, opened, needVideo, needPdf, quiz, quizOk, ready: !needVideo && !needPdf && quizOk };
}

function renderQuests() {
  const now = today();
  const list = quests();
  const open = list.filter((c) => !onceDone(c) && (!c.end_date || c.end_date >= now));
  const done = list.filter(onceDone);
  const missed = list.filter((c) => !onceDone(c) && c.end_date && c.end_date < now);
  const card = (c) => {
    const st = questState(c);
    const isDone = onceDone(c);
    const left = c.end_date ? diff(now, c.end_date) : null;
    const type = st.vid ? '🎬 فيديو' : c.pdf_url ? '📄 قراءة' : '✅ مهمة';
    const expanded = S.quest === c.id && !isDone;
    return `<section class="quest ${isDone ? 'is-done' : ''}">
      <button class="quest-head" type="button" data-quest="${c.id}" aria-expanded="${expanded}" ${isDone ? 'disabled' : ''}>
        <span class="task-ico">${esc(c.icon || '🎯')}</span>
        <span class="quest-info"><b>${esc(c.title)}</b>
          <small><span class="tag-type">${type}</span> <span class="pts">+${c.points ?? 1}</span>${
            isDone ? ' · <span class="good">✓ أنجزت</span>' : left !== null ? ` · <span class="${left <= 1 ? 'urgent' : 'muted'}">⏳ ${left === 0 ? 'آخر يوم!' : left === 1 ? 'ينتهي غدًا' : `باقي ${left} أيام`}</span>` : ''}</small></span>
        <span class="go">${isDone ? '🏅' : expanded ? '▲' : '▼'}</span>
      </button>
      ${expanded ? `<div class="quest-body">
        ${c.description ? `<p class="small" style="margin:0">${esc(c.description)}</p>` : ''}
        ${st.vid ? `<div class="qstep ${st.needVideo ? '' : 'ok'}"><b>${st.needVideo ? '1' : '✓'}</b> شاهد الفيديو حتى آخره</div>
          <div class="video"><div id="yt-${c.id}" data-yt="${st.vid}" data-cid="${c.id}"></div></div>
          <div class="watch"><div class="xp-bar"><span id="wp-${c.id}" style="width:${Math.round(st.watched * 100)}%"></span></div><small id="wt-${c.id}">${Math.round(st.watched * 100)}% مشاهَد</small></div>` : ''}
        ${c.pdf_url ? `<div class="qstep ${st.needPdf ? '' : 'ok'}"><b>${st.needPdf ? (st.vid ? '2' : '1') : '✓'}</b> اقرأ الملف</div>
          <a class="btn ghost" href="${esc(c.pdf_url)}" target="_blank" rel="noopener" data-pdf="${c.id}">📄 افتح الملف للقراءة</a>` : ''}
        ${st.quiz ? `<div class="qstep ${st.quizOk ? 'ok' : ''}"><b>${st.quizOk ? '✓' : '؟'}</b> ${esc(st.quiz.q)}</div>
          <div class="choices">${st.quiz.choices
            .map((t, i) => `<button class="choice ${S.quiz[c.id] === 'ok' && i === Number(st.quiz.answer) ? 'right' : S.quiz[c.id] === 'no' + i ? 'wrong' : ''}" type="button"
              data-qc="${c.id}" data-qi="${i}" ${st.needVideo || st.needPdf || st.quizOk ? 'disabled' : ''}>${esc(t)}</button>`)
            .join('')}</div>
          ${String(S.quiz[c.id] || '').startsWith('no') ? '<p class="error small">ليست الإجابة الصحيحة، راجع وحاول مرة أخرى.</p>' : ''}` : ''}
        <button class="btn big ${st.ready ? 'yellow' : ''}" type="button" data-qdone="${c.id}" ${st.ready ? '' : 'disabled'}>${st.ready ? `🎉 أنجزت! (+${c.points ?? 1})` : '🔒 أكمل الخطوات أولًا'}</button>
      </div>` : ''}
    </section>`;
  };
  return `${membersBar()}
    <section class="banner">
      <div><span class="pill-yellow">تحديات خاصة</span><h2>اقرأ، شاهد، وأنجز!</h2><p>كل تحدٍّ يُنجز مرة واحدة ويضيف نقاطًا لترتيبك.</p></div>
      <span class="banner-ico">🎯</span>
    </section>
    ${open.length ? open.map(card).join('') : `<div class="card empty"><div class="empty-ico">${list.length ? '🏅' : '🎯'}</div><h3>${
      list.length ? 'أنهيت كل التحديات الحالية!' : 'لا توجد تحديات خاصة الآن'}</h3><p class="muted">${S.me.is_admin ? 'أضف تحدّي قراءة أو فيديو من «الإدارة».' : 'ترقّب الجديد قريبًا.'}</p></div>`}
    ${done.length ? `<h3 class="sec">✓ أنجزتها (${done.length})</h3>${done.map(card).join('')}` : ''}
    ${missed.length ? `<h3 class="sec muted">انتهى وقتها</h3>${missed.map((c) => `<div class="quest missed"><div class="quest-head"><span class="task-ico">${esc(c.icon || '🎯')}</span><span class="quest-info"><b>${esc(c.title)}</b><small class="muted">انتهى في ${fmt(c.end_date)}</small></span></div></div>`).join('')}` : ''}`;
}

// مشغّل يوتيوب يحسب الوقت المشاهَد فعلًا (القفز لا يُحتسب)
function loadYT() {
  if (window.YT?.Player) return Promise.resolve();
  if (!loadYT.p) {
    loadYT.p = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = resolve;
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return loadYT.p;
}
async function mountPlayers() {
  const els = [...document.querySelectorAll('[data-yt]')];
  if (!els.length) return;
  await loadYT();
  for (const el of els) {
    if (!document.body.contains(el)) continue;
    const cid = Number(el.dataset.cid);
    const k = `w:${S.memberId}:${cid}`;
    const entry = { player: null, timer: null };
    let seen = 0, last = null;
    entry.player = new YT.Player(el.id, {
      videoId: el.dataset.yt,
      playerVars: { rel: 0, playsinline: 1, modestbranding: 1 },
      events: {
        onReady: () => {
          entry.timer = setInterval(() => {
            const p = entry.player;
            if (!p?.getPlayerState || p.getPlayerState() !== 1) { last = null; return; }
            const t = p.getCurrentTime();
            if (last !== null && t > last && t - last < 2.5) seen += t - last;
            last = t;
            const dur = p.getDuration() || 1;
            const prev = Number(sessionStorage.getItem(k) || 0);
            const frac = Math.min(1, Math.max(prev, seen / (dur * 0.85)));
            sessionStorage.setItem(k, String(frac));
            const bar = document.getElementById('wp-' + cid);
            if (bar) bar.style.width = Math.round(frac * 100) + '%';
            const txt = document.getElementById('wt-' + cid);
            if (txt) txt.textContent = Math.round(frac * 100) + '% مشاهَد';
            if (frac >= 1 && prev < 1) { toast('أحسنت! أكملت مشاهدة الفيديو 👏'); FX.chime(); render(); }
          }, 1000);
        },
      },
    });
    players.push(entry);
  }
}

// ---------- الترتيب ----------
async function renderBoard() {
  const list = S.challenges.filter((c) => c.active && c.start_date <= today());
  if (S.boardId && !list.some((c) => c.id === S.boardId)) S.boardId = 0;
  const c = list.find((x) => x.id === S.boardId);
  const { data, error } = await sb.rpc('ranking2', { p_challenge: c ? c.id : null, p_period: S.period });
  if (error) return `<div class="card error">${esc(error.message)}</div>`;
  const rows = ranked(data || []);
  const top = rows.filter((r) => r.points > 0).slice(0, 3);
  const place = (r, cls) => r ? `<div class="place ${cls} ${r.is_mine && r.member_id === S.memberId ? 'mine' : ''}">
      <span class="crown">${cls === 'first' ? '👑' : ''}</span>
      ${avatar(r.member_id, r.name, r.avatar_url)}
      <span class="pname">${esc(r.name)}</span>
      <span class="ppts">${r.points} <span>نقطة</span></span>
      <span class="step">${MEDALS[r.rank - 1] || r.rank}</span>
    </div>` : '<div class="place empty-place"></div>';
  return `<div class="board-filters">
      <div class="seg" role="group" aria-label="الفترة">${Object.entries(PERIODS)
        .map(([k, t]) => `<button type="button" data-period="${k}" aria-pressed="${k === S.period}">${t}</button>`)
        .join('')}</div>
      <div class="scroller" role="group" aria-label="المهمة">
        <button class="pill" type="button" data-board="0" aria-pressed="${!c}"><span>🏆</span>الكل</button>
        ${list.map((x) => `<button class="pill" type="button" data-board="${x.id}" aria-pressed="${x.id === S.boardId}"><span>${esc(x.icon || '⭐')}</span>${esc(x.title)}</button>`).join('')}
      </div>
    </div>
    <div class="board-title">
      <h2>${c ? `${esc(c.icon || '⭐')} أبطال ${esc(c.title)}` : '🏆 الترتيب العام'}</h2>
      <span class="small muted">${PERIODS[S.period]} · ${plural(rows.length, 'مشارك واحد', 'مشاركان', 'مشاركين', 'مشاركًا')}</span>
    </div>
    ${top.length ? `<div class="podium">${place(top[1], 'second')}${place(top[0], 'first')}${place(top[2], 'third')}</div>`
      : '<div class="card empty"><div class="empty-ico">🏁</div><h3>السباق لم يبدأ بعد</h3><p class="muted">لم يجمع أحد نقاطًا في هذه الفترة. كن الأول! 💪</p></div>'}
    <div class="lb">
      <div class="lb-row lb-head"><span>#</span><span>مستوى</span><span>المشارك</span><span>النقاط</span></div>
      ${rows
        .map((r) => {
          // المستوى دائمًا من مجموع النقاط منذ البداية
          const lv = level(S.overall.find((o) => o.member_id === r.member_id)?.points ?? r.points);
          const mine = r.member_id === S.memberId;
          return `<div class="lb-row ${mine ? 'mine' : r.is_mine ? 'family' : ''}">
            <span class="lb-rank">${r.points && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank}</span>
            <span class="star" style="--star:${lv.color}" title="${lv.title}"><b>${lv.level}</b></span>
            <span class="lb-who">${avatar(r.member_id, r.name, r.avatar_url, 'sm')}
              <span class="lb-info"><span class="lb-name">${esc(r.name)}${mine ? ' <span class="tag">أنت</span>' : r.is_mine ? ' <span class="tag soft">عائلتي</span>' : ''}</span>
                <small class="lb-meta">${lv.title}${r.streak ? ` · 🔥 ${r.streak}` : ''}${!c && r.perfect ? ` · ✨ ${r.perfect}` : ''}${r.bonus ? ` · 🎁 +${r.bonus}` : ''}</small></span></span>
            <span class="lb-total"><b>${r.points}</b><small>نقطة</small></span>
          </div>`;
        })
        .join('')}
    </div>
    <p class="muted small center">🔥 السلسلة الحالية · ✨ أيام مثالية · 🎁 نقاط المكافآت</p>`;
}

// ---------- إنجازاتي ----------
function renderMe() {
  const o = meIn(S.overall);
  const pts = o?.points || 0;
  const lv = level(pts);
  const list = badges();
  const got = list.filter((b) => b.got).length;
  const x = badgeStats();
  return `${profileCard()}
    ${heroCard()}
    <section class="card" style="display:grid;gap:.7rem">
      <div class="row"><h2>🎖️ الشارات</h2><span class="pill-yellow sm">${got}/${list.length}</span></div>
      <div class="badges">${list
        .map((b) => `<div class="badge ${b.got ? 'got' : ''}" title="${esc(b.desc)}">
          <span class="b-ico">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
          ${b.got ? '<span class="b-ok">✓</span>' : `<span class="b-prog"><span style="width:${Math.round((b.cur / b.goal) * 100)}%"></span></span><small class="b-num">${b.cur}/${b.goal}</small>`}
        </div>`)
        .join('')}</div>
    </section>
    <section class="card" style="display:grid;gap:.6rem">
      <h2>📈 إحصائياتي</h2>
      <div class="kpis">
        <div class="kpi"><b>${x.bestStreak}</b><small>أطول سلسلة 🔥</small></div>
        <div class="kpi"><b>${x.perfectDays}</b><small>يوم مثالي ✨</small></div>
        <div class="kpi"><b>${x.activeDays}</b><small>يوم نشاط</small></div>
        <div class="kpi"><b>${o?.bonus || 0}</b><small>نقاط مكافآت 🎁</small></div>
      </div>
    </section>
    <section class="card" style="display:grid;gap:.6rem">
      <h2>🪜 سلّم المستويات</h2>
      <div class="ladder">${LEVEL_TITLES.map((t, i) => `<div class="rung ${i + 1 < lv.level ? 'past' : i + 1 === lv.level ? 'now' : ''}" style="--lv:${LEVEL_COLORS[i]}">
        <span class="star" style="--star:${LEVEL_COLORS[i]}"><b>${i + 1}</b></span><b>${t}</b><small>${levelStart(i + 1)}+ نقطة</small></div>`).join('')}</div>
    </section>
`;
}

// ملفي: الصورة والاسم
function profileCard() {
  const m = member();
  return `<form class="card profile" id="profile-form">
    <label class="photo" title="تغيير الصورة">
      ${avatar(m?.id, m?.name, m?.avatar_url, 'xl')}
      <span class="photo-cam">📷</span>
      <input type="file" id="photo" accept="image/*" hidden>
    </label>
    <div class="profile-fields">
      <label>اسمك في الترتيب<input id="pf-name" maxlength="60" value="${esc(m?.name || S.me.display_name)}" required></label>
      <div class="row nowrap"><button class="btn small" type="submit">حفظ</button>
        ${m?.avatar_url ? '<button class="btn danger small" type="button" id="photo-del">حذف الصورة</button>' : '<span class="small muted">اضغط على الصورة لتغييرها</span>'}</div>
    </div>
  </form>`;
}

// تصغير الصورة إلى مربّع 320×320 (JPEG) قبل الرفع
async function squareJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    // قصّ في الوسط، مع ميل للأعلى (الوجه عادةً في الأعلى)
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) / 3);
    c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 320, 320);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function uploadPhoto(file) {
  const m = member();
  if (!m) return;
  if (!/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name)) return toast('اختر صورة.', true);
  toast('جاري رفع الصورة…');
  let blob;
  try { blob = await squareJpeg(file); } catch { return toast('تعذّرت قراءة الصورة. جرّب صورة JPG أو PNG.', true); }
  const path = `${S.me.id}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) return toast('تعذّر رفع الصورة.', true);
  const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const old = m.avatar_url;
  const { error: e2 } = await sb.from('members').update({ avatar_url: url }).eq('id', m.id);
  if (e2) return toast('تعذّر الحفظ.', true);
  m.avatar_url = url;
  // حذف الصورة القديمة إن كانت في مجلّدنا
  const prefix = '/avatars/' + S.me.id + '/';
  if (old && old.includes(prefix)) sb.storage.from('avatars').remove([old.slice(old.indexOf(prefix) + 9)]);
  await loadRanks();
  toast('تم تحديث صورتك 📸');
  render();
}

function renderRules() {
  const text = S.rules.trim();
  return `<div class="card rules" style="display:grid;gap:.7rem">
      <h2>📜 القانون</h2>
      ${text ? `<div class="rules-text">${esc(text)}</div>` : `<p class="muted">${S.me.is_admin ? 'لم تكتب القانون بعد. اكتبه هنا ليراه كل المشاركين.' : 'لم يُكتب القانون بعد.'}</p>`}
    </div>
    <div class="card" style="display:grid;gap:.4rem">
      <h3>⭐ كيف تُحسب النقاط؟</h3>
      <ul class="how">
        <li>كل مهمة منجزة: نقاطها (الصلوات: لكل صلاة).</li>
        <li>✨ يوم مثالي (كل المهام اليومية): <b>+${S.perfectBonus}</b>.</li>
        <li>🔥 كل 7 أيام متتالية في نفس المهمة: <b>+${S.streakBonus}</b>.</li>
        <li>🎯 التحديات الخاصة (قراءة، فيديو): نقاطها مرة واحدة.</li>
        <li>🪜 المستوى يرتفع كلما جمعت نقاطًا أكثر.</li>
      </ul>
    </div>
    ${S.me.is_admin ? `<form class="card" id="rules-form" style="display:grid;gap:.6rem">
      <h3>تعديل القانون (المشرف)</h3>
      <textarea id="rules-text" rows="10" maxlength="10000" placeholder="1. تُسجَّل الصلاة في وقتها.&#10;2. الصدق في التسجيل.&#10;3. …">${esc(S.rules)}</textarea>
      <div class="row"><button class="btn" type="submit">حفظ القانون</button></div></form>` : ''}`;
}

// تقدّم المشارك في مهمة طيلة الشهر
function renderMonth(c) {
  if (!c) { S.openId = null; return renderToday(); }
  const now = today();
  const month = S.detMonth || now.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const count = new Date(y, m, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => `${month}-${pad(i + 1)}`);
  const blanks = (parse(days[0]).getDay() + 6) % 7;
  const n = nItems(c);
  const from = [days[0], c.start_date, member()?.joined_on || days[0]].sort().pop();
  const to = [days[count - 1], now, c.end_date || '9999-12-31'].sort()[0];
  const elapsed = to < from ? 0 : diff(from, to) + 1;
  let full = 0, items = 0, best = 0, run = 0;
  for (const d of days) {
    const k = doneCount(c, d);
    items += k;
    if (k >= n) { full++; run++; best = Math.max(best, run); } else run = 0;
  }
  const pct = elapsed ? Math.round((full / elapsed) * 100) : 0;
  const sel = n > 1 && days.includes(S.sel[c.id]) ? S.sel[c.id] : null;
  return `<div class="row"><button class="btn ghost small" type="button" id="back-today">→ رجوع</button></div>
    <section class="card month" style="display:grid;gap:.8rem">
      <h2>${esc(c.icon || '⭐')} ${esc(c.title)}</h2>
      <div class="weeknav">
        <button class="btn ghost small" type="button" data-mnav="-1">→ السابق</button>
        <b>${MONTH_NAMES[m - 1]} ${y}</b>
        <button class="btn ghost small" type="button" data-mnav="1" ${month >= now.slice(0, 7) ? 'disabled' : ''}>التالي ←</button>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${items * (c.points ?? 1)}</b><small>نقطة هذا الشهر</small></div>
        <div class="kpi"><b>${full}<small class="muted">/${elapsed}</small></b><small>يوم كامل</small></div>
        <div class="kpi"><b>${pct}%</b><small>المواظبة</small></div>
        <div class="kpi"><b>${best} 🔥</b><small>أطول سلسلة</small></div>
      </div>
      <div class="xp-bar green"><span style="width:${pct}%"></span></div>
      <div class="cal">
        ${DAYS.map((d) => `<span class="cal-h">${d}</span>`).join('')}
        ${'<span></span>'.repeat(blanks)}
        ${days
          .map((d) => {
            const k = doneCount(c, d);
            const out = d > now || !inRange(c, d);
            const ok = !out && (editable(c, d) || n > 1);
            return `<button type="button" class="mcell ${k >= n ? 'done' : k ? 'part' : ''} ${out ? 'out' : ''} ${d === now ? 'today' : ''} ${d === sel ? 'sel' : ''}"
              data-mc="${c.id}" data-d="${d}" ${ok ? '' : 'disabled'}><b>${Number(d.slice(8))}</b>${n > 1 && k && k < n ? `<small>${k}/${n}</small>` : k >= n ? '<small>✓</small>' : ''}</button>`;
          })
          .join('')}
      </div>
      ${sel ? `<div class="items"><span class="small muted">${fmt(sel)}:</span>${c.items
        .map((t, i) => {
          const on = S.myLogs.has(key(c.id, sel, i));
          return `<button class="item ${on ? 'on' : ''}" type="button" data-ic="${c.id}" data-id="${sel}" data-ii="${i}" aria-pressed="${on}" ${editable(c, sel) ? '' : 'disabled'}>${on ? '✓ ' : ''}${esc(t)}</button>`;
        })
        .join('')}</div>` : n > 1 ? '<p class="muted small" style="margin:0">اضغط على يوم لترى التفاصيل.</p>' : ''}
      <p class="muted small" style="margin:0"><span class="lg-full"></span> يوم كامل · <span class="lg-part"></span> ناقص · <span class="lg-none"></span> لم يُسجَّل</p>
    </section>`;
}

// ---------- الإدارة ----------
function challengeForm(c) {
  const quiz = c.quiz || {};
  const kind = c.kind || 'daily';
  return `<form class="card" id="ch-form" style="display:grid;gap:.75rem">
    <h2>${c.id ? 'تعديل المهمة' : 'مهمة جديدة'}</h2>
    <div class="seg two" role="radiogroup" aria-label="النوع">
      <button type="button" data-kind="daily" aria-pressed="${kind === 'daily'}">🔁 يومية</button>
      <button type="button" data-kind="once" aria-pressed="${kind === 'once'}">🎯 تحدٍّ خاص (مرة)</button>
    </div>
    <div class="grid2">
      <label>الرمز<input id="f-icon" maxlength="16" value="${esc(c.icon || '')}" placeholder="${kind === 'daily' ? '🕌' : '📄'}"></label>
      <label>العنوان<input id="f-title" maxlength="80" value="${esc(c.title || '')}" placeholder="${kind === 'daily' ? 'سنّة الفجر' : 'قراءة: فضل الصلاة'}" required></label>
    </div>
    <label>الوصف (اختياري)<input id="f-desc" maxlength="300" value="${esc(c.description || '')}" placeholder="متى تُعتبر المهمة منجزة؟"></label>
    <div class="grid2">
      <label>النقاط${kind === 'daily' ? ((c.items || []).length ? ' لكل عنصر' : ' لكل يوم') : ''}<input type="number" id="f-points" min="0" max="1000" value="${c.points ?? 5}" required></label>
      ${kind === 'daily' ? `<label>العناصر (اختياري، كل عنصر في سطر)<textarea id="f-items" rows="3" placeholder="الصبح&#10;الظهر&#10;العصر&#10;المغرب&#10;العشاء">${esc((c.items || []).join('\n'))}</textarea></label>` : '<span></span>'}
    </div>
    <label>رابط فيديو يوتيوب (اختياري)${kind === 'once' ? ' — يجب مشاهدته حتى آخره' : ''}<input id="f-video" maxlength="300" dir="ltr" value="${esc(c.video_url || '')}" placeholder="https://www.youtube.com/watch?v=…"></label>
    ${kind === 'once' ? `<fieldset class="box"><legend>📄 ملف PDF للقراءة (اختياري)</legend>
        <label>الرابط<input id="f-pdf" maxlength="500" dir="ltr" value="${esc(c.pdf_url || '')}" placeholder="https://…pdf"></label>
        <label>أو ارفع الملف<input id="f-pdf-file" type="file" accept="application/pdf"></label>
      </fieldset>
      <fieldset class="box"><legend>❓ سؤال للتأكّد من القراءة/المشاهدة (اختياري)</legend>
        <label>السؤال<input id="f-q" maxlength="200" value="${esc(quiz.q || '')}" placeholder="ما هي الصلاة الوسطى؟"></label>
        <label>الاختيارات (كل اختيار في سطر)<textarea id="f-choices" rows="3">${esc((quiz.choices || []).join('\n'))}</textarea></label>
        <label>رقم الإجابة الصحيحة<input id="f-answer" type="number" min="1" max="6" value="${(Number(quiz.answer) || 0) + 1}"></label>
      </fieldset>` : ''}
    <div class="grid2">
      <label>البداية<input type="date" id="f-start" value="${esc(c.start_date || today())}" required></label>
      <label>${kind === 'once' ? 'آخر أجل (اختياري)' : 'النهاية (اختياري)'}<input type="date" id="f-end" value="${esc(c.end_date || '')}"></label>
    </div>
    <label class="checkline"><input type="checkbox" id="f-active" ${c.active !== false ? 'checked' : ''}> مفتوحة للمشاركين</label>
    <div class="row"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" id="f-cancel">إلغاء</button></div>
  </form>`;
}

async function renderAdmin() {
  if (!S.me.is_admin) return '';
  if (S.editing) return challengeForm(S.editing);
  const now = today();
  const c = S.challenges.find((x) => x.id === S.detailId) || S.challenges[0];
  let details = '';
  if (c) {
    S.detailId = c.id;
    const month = S.month || now.slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${pad(i + 1)}`);
    const [{ data: people }, { data: logs }, { data: board }] = await Promise.all([
      sb.from('members').select('id, name, profiles(display_name)'),
      sb.from('habit_logs').select('member_id, day, item, created_at').eq('challenge_id', c.id).gte('day', days[0]).lte('day', days[days.length - 1]),
      sb.rpc('ranking2', { p_challenge: c.id, p_period: 'all' }),
    ]);
    const rows = ranked(board || []);
    const byUser = {};
    for (const l of logs || []) {
      const cell = ((byUser[l.member_id] ??= {})[l.day] ??= { items: [], at: l.created_at });
      cell.items.push(l.item);
      if (l.created_at > cell.at) cell.at = l.created_at;
    }
    const account = Object.fromEntries((people || []).map((p) => [p.id, p.profiles?.display_name || '']));
    const avg = rows.length ? Math.round((rows.reduce((t, r) => t + (r.total ? r.days / r.total : 0), 0) / rows.length) * 100) : 0;
    details = `<div class="card" style="display:grid;gap:.7rem">
        <h2>📊 التفاصيل</h2>
        <div class="grid2">
          <label>المهمة<select id="d-c">${S.challenges.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.icon || '⭐')} ${esc(x.title)}</option>`).join('')}</select></label>
          <label>الشهر<input type="month" id="d-month" value="${month}"></label>
        </div>
        <div class="kpis">
          <div class="kpi"><b>${rows.length}</b><small>مشارك</small></div>
          <div class="kpi"><b>${Object.keys(byUser).length}</b><small>سجّل هذا الشهر</small></div>
          <div class="kpi"><b>${rows.filter((r) => !r.points).length}</b><small>لم يسجّل أبدًا</small></div>
          <div class="kpi"><b>${avg}%</b><small>متوسط المواظبة</small></div>
        </div>
        ${confirmBox()}
        <p class="muted small" style="margin:0">✓ = يوم منجز (مرّر على الخانة لترى وقت التسجيل). اضغط على خانة لتصحيح يوم لأي مشارك.</p>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th class="name">الاسم</th>${days.map((d) => `<th class="${d === now ? 'today' : ''}">${Number(d.slice(8))}</th>`).join('')}<th>الشهر</th><th>النقاط</th><th>الإجمالي</th><th>🔥</th></tr></thead>
        <tbody>${rows
          .map((r) => {
            const mine = byUser[r.member_id] || {};
            const pct = r.total ? Math.round((r.days / r.total) * 100) : 0;
            return `<tr><td class="name">${r.points && r.rank <= 3 ? MEDALS[r.rank - 1] : r.rank} ${esc(r.name)}${account[r.member_id] && account[r.member_id] !== r.name ? ` <span class="small muted">(${esc(account[r.member_id])})</span>` : ''}</td>${days
              .map((d) => {
                const out = d > now || !inRange(c, d);
                const cell = mine[d];
                const k = cell?.items.length || 0;
                const full = k >= nItems(c);
                const at = cell ? new Date(cell.at).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis' }) : '';
                const what = cell && c.items ? ' — ' + cell.items.map((i) => c.items[i]).join('، ') : '';
                return `<td class="cell ${full ? 'done' : k ? 'part' : ''} ${out ? 'out' : ''}" title="${at ? esc('سُجّل في ' + at + what) : fmt(d)}" ${
                  out ? '' : `data-u="${r.member_id}" data-d="${d}" data-n="${esc(r.name)}" data-full="${full}"`}>${full ? '✓' : k ? `${k}/${nItems(c)}` : ''}</td>`;
              })
              .join('')}<td><b>${Object.values(mine).filter((x) => x.items.length >= nItems(c)).length}</b></td><td>⭐ ${r.points}</td><td>${r.days}/${r.total} · ${pct}%</td><td>${r.streak}</td></tr>`;
          })
          .join('')}</tbody></table></div>`;
  }
  const titles = new Set(S.challenges.map((x) => x.title.trim()));
  const { data: accounts } = await sb.rpc('admin_accounts');
  const acc = accounts || [];
  const waiting = acc.filter((a) => a.status === 'pending');
  const others = acc.filter((a) => a.status !== 'pending');
  const accRow = (a) => `<div class="acc ${a.status}">
      ${avatar(a.member_id || 0, a.member_name || a.display_name, a.avatar_url, 'sm')}
      <div class="acc-info"><b>${esc(a.member_name || a.display_name)}</b>
        <small class="muted" dir="ltr">${esc(a.email || '')}</small>
        <small class="muted">${a.provider === 'google' ? 'Google' : 'إيميل'} · ${new Date(a.created_at).toLocaleDateString('fr-TN')}${a.status === 'rejected' ? ' · <span class="urgent">مرفوض</span>' : ''}</small></div>
      <div class="row nowrap">${a.status !== 'approved' ? `<button class="btn small" type="button" data-acc="${a.id}" data-st="approved">✓ قبول</button>` : ''}
        ${a.status !== 'rejected' && !(a.id === S.me.id) ? `<button class="btn danger small" type="button" data-acc="${a.id}" data-st="rejected">${a.status === 'approved' ? 'إيقاف' : 'رفض'}</button>` : ''}</div>
    </div>`;
  const link = inviteLink();
  return `${confirmBox(true)}
    <div class="card" style="display:grid;gap:.6rem">
      <div class="row"><h2>🙋 طلبات الانضمام</h2>${waiting.length ? `<span class="tag">${waiting.length}</span>` : ''}</div>
      ${waiting.length ? waiting.map(accRow).join('') : '<p class="muted small" style="margin:0">لا توجد طلبات جديدة.</p>'}
      ${others.length ? `<details><summary class="small">كل الحسابات (${others.length})</summary>${others.map(accRow).join('')}</details>` : ''}
    </div>
    <div class="card invite" style="display:grid;gap:.6rem">
      <h2>🔗 رابط الدخول</h2>
      <p class="muted small" style="margin:0">أرسله للمشاركين: يدخلون بـ Google أو بالإيميل، ثم تقبلهم من هنا.</p>
      <div class="link-box" dir="ltr">${esc(link)}</div>
      <div class="row">
        <button class="btn small" type="button" id="copy-link">📋 نسخ</button>
        <a class="btn small wa" href="https://wa.me/?text=${encodeURIComponent('انضمّ إلى تحدّي «صناعة العادات» 🌙✨: الصلوات على وقتها، الأذكار، القرآن… نقاط وشارات وترتيب!\n' + link)}" target="_blank" rel="noopener">واتساب</a>
        <button class="btn ghost small" type="button" id="show-qr">▦ رمز QR</button>
      </div>
      ${S.showQr ? `<div class="qr">${qrSvg(link)}</div>` : ''}
    </div>
    <div class="card" style="display:grid;gap:.6rem">
      <div class="row"><h2>📋 المهام</h2><div class="row"><button class="btn small" type="button" data-add="daily">+ يومية</button><button class="btn small yellow" type="button" data-add="once">+ تحدٍّ خاص</button></div></div>
      ${S.challenges
        .map((x, i) => `<div class="admin-task">
            <span class="task-ico">${esc(x.icon || '⭐')}</span>
            <div style="min-width:0"><b>${esc(x.title)}</b> ${x.active ? '' : '<span class="tag soft">متوقفة</span>'}
              <div class="small muted">${x.kind === 'once' ? '🎯 مرة واحدة' : '🔁 يومية'} · ⭐ ${x.points ?? 1}${x.items ? ` لكل عنصر (${x.items.length})` : ''}${x.pdf_url ? ' · 📄' : ''}${youtubeId(x.video_url) ? ' · 🎬' : ''}${x.quiz?.q ? ' · ❓' : ''} · من ${fmt(x.start_date)}${x.end_date ? ` إلى ${fmt(x.end_date)}` : ''}</div></div>
            <div class="row nowrap">
              <button class="icon-btn sm" type="button" data-move="${x.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="إلى الأعلى">▲</button>
              <button class="icon-btn sm" type="button" data-move="${x.id}" data-dir="1" ${i < S.challenges.length - 1 ? '' : 'disabled'} aria-label="إلى الأسفل">▼</button>
              <button class="btn ghost small" type="button" data-edit="${x.id}">تعديل</button>
              <button class="btn danger small" type="button" data-del="${x.id}">حذف</button></div>
          </div>`)
        .join('') || '<p class="muted">لا توجد مهام بعد.</p>'}
    </div>
    <div class="card" style="display:grid;gap:.6rem">
      <h3>⚡ إضافة سريعة</h3>
      <div class="chips">${TEMPLATES.map((t, i) => `<button class="pill" type="button" data-tpl="${i}" ${titles.has(t.title) ? 'disabled' : ''}>${t.icon} ${esc(t.title)}${titles.has(t.title) ? ' ✓' : ''}</button>`).join('')}</div>
    </div>
    <form class="card" id="settings-form" style="display:grid;gap:.7rem">
      <h3>⚙️ القواعد والمكافآت</h3>
      <label>مدّة تعمير اليوم<select id="edit-days">${Object.entries(WINDOWS)
        .map(([k, t]) => `<option value="${k}" ${Number(k) === S.editDays ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></label>
      <div class="grid2">
        <label>✨ مكافأة اليوم المثالي<input type="number" id="perfect-bonus" min="0" max="1000" value="${S.perfectBonus}"></label>
        <label>🔥 مكافأة كل 7 أيام متتالية<input type="number" id="streak-bonus" min="0" max="1000" value="${S.streakBonus}"></label>
      </div>
      <div class="row"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" data-goto="rules">📜 تعديل القانون</button></div>
    </form>
    ${details}`;
}

const inviteLink = () => location.origin + location.pathname.replace(/index\.html$/, '');
function qrSvg(text) {
  if (typeof qrcode !== 'function') return '';
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}

async function toggle(memberId, cid, day, done, item = 0) {
  const row = { member_id: Number(memberId), challenge_id: cid, day, item };
  const { error } = done ? await sb.from('habit_logs').insert(row) : await sb.from('habit_logs').delete().match(row);
  if (error && error.code !== '23505') {
    toast(error.code === '42501' ? 'لا يمكن تسجيل هذا اليوم.' : 'تعذّر الحفظ، أعد المحاولة.', true);
    return false;
  }
  return true;
}

// تسجيل مهمة من المشارك: تحديث فوري، ثم الحفظ والاحتفال
async function mark(c, d, item, done, el) {
  const k = key(c.id, d, item);
  const wasPerfect = isPerfect(d);
  const wasFull = isFull(c, d);
  if (done) { S.myLogs.add(k); S.logs.push({ challenge_id: c.id, day: d, item, created_at: new Date().toISOString() }); }
  else { S.myLogs.delete(k); S.logs = S.logs.filter((l) => !(l.challenge_id === c.id && l.day === d && l.item === item)); }
  if (done) {
    const r = el?.getBoundingClientRect();
    FX.float(el, `+${c.points ?? 1}`);
    FX.chime();
    FX.buzz();
    if (r) FX.confetti(isFull(c, d) && !wasFull ? 40 : 14, { x: r.left + r.width / 2, y: r.top });
  }
  render();
  if (!(await toggle(S.memberId, c.id, d, done, item))) {
    if (done) { S.myLogs.delete(k); S.logs = S.logs.filter((l) => !(l.challenge_id === c.id && l.day === d && l.item === item)); }
    else { S.myLogs.add(k); S.logs.push({ challenge_id: c.id, day: d, item }); }
    return render();
  }
  if (done && c.kind === 'daily' && isFull(c, d) && !wasFull) {
    const st = streakOf(c, d);
    if (S.streakBonus && st && st % 7 === 0) celebrate({ icon: '🔥', title: `${st} أيام متتالية!`, text: `سلسلة رائعة في «${c.title}». واصل!`, pts: S.streakBonus });
  }
  if (done && !wasPerfect && isPerfect(d)) {
    celebrate({ icon: '✨', title: 'يوم مثالي!', text: 'أكملت كل مهام اليوم. ما شاء الله، تبارك الرحمن!', pts: S.perfectBonus || 0 });
  }
  await loadRanks();
  checkRewards();
  render();
}

function bind() {
  const v = $('#view');
  v.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => go(b.dataset.goto)));
  $('#members-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#new-member').value.trim();
    if (!name) return toast('اكتب اسمك.', true);
    const { error } = await sb.from('members').insert({ account_id: S.me.id, name });
    if (error) return toast('تعذّر الحفظ.', true);
    await loadMembers();
    await loadAll();
    celebrate({ icon: '🚀', title: `أهلًا ${name}!`, text: 'بدأت رحلتك. سجّل أول مهمة واربح شارة «أول خطوة» 🌱', btn: 'هيّا نبدأ' });
    render();
  });
  $('#photo')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); });
  $('#photo-del')?.addEventListener('click', async () => {
    const m = member();
    const { error } = await sb.from('members').update({ avatar_url: null }).eq('id', m.id);
    if (error) return toast('تعذّر الحذف.', true);
    m.avatar_url = null;
    await loadRanks();
    render();
  });
  $('#profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#pf-name').value.trim();
    const m = member();
    if (!name || !m) return;
    const [r1, r2] = await Promise.all([
      sb.from('members').update({ name }).eq('id', m.id),
      sb.from('profiles').update({ display_name: name }).eq('id', S.me.id),
    ]);
    if (r1.error || r2.error) return toast('تعذّر الحفظ.', true);
    m.name = name;
    S.me.display_name = name;
    await loadRanks();
    toast('تم الحفظ');
    render();
  });
  v.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => { S.day = b.dataset.day; render(); }));
  v.querySelectorAll('.check[data-c]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = S.challenges.find((x) => x.id === Number(b.dataset.c));
      mark(c, b.dataset.d, 0, b.getAttribute('aria-pressed') !== 'true', b);
    })
  );
  v.querySelectorAll('.item[data-ic]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = S.challenges.find((x) => x.id === Number(b.dataset.ic));
      mark(c, b.dataset.id, Number(b.dataset.ii), b.getAttribute('aria-pressed') !== 'true', b);
    })
  );
  v.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => { S.openId = Number(b.dataset.open); S.detMonth = null; render(); window.scrollTo({ top: 0 }); })
  );
  $('#back-today')?.addEventListener('click', () => { S.openId = null; render(); });
  v.querySelectorAll('[data-mnav]').forEach((b) =>
    b.addEventListener('click', () => {
      const [y, m] = (S.detMonth || today().slice(0, 7)).split('-').map(Number);
      S.detMonth = iso(new Date(y, m - 1 + Number(b.dataset.mnav), 1)).slice(0, 7);
      render();
    })
  );
  v.querySelectorAll('.mcell[data-mc]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = S.challenges.find((x) => x.id === Number(b.dataset.mc));
      if (nItems(c) > 1) { S.sel[c.id] = b.dataset.d; return render(); }
      mark(c, b.dataset.d, 0, !b.classList.contains('done'), b);
    })
  );
  v.querySelectorAll('[data-video]').forEach((b) =>
    b.addEventListener('click', () => { S.video ??= {}; const id = Number(b.dataset.video); S.video[id] = !S.video[id]; render(); })
  );
  // التحديات الخاصة
  v.querySelectorAll('[data-quest]').forEach((b) =>
    b.addEventListener('click', () => { const id = Number(b.dataset.quest); S.quest = S.quest === id ? null : id; render(); })
  );
  v.querySelectorAll('[data-pdf]').forEach((a) =>
    a.addEventListener('click', () => {
      sessionStorage.setItem(`o:${S.memberId}:${a.dataset.pdf}`, '1');
      setTimeout(render, 400);
    })
  );
  v.querySelectorAll('[data-qc]').forEach((b) =>
    b.addEventListener('click', () => {
      const c = S.challenges.find((x) => x.id === Number(b.dataset.qc));
      const i = Number(b.dataset.qi);
      if (i === Number(c.quiz.answer)) { S.quiz[c.id] = 'ok'; FX.chime(); FX.buzz(); }
      else { S.quiz[c.id] = 'no' + i; FX.buzz([60, 40, 60]); }
      render();
    })
  );
  v.querySelectorAll('[data-qdone]').forEach((b) =>
    b.addEventListener('click', async () => {
      const c = S.challenges.find((x) => x.id === Number(b.dataset.qdone));
      b.disabled = true;
      if (!(await toggle(S.memberId, c.id, today(), true, 0))) return render();
      S.myLogs.add(key(c.id, today()));
      S.logs.push({ challenge_id: c.id, day: today(), item: 0, created_at: new Date().toISOString() });
      S.quest = null;
      celebrate({ icon: c.icon || '🎯', title: 'تحدٍّ منجز!', text: `أنهيت «${c.title}». بارك الله فيك!`, pts: c.points ?? 1 });
      await loadRanks();
      checkRewards();
      render();
    })
  );
  v.querySelectorAll('[data-board]').forEach((b) => b.addEventListener('click', () => { S.boardId = Number(b.dataset.board); render(); }));
  v.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { S.period = b.dataset.period; render(); }));
  bindAdmin(v);
  $('#p-yes')?.addEventListener('click', async () => { const p = S.pending; S.pending = null; await p.run(); render(); });
  $('#p-no')?.addEventListener('click', () => { S.pending = null; render(); });
}

function bindAdmin(v) {
  v.querySelectorAll('[data-acc]').forEach((b) =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      const { error } = await sb.rpc('set_account_status', { p_id: b.dataset.acc, p_status: b.dataset.st });
      if (error) { b.disabled = false; return toast('تعذّر الحفظ.', true); }
      toast(b.dataset.st === 'approved' ? 'تم القبول ✓' : 'تم');
      await loadRanks();
      render();
    })
  );
  $('#copy-link')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(inviteLink()); toast('تم نسخ الرابط'); } catch { toast(inviteLink()); }
  });
  $('#show-qr')?.addEventListener('click', () => { S.showQr = !S.showQr; render(); });
  v.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { S.editing = { start_date: today(), active: true, kind: b.dataset.add, points: b.dataset.add === 'once' ? 20 : 5 }; render(); window.scrollTo({ top: 0 }); }));
  v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { S.editing = { ...S.challenges.find((x) => x.id === Number(b.dataset.edit)) }; render(); window.scrollTo({ top: 0 }); }));
  v.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { readForm(); S.editing.kind = b.dataset.kind; render(); }));
  v.querySelectorAll('[data-tpl]').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = TEMPLATES[Number(b.dataset.tpl)];
      b.disabled = true;
      const { error } = await sb.from('challenges').insert({ ...t, kind: 'daily', items: t.items || null, sort: S.challenges.length + 1, start_date: today() });
      if (error) return toast(error.message, true);
      toast('أُضيفت «' + t.title + '»');
      await loadAll();
      render();
    })
  );
  v.querySelectorAll('[data-move]').forEach((b) =>
    b.addEventListener('click', async () => {
      const list = [...S.challenges];
      const i = list.findIndex((x) => x.id === Number(b.dataset.move));
      const j = i + Number(b.dataset.dir);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      await Promise.all(list.map((x, k) => (x.sort !== k + 1 ? sb.from('challenges').update({ sort: k + 1 }).eq('id', x.id) : null)));
      await loadAll();
      render();
    })
  );
  v.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      const x = S.challenges.find((c) => c.id === Number(b.dataset.del));
      S.pending = {
        top: true,
        label: `حذف «${x.title}» وكل ما سُجّل فيها؟ (للإخفاء فقط: عدّل وألغِ «مفتوحة»)`,
        run: async () => {
          const { data, error } = await sb.from('challenges').delete().eq('id', x.id).select('id');
          if (error || !data?.length) toast('تعذّر الحذف.', true);
          else toast('تم حذف «' + x.title + '»');
          if (S.detailId === x.id) S.detailId = null;
          await loadAll();
        },
      };
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    })
  );
  $('#f-cancel')?.addEventListener('click', () => { S.editing = null; render(); });
  $('#ch-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    readForm();
    const f = S.editing;
    const row = {
      kind: f.kind || 'daily', icon: f.icon || null, title: f.title, description: f.description || null,
      start_date: f.start_date || today(), end_date: f.end_date || null, active: f.active,
      points: Math.max(0, Math.min(1000, Number(f.points) || 0)), video_url: f.video_url || null,
      items: f.kind === 'daily' && f.items?.length ? f.items : null, pdf_url: f.kind === 'once' ? f.pdf_url || null : null,
      quiz: f.kind === 'once' ? f.quiz : null,
    };
    if (!row.title) return toast('العنوان إجباري.', true);
    if (row.video_url && !youtubeId(row.video_url)) return toast('رابط يوتيوب غير صالح.', true);
    if (row.end_date && row.end_date < row.start_date) return toast('تاريخ النهاية قبل البداية.', true);
    if (row.quiz && (row.quiz.choices.length < 2 || row.quiz.answer >= row.quiz.choices.length)) return toast('السؤال يحتاج اختيارين على الأقل ورقم إجابة صحيح.', true);
    if (btn) btn.disabled = true;
    try {
      const file = $('#f-pdf-file')?.files?.[0];
      if (file) {
        if (file.size > 25 * 1024 * 1024) throw new Error('الملف أكبر من 25 ميغا.');
        toast('جاري رفع الملف…');
        const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
        const { error } = await sb.storage.from('task-files').upload(path, file, { contentType: 'application/pdf' });
        if (error) throw error;
        row.pdf_url = sb.storage.from('task-files').getPublicUrl(path).data.publicUrl;
      }
      const { error } = f.id
        ? await sb.from('challenges').update(row).eq('id', f.id)
        : await sb.from('challenges').insert({ ...row, sort: S.challenges.length + 1 });
      if (error) throw error;
    } catch (err) {
      if (btn) btn.disabled = false;
      return toast(err.message || 'تعذّر الحفظ.', true);
    }
    S.editing = null;
    toast('تم الحفظ');
    await loadAll();
    render();
  });
  $('#d-c')?.addEventListener('change', (e) => { S.detailId = Number(e.target.value); S.pending = null; render(); });
  $('#d-month')?.addEventListener('change', (e) => { S.month = e.target.value || null; S.pending = null; render(); });
  v.querySelectorAll('td.cell[data-u]').forEach((td) =>
    td.addEventListener('click', () => {
      const done = td.dataset.full !== 'true';
      const c = S.challenges.find((x) => x.id === S.detailId);
      S.pending = {
        label: `${done ? 'تسجيل' : 'إلغاء'} يوم ${fmt(td.dataset.d)} لـ ${td.dataset.n}${c.items ? ' (كل العناصر)' : ''}؟`,
        run: async () => {
          for (let i = 0; i < nItems(c); i++) await toggle(td.dataset.u, c.id, td.dataset.d, done, i);
          await loadAll();
        },
      };
      render();
    })
  );
  $('#rules-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = $('#rules-text').value.slice(0, 10000);
    const { error } = await sb.from('app_settings').upsert({ key: 'rules', value, updated_at: new Date().toISOString() });
    if (error) return toast('تعذّر الحفظ.', true);
    S.rules = value;
    toast('تم حفظ القانون');
    render();
  });
  $('#settings-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = new Date().toISOString();
    const vals = {
      edit_days: Number($('#edit-days').value),
      perfect_bonus: Math.max(0, Math.min(1000, Number($('#perfect-bonus').value) || 0)),
      streak_bonus: Math.max(0, Math.min(1000, Number($('#streak-bonus').value) || 0)),
    };
    const { error } = await sb.from('app_settings').upsert(Object.entries(vals).map(([key, value]) => ({ key, value, updated_at: at })));
    if (error) return toast('تعذّر الحفظ.', true);
    await loadAll();
    toast('تم الحفظ');
    render();
  });
}

// قراءة قيم النموذج إلى S.editing (للحفاظ عليها عند تبديل النوع)
function readForm() {
  const f = S.editing;
  if (!f || !$('#ch-form')) return;
  const val = (id) => $(id)?.value.trim() ?? '';
  f.icon = val('#f-icon');
  f.title = val('#f-title');
  f.description = val('#f-desc');
  f.points = Number($('#f-points').value);
  f.video_url = val('#f-video');
  f.start_date = $('#f-start').value;
  f.end_date = $('#f-end').value;
  f.active = $('#f-active').checked;
  if ($('#f-items')) f.items = $('#f-items').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10);
  if ($('#f-pdf')) f.pdf_url = val('#f-pdf');
  if ($('#f-q')) {
    const q = val('#f-q');
    const choices = $('#f-choices').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    f.quiz = q ? { q, choices, answer: Math.max(0, (Number($('#f-answer').value) || 1) - 1) } : null;
  }
}

function go(tab) {
  S.tab = tab;
  S.openId = null;
  S.pending = null;
  S.editing = null;
  render();
  window.scrollTo({ top: 0 });
}

document.querySelectorAll('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
$('#rules-btn').addEventListener('click', () => go('rules'));
$('#logout').addEventListener('click', () => sb.auth.signOut());
const soundIcon = () => { $('#sound-btn').textContent = FX.sound ? '🔊' : '🔇'; };
soundIcon();
$('#sound-btn').addEventListener('click', () => { FX.sound = !FX.sound; store('sound', FX.sound ? 'on' : 'off'); soundIcon(); if (FX.sound) FX.chime(); });

// في انتظار قبول المشرف: يمكن وضع الصورة والاسم من الآن
function renderPending() {
  $('#nav').hidden = true;
  document.body.classList.remove('with-nav');
  const rejected = S.me.status === 'rejected';
  $('#view').innerHTML = `<div class="auth">
    <section class="hero center pending">
      <div class="cel-icon">${rejected ? '🚫' : '⏳'}</div>
      <h2>${rejected ? 'لم يُقبل طلبك' : 'طلبك وصل إلى المشرف'}</h2>
      <p>${rejected ? 'تواصل مع المشرف إن كان هناك خطأ.' : 'سيقبل المشرف حسابك قريبًا إن شاء الله، ثم تبدأ التحدّي مع الجميع. في الأثناء ضع صورتك واسمك 👇'}</p>
      <button class="btn yellow" type="button" id="recheck">🔄 تحقّق من جديد</button>
    </section>
    ${rejected ? '' : profileCard()}
  </div>`;
  $('#recheck').addEventListener('click', async () => {
    await loadMe();
    if (S.me.status === 'approved') { toast('تم قبولك! مرحبًا بك 🎉'); start(); }
    else toast('ما زال الطلب في الانتظار.');
  });
  const v = $('#view');
  $('#photo')?.addEventListener('change', async (e) => { const f = e.target.files?.[0]; if (f) { await uploadPhoto(f); } });
  $('#profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('#pf-name').value.trim();
    const m = member();
    if (!name || !m) return;
    await Promise.all([sb.from('members').update({ name }).eq('id', m.id), sb.from('profiles').update({ display_name: name }).eq('id', S.me.id)]);
    m.name = name;
    S.me.display_name = name;
    toast('تم الحفظ');
    renderPending();
  });
  void v;
}

async function start() {
  if (S.recovery) return renderNewPassword();
  if (!S.session) return renderAuth();
  await loadMe();
  if (!S.me) {
    $('#view').innerHTML = '<div class="card error">تعذّر تحميل حسابك. أعد تحميل الصفحة.</div>';
    return;
  }
  $('#top-actions').hidden = false;
  await loadMembers();
  if (!S.me.is_admin && S.me.status && S.me.status !== 'approved') return renderPending();
  $('#nav').hidden = false;
  document.body.classList.add('with-nav');
  await loadAll();
  render();
  checkRewards();
}

fetch(window.APP_CONFIG.supabaseUrl + '/auth/v1/settings', { headers: { apikey: window.APP_CONFIG.supabaseKey } })
  .then((r) => r.json())
  .then((st) => { S.google = !!st?.external?.google; if (!S.session) renderAuth(); })
  .catch(() => {});

let started = null;
sb.auth.onAuthStateChange((event, session) => {
  const changed = (S.session?.user.id || null) !== (session?.user.id || null);
  S.session = session;
  if (event === 'PASSWORD_RECOVERY') S.recovery = true;
  if (event === 'PASSWORD_RECOVERY' || changed || !started) {
    if (!session) S.me = null;
    started = setTimeout(start, 0);
  }
});
