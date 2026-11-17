'use strict';
// صناعة العادات v2: مهام يومية ومهام خاصة (قراءة PDF، فيديو)، نقاط ومكافآت، مستويات، شارات، ترتيب ومنصّة

const DAYS = ['إث', 'ثل', 'أر', 'خم', 'جم', 'سب', 'أح'];
const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ البداية' };
const WINDOWS = { 1: 'اليوم نفسه فقط (حتى نصف الليل)', 2: 'اليوم وأمس (48 ساعة)', 3: 'آخر 3 أيام', 7: 'آخر أسبوع' };
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
// الشارات: كل شارة لها 4 درجات (برونزي، فضي، ذهبي، ماسي) وأهدافها صعبة تدريجيًا
const TIERS = [
  { name: 'برونزي', color: '#cd7f32' },
  { name: 'فضي', color: '#9aa4b5' },
  { name: 'ذهبي', color: '#e8a90c' },
  { name: 'ماسي', color: '#2bb3d9' },
];
const BADGES = [
  { id: 'done', icon: '✅', name: 'المنجِز', unit: 'مهمة منجزة', goals: [10, 100, 500, 2000], v: (x) => x.completions },
  { id: 'streak', icon: '🔥', name: 'السلسلة', unit: 'يومًا متتاليًا في مهمة', goals: [7, 21, 40, 100], v: (x) => x.bestStreak },
  { id: 'perfect', icon: '✨', name: 'الأيام المثالية', unit: 'يومًا مثاليًا', goals: [5, 20, 60, 150], v: (x) => x.perfectDays },
  { id: 'prun', icon: '💎', name: 'الكمال المتواصل', unit: 'أيام مثالية متتالية', goals: [3, 7, 21, 40], v: (x) => x.bestPerfectRun },
  { id: 'pray', icon: '🕌', name: 'حارس الصلاة', unit: 'يومًا متتاليًا بكل الصلوات', goals: [7, 21, 40, 100], v: (x) => x.prayRun, when: (x) => x.hasPrayers },
  { id: 'fajr', icon: '🌄', name: 'فارس الفجر', unit: 'صلاة صبح على وقتها', goals: [10, 40, 100, 250], v: (x) => x.fajr, when: (x) => x.hasFajr },
  { id: 'quran', icon: '📖', name: 'صاحب القرآن', unit: 'يومًا من الورد', goals: [10, 40, 100, 250], v: (x) => x.quranDays, when: (x) => x.hasQuran },
  { id: 'pages', icon: '📜', name: 'الختمة', unit: 'صفحة مقروءة', goals: [100, 302, 604, 1208], v: (x) => x.pages, when: (x) => x.hasCounter },
  { id: 'adhkar', icon: '📿', name: 'الذاكر', unit: 'يومًا من الأذكار', goals: [10, 40, 100, 250], v: (x) => x.adhkarDays, when: (x) => x.hasAdhkar },
  { id: 'points', icon: '⭐', name: 'جامع النقاط', unit: 'نقطة', goals: [300, 1000, 3000, 8000], v: (x) => x.points },
  { id: 'active', icon: '📅', name: 'المواظب', unit: 'يوم نشاط', goals: [15, 45, 100, 250], v: (x) => x.activeDays },
  { id: 'quests', icon: '🎯', name: 'صائد التحديات', unit: 'تحدٍّ خاص منجز', goals: [3, 10, 25, 60], v: (x) => x.onceDone, when: (x) => x.hasOnce },
  { id: 'books', icon: '📚', name: 'القارئ', unit: 'كتاب مقروء', goals: [1, 3, 8, 20], v: (x) => x.pdfDone, when: (x) => x.hasPdf },
  { id: 'videos', icon: '🎬', name: 'المتابع', unit: 'فيديو مشاهَد', goals: [1, 5, 15, 40], v: (x) => x.videoDone, when: (x) => x.hasVideo },
  { id: 'quiz', icon: '🧩', name: 'العبقري', unit: 'اختبار بنتيجة 90% فأكثر', goals: [1, 3, 10, 25], v: (x) => x.quizAces, when: (x) => x.hasQuiz },
  { id: 'submit', icon: '📤', name: 'المبدع', unit: 'إنجاز مرسَل', goals: [1, 3, 10, 25], v: (x) => x.submits, when: (x) => x.hasSubmit },
  { id: 'top1', icon: '🏆', name: 'المتصدّر', unit: 'أسبوع في المرتبة الأولى', goals: [1, 3, 8, 20], v: (x) => x.weeksTop1 },
  { id: 'top3', icon: '🥉', name: 'منصّة التتويج', unit: 'أسبوع في الثلاثة الأوائل', goals: [2, 6, 15, 40], v: (x) => x.weeksTop3 },
];

// أنواع المهام وخصوصياتها
const TYPES = {
  prayer: { icon: '🕌', name: 'صلاة', desc: 'الصلوات على وقتها، صلاة صلاة، والسنن', kind: 'daily', color: '#61038d', title: 'الصلوات الخمس على وقتها', hint: 'مثال: في المسجد للأولاد' },
  quran: { icon: '📖', name: 'قراءة القرآن', desc: 'ورد يومي: قراءة أو حفظ أو مراجعة', kind: 'daily', color: '#1f9d63', title: 'ورد القرآن', hint: 'مثال: مع التدبّر' },
  adhkar: { icon: '📿', name: 'أذكار', desc: 'أذكار الصباح والمساء والنوم…', kind: 'daily', color: '#0b7fa6', title: 'الأذكار', hint: '' },
  book: { icon: '📚', name: 'قراءة كتاب', desc: 'ملف PDF وسؤال للتأكّد من القراءة', kind: 'once', color: '#c26a00', title: '', hint: 'مثال: اقرأ الفصل الأول' },
  video: { icon: '🎬', name: 'مشاهدة فيديو', desc: 'فيديو يوتيوب يُشاهَد حتى آخره', kind: 'once', color: '#e5197d', title: '', hint: '' },
  custom: { icon: '⭐', name: 'عادة أخرى', desc: 'رياضة، صدقة، برّ الوالدين…', kind: 'daily', color: '#8a5cf6', title: '', hint: 'متى تُعتبر المهمة منجزة؟' },
  quiz: { icon: '🧩', name: 'أسئلة تفاعلية', desc: 'اربط، رتّب، اسحب الكلمات، اختيار من متعدد…', kind: 'once', color: '#20149a', title: '', hint: 'مثال: بعد درس الطهارة' },
  submit: { icon: '📤', name: 'إرسال إنجاز', desc: 'ملف أو صورة أو رسالة صوتية يراجعها المشرف', kind: 'once', color: '#0f766e', title: '', hint: 'مثال: سجّل تلاوتك لسورة الملك' },
};
const PRAYERS = ['الصبح', 'الظهر', 'العصر', 'المغرب', 'العشاء'];
const SUNAN = ['سنّة الفجر', 'الضحى', 'الرواتب', 'الشفع والوتر', 'قيام الليل'];
const ADHKAR = ['أذكار الصباح', 'أذكار المساء', 'أذكار النوم', 'أذكار بعد الصلاة'];
const QURAN_MODES = { read: 'قراءة', memorize: 'حفظ', review: 'مراجعة' };
const isCounter = (c) => c.type === 'quran' && c.meta?.track === 'counter';
const SUBMIT_NEEDS = { either: 'ملف أو رسالة صوتية', file: 'ملف فقط', audio: 'رسالة صوتية فقط', both: 'ملف ورسالة صوتية' };
const UNITS = ['صفحة', 'آية', 'ربع حزب', 'حزب', 'جزء'];
const ITEM_ICONS = {
  'الصبح': '🌄', 'الظهر': '☀️', 'العصر': '🌤️', 'المغرب': '🌇', 'العشاء': '🌙', 'سنّة الفجر': '🌅', 'الضحى': '🌞', 'الرواتب': '🕌',
  'الشفع والوتر': '✨', 'قيام الليل': '🌌', 'أذكار الصباح': '☀️', 'أذكار المساء': '🌆', 'أذكار النوم': '🛏️', 'أذكار بعد الصلاة': '📿',
};
const TEMPLATES = [
  { type: 'prayer', title: 'الصلوات الخمس على وقتها', icon: '🕌', points: 5, items: PRAYERS },
  { type: 'prayer', title: 'سنّة الفجر', icon: '🌅', points: 5 },
  { type: 'prayer', title: 'الشفع والوتر', icon: '🌙', points: 5 },
  { type: 'adhkar', title: 'أذكار الصباح والمساء', icon: '📿', points: 5, items: ['أذكار الصباح', 'أذكار المساء'] },
  { type: 'quran', title: 'ورد القرآن', icon: '📖', points: 5, meta: { mode: 'read', amount: 1, unit: 'صفحة' } },
];
// أيقونات خطّية
const svg = (d) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  right: svg('<path d="M9 6l6 6-6 6"/>'),
  left: svg('<path d="M15 6l-6 6 6 6"/>'),
  cal: svg('<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  trophy: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4"/>'),
};

function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

const sb = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseKey);

const S = {
  session: null, me: null, challenges: [], members: [], memberId: null, logs: [], myLogs: new Set(), google: false,
  rules: '', editDays: 2, perfectBonus: 10, streakBonus: 10,
  overall: null, week: null, tab: 'today', weekOff: 0, pop: null, period: 'week', boardId: 0,
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
// كامل بتسجيلات في وقتها فقط (للسلاسل والأيام المثالية والشارات، كما في الترتيب)
const fullOnTime = (c, d) => S.logs.filter((l) => l.challenge_id === c.id && l.day === d && !l.late).length >= nItems(c);
const inRange = (c, d) => d >= c.start_date && (!c.end_date || d <= c.end_date);
const dailies = (d = today()) => S.challenges.filter((c) => c.active && (c.kind || 'daily') === 'daily' && inRange(c, d));
const quests = () => S.challenges.filter((c) => c.active && c.kind === 'once' && c.start_date <= today());
// مهام مبرمجة لم يحن وقتها: تظهر باهتة حتى منتصف ليل يومها
const upcoming = (kind) => S.challenges.filter((c) => c.active && c.kind === kind && c.start_date > today()).sort((a, b) => (a.start_date < b.start_date ? -1 : 1));
const logsOf = (c, d) => S.logs.filter((l) => l.challenge_id === c.id && l.day === d);
const lateDay = (c, d) => { const l = logsOf(c, d); return l.length > 0 && l.every((x) => x.late); };
const valueOf = (c, d) => logsOf(c, d).reduce((t, l) => t + Number(l.value ?? 1), 0);
// نقاط تسجيل: صفر إن كان متأخّرًا، والنقاط × القيمة (عدد الصفحات، نسبة النجاح)
const logPts = (c, l) => (l.late ? 0 : (c.points ?? 1) * Number(l.value ?? 1));
const dayPts = (c, d) => Math.round(logsOf(c, d).reduce((t, l) => t + logPts(c, l), 0));
function opensIn(d) {
  const n = diff(today(), d);
  return n === 1 ? 'يفتح غدًا على الساعة 00:00' : n === 2 ? 'يفتح بعد غد' : `يفتح بعد ${n} أيام`;
}
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
    <div class="cel-icon">${esc(c.icon)}</div>
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
    S.memberId ? sb.from('habit_logs').select('challenge_id, day, item, created_at, value, payload, late').eq('member_id', S.memberId) : Promise.resolve({ data: [] }),
    sb.from('app_settings').select('key, value'),
  ]);
  const set = Object.fromEntries((settings || []).map((x) => [x.key, x.value]));
  S.rules = typeof set.rules === 'string' ? set.rules : '';
  S.editDays = Math.max(1, Number(set.edit_days) || 2);
  S.perfectBonus = Number(set.perfect_bonus ?? 10) || 0;
  S.streakBonus = Number(set.streak_bonus ?? 10) || 0;
  S.challenges = (ch || []).map((c) => ({ ...c, icon: firstIcon(c.icon), kind: c.kind || 'daily', type: TYPES[c.type] ? c.type : guessType(c) }));
  S.logs = logs || [];
  S.myLogs = new Set(S.logs.map((l) => key(l.challenge_id, l.day, l.item)));
  await loadRanks();
}

// الرمز: أول رمز تعبيري فقط (لا نصّ داخل خانة الأيقونة)
function firstIcon(v) {
  const str = String(v || '').trim();
  if (!str) return null;
  try { return [...new Intl.Segmenter('ar', { granularity: 'grapheme' }).segment(str)][0].segment; } catch { return [...str][0]; }
}

// المهام القديمة دون نوع
function guessType(c) {
  if ((c.items || []).length >= 5) return 'prayer';
  if (/قرآن|القرآن/.test(c.title)) return 'quran';
  if (/أذكار/.test(c.title)) return 'adhkar';
  if (c.kind === 'once' && c.pdf_url) return 'book';
  if (c.video_url) return 'video';
  return 'custom';
}

async function loadRanks() {
  const [all, week] = await Promise.all([
    sb.rpc('ranking2', { p_challenge: null, p_period: 'all' }),
    sb.rpc('ranking2', { p_challenge: null, p_period: 'week' }),
  ]);
  S.overall = ranked(all.data || []);
  S.week = ranked(week.data || []);
  // ترتيبي هذا الأسبوع في كل مهمة يومية
  const list = S.challenges.filter((c) => c.active && c.kind === 'daily' && c.start_date <= today());
  const res = await Promise.all(list.map((c) => sb.rpc('ranking2', { p_challenge: c.id, p_period: 'week' })));
  S.taskRank = {};
  list.forEach((c, i) => {
    const rows = ranked(res[i].data || []);
    const me = meIn(rows);
    if (me) S.taskRank[c.id] = { rank: me.rank, count: rows.length, points: me.points };
  });
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
  let d = fullOnTime(c, upTo) ? upTo : addDays(upTo, -1);
  let s = 0;
  while (d >= c.start_date && fullOnTime(c, d)) { s++; d = addDays(d, -1); }
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
  return list.length > 0 && list.every((c) => fullOnTime(c, d));
}
function activeDays() { return new Set(S.logs.filter((l) => !l.late).map((l) => l.day)); }
function activityStreak() {
  const days = activeDays();
  let d = days.has(today()) ? today() : addDays(today(), -1);
  let s = 0;
  while (days.has(d)) { s++; d = addDays(d, -1); }
  return s;
}

function badgeStats() {
  const fullDays = {};
  const daily = S.challenges.filter((x) => x.kind === 'daily');
  for (const c of daily) {
    fullDays[c.id] = new Set([...new Set(S.logs.filter((l) => l.challenge_id === c.id).map((l) => l.day))].filter((d) => fullOnTime(c, d)));
  }
  const ok = S.logs.filter((l) => !l.late);
  const days = activeDays();
  const perfect = [...days].filter(isPerfect);
  const prayers = daily.filter((c) => c.type === 'prayer' && nItems(c) >= 5);
  const fajrTasks = daily.filter((c) => (c.items || []).includes('الصبح'));
  const quran = daily.filter((c) => c.type === 'quran');
  const counters = quran.filter(isCounter);
  const adhkar = daily.filter((c) => c.type === 'adhkar');
  const onceList = S.challenges.filter((c) => c.kind === 'once');
  const once = onceList.filter(onceDone);
  const union = (list) => new Set(list.flatMap((c) => [...(fullDays[c.id] || [])])).size;
  const o = meIn(S.overall);
  return {
    completions: ok.length,
    activeDays: days.size,
    bestStreak: Math.max(0, ...Object.values(fullDays).map(bestRun)),
    perfectDays: perfect.length,
    bestPerfectRun: bestRun(perfect),
    hasPrayers: prayers.length > 0,
    prayRun: Math.max(0, ...prayers.map((c) => bestRun(fullDays[c.id] || []))),
    hasFajr: fajrTasks.length > 0,
    fajr: new Set(ok.filter((l) => fajrTasks.some((c) => c.id === l.challenge_id && c.items[l.item] === 'الصبح')).map((l) => l.day)).size,
    hasQuran: quran.length > 0,
    quranDays: union(quran),
    hasCounter: counters.length > 0,
    pages: Math.round(ok.filter((l) => counters.some((c) => c.id === l.challenge_id)).reduce((t, l) => t + Number(l.value ?? 1), 0)),
    hasAdhkar: adhkar.length > 0,
    adhkarDays: union(adhkar),
    hasOnce: onceList.length > 0,
    onceDone: once.length,
    hasPdf: onceList.some((c) => c.type === 'book' || c.pdf_url),
    pdfDone: once.filter((c) => c.type === 'book' || c.pdf_url).length,
    hasVideo: onceList.some((c) => youtubeId(c.video_url)),
    videoDone: once.filter((c) => youtubeId(c.video_url)).length,
    hasQuiz: onceList.some((c) => c.type === 'quiz'),
    quizAces: S.logs.filter((l) => S.challenges.find((c) => c.id === l.challenge_id)?.type === 'quiz' && Number(l.value) >= 0.9).length,
    hasSubmit: onceList.some((c) => c.type === 'submit'),
    submits: once.filter((c) => c.type === 'submit').length,
    points: o?.points || 0,
    weeksTop1: weeksAt('top1').length,
    weeksTop3: weeksAt('top3').length,
  };
}
// الأسابيع التي ظهر فيها المشارك في الصدارة (تُحفظ في الهاتف)
const weeksAt = (k) => (recall(`${k}:${S.memberId}`) || '').split(',').filter(Boolean);
function noteWeekRank() {
  const w = meIn(S.week);
  if (!w?.points) return;
  const wk = weekStart(today());
  for (const [k, okRank] of [['top1', w.rank === 1], ['top3', w.rank <= 3 && S.week.length >= 3]]) {
    const list = weeksAt(k);
    if (okRank && !list.includes(wk)) store(`${k}:${S.memberId}`, [...list, wk].join(','));
  }
}
const earnedTiers = () => { try { return JSON.parse(recall('badges2:' + S.memberId) || 'null'); } catch { return null; } };
function badges() {
  const x = badgeStats();
  const kept = earnedTiers() || {};
  return BADGES.filter((b) => !b.when || b.when(x) || kept[b.id]).map((b) => {
    const cur = b.v(x) || 0;
    const tier = Math.max(kept[b.id] || 0, b.goals.filter((g) => cur >= g).length);
    const next = b.goals[tier];
    const prev = tier ? b.goals[tier - 1] : 0;
    return { ...b, cur, tier, next, pct: next ? Math.round(((Math.min(cur, next) - prev) / (next - prev)) * 100) : 100 };
  });
}
const tierCount = (list = badges()) => list.reduce((t, b) => t + b.tier, 0);
// الدرجات الجديدة والمستوى الجديد منذ آخر مرة
function checkRewards() {
  if (!S.memberId) return;
  noteWeekRank();
  const before = earnedTiers();
  const list = badges();
  const now = Object.fromEntries(list.map((b) => [b.id, b.tier]));
  if (before) {
    for (const b of list) {
      if (b.tier > (before[b.id] || 0)) {
        const t = TIERS[b.tier - 1];
        celebrate({ icon: b.icon, title: `${b.name}: الدرجة ${t.name === 'ماسي' ? 'الماسية' : t.name === 'ذهبي' ? 'الذهبية' : t.name === 'فضي' ? 'الفضية' : 'البرونزية'}!`, text: `${b.goals[b.tier - 1]} ${b.unit} — بارك الله فيك!` });
      }
    }
  }
  store('badges2:' + S.memberId, JSON.stringify({ ...(before || {}), ...now }));
  const lk = 'level:' + S.memberId;
  const lv = level(meIn(S.overall)?.points || 0);
  const prev = Number(recall(lk) || 0);
  if (prev && lv.level > prev) celebrate({ icon: '⭐', title: `المستوى ${lv.level}: ${lv.title}!`, text: 'ارتقيت إلى مستوى جديد. واصل هكذا!' });
  store(lk, String(lv.level));
}

// ---------- الواجهة ----------
// يمكن تسجيل أي يوم فات منذ بداية المهمة؛ والنقاط فقط داخل مدّة التعمير
const editable = (c, d) => d <= today() && inRange(c, d);
const onTime = (c, d) => S.me.is_admin || diff(d, today()) < S.editDays;

let players = [];
function cleanupPlayers() { players.forEach((p) => { clearInterval(p.timer); try { p.player?.destroy(); } catch {} }); players = []; }

async function render() {
  cleanupPlayers();
  $('#pop')?.remove();
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
  if (S.pop) showPop();
  if (S.pending) document.querySelector('.confirm')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (S.qz && $('#quiz-box')) { if (S.qz.i === undefined) startQuiz(S.challenges.find((x) => x.id === S.qz.cid)); else drawQuiz(); }
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
      <div><b class="num">${tierCount()}</b><small>شارة</small></div>
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

// ---------- اليوم: الأسبوع، دوائر الأيام، ونافذة الصلوات ----------
const weekStart = (s) => addDays(s, -((parse(s).getDay() + 6) % 7));
const weekDays = () => { const st = addDays(weekStart(today()), S.weekOff * 7); return Array.from({ length: 7 }, (_, i) => addDays(st, i)); };
function rangeLabel(a, b) {
  const [, ma, da] = a.split('-').map(Number);
  const [, mb, db] = b.split('-').map(Number);
  return ma === mb ? `${da} – ${db} ${MONTH_NAMES[mb - 1]}` : `${da} ${MONTH_NAMES[ma - 1]} – ${db} ${MONTH_NAMES[mb - 1]}`;
}
const weekTitle = (o) => (o === 0 ? 'هذا الأسبوع' : o === -1 ? 'الأسبوع الماضي' : o === -2 ? 'قبل أسبوعين' : `قبل ${-o} أسابيع`);

function weekNav() {
  const week = weekDays();
  const now = today();
  let done = 0, total = 0;
  for (const d of week.filter((x) => x <= now)) for (const c of dailies(d)) { total += nItems(c); done += Math.min(doneCount(c, d), nItems(c)); }
  const pct = total ? Math.round((done / total) * 100) : 0;
  const perfect = week.filter((d) => d <= now && isPerfect(d)).length;
  return `<nav class="weeknav-x" aria-label="التنقّل بين الأسابيع">
      <button class="wk-arrow" type="button" data-wk="-1" aria-label="الأسبوع السابق">${ICON.right}<span>السابق</span></button>
      <div class="wk-mid">
        <b>${weekTitle(S.weekOff)}</b>
        <small>${rangeLabel(week[0], week[6])}</small>
        <div class="wk-bar" title="${pct}%"><span style="width:${pct}%"></span></div>
        <small class="wk-sum">${pct}% منجز${perfect ? ` · ✨ ${perfect} ${perfect === 1 ? 'يوم مثالي' : 'أيام مثالية'}` : ''}</small>
      </div>
      <button class="wk-arrow" type="button" data-wk="1" aria-label="الأسبوع التالي" ${S.weekOff >= 0 ? 'disabled' : ''}><span>التالي</span>${ICON.left}</button>
    </nav>
    ${S.weekOff ? '<button class="back-week" type="button" data-wk="0">↩ العودة إلى هذا الأسبوع</button>' : ''}`;
}

function renderToday() {
  const now = today();
  const list = dailies(now);
  const week = weekDays();
  // كل المهام اليومية التي تشمل يومًا من هذا الأسبوع
  const shown = S.challenges.filter((c) => c.active && c.kind === 'daily' && week.some((d) => inRange(c, d) && d <= now));
  const q = quests().filter((c) => !onceDone(c) && (!c.end_date || c.end_date >= now));
  const total = list.reduce((t, c) => t + nItems(c), 0);
  const done = list.reduce((t, c) => t + Math.min(doneCount(c, now), nItems(c)), 0);
  const earned = list.reduce((t, c) => t + dayPts(c, now), 0) + (isPerfect(now) ? S.perfectBonus : 0);
  const soon = upcoming('daily');
  const quote = QUOTES[diff('2026-01-01', now) % QUOTES.length];
  return `${heroCard()}
    <section class="card today-card">
      <div class="ring-wrap">${ring(done, total)}</div>
      <div class="today-info">
        <span class="eyebrow">${dayName(now) === 'جم' ? 'يوم الجمعة' : 'اليوم'} · ${Number(now.slice(8))} ${MONTH_NAMES[Number(now.slice(5, 7)) - 1]}</span>
        <h2>${done >= total && total ? 'أحسنت! أكملت مهام اليوم' : `باقي ${total - done} من ${total}`}</h2>
        <p class="muted small" style="margin:0"><b class="good">+${earned}</b> نقطة اليوم</p>
        ${!list.length ? '' : isPerfect(now)
          ? `<span class="perfect-on">✨ يوم مثالي! +${S.perfectBonus}</span>`
          : S.perfectBonus ? `<span class="perfect-hint">أكمل الكل لتربح <b>+${S.perfectBonus}</b></span>` : ''}
      </div>
    </section>
    ${weekNav()}
    ${!shown.length ? `<div class="card empty"><div class="empty-ico">🌱</div><h3>لا توجد مهام يومية ${S.weekOff ? 'في هذا الأسبوع' : 'بعد'}</h3><p class="muted">${
      S.me.is_admin ? 'أضف أول مهمة من تبويب «الإدارة».' : 'ستظهر هنا المهام عندما يضيفها المشرف.'}</p></div>` : ''}
    <div class="tasks">${shown.map((c) => taskCard(c, week)).join('')}</div>
    ${soon.length ? `<h3 class="sec">🔒 قريبًا</h3><div class="tasks">${soon.map(lockedCard).join('')}</div>` : ''}
    ${q.length ? `<button class="card quest-teaser" type="button" data-goto="quests">
      <span class="qt-ico">🎯</span><span><b>${q.length === 1 ? 'تحدٍّ خاص ينتظرك' : `${q.length} تحديات خاصة تنتظرك`}</b><small>قراءة، فيديو… نقاط إضافية!</small></span><span class="go">${ICON.left}</span></button>` : ''}
    <figure class="quote"><blockquote>${esc(quote[0])}</blockquote><figcaption>${esc(quote[1])}</figcaption></figure>
    <p class="muted small center">اضغط على دائرة اليوم لتسجيله. النقاط تُحتسب ${S.editDays === 1 ? 'لليوم نفسه فقط (حتى نصف الليل)' : `خلال ${S.editDays === 2 ? 'يومين' : `${S.editDays} أيام`}`}، وبعدها يُسجَّل اليوم دون نقاط.</p>`;
}

// دائرة يوم: ✓ كاملة، قوس للتقدّم الجزئي، رقم للعدّاد، رمادية إن سُجّلت بعد المدّة (دون نقاط)
function dayCircle(c, d, big = false) {
  const now = today();
  const N = nItems(c);
  const n = Math.min(doneCount(c, d), N);
  const off = d > now || !inRange(c, d);
  const late = n > 0 && lateDay(c, d);
  const closed = !off && !onTime(c, d);
  const r = 18, len = 2 * Math.PI * r;
  const arc = n && n < N ? `<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="${r}" stroke-dasharray="${len}" stroke-dashoffset="${len * (1 - n / N)}"/></svg>` : '';
  const state = n >= N ? 'full' : n ? 'part' : 'none';
  const open = S.pop && S.pop.c === c.id && S.pop.d === d;
  const tick = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const label = isCounter(c) && n ? `<span class="cnt">${valueOf(c, d)}</span>` : n >= N ? tick : n ? `${n}/${N}` : Number(d.slice(8));
  return `<button type="button" class="dc ${state} ${d === now ? 'is-today' : ''} ${off ? 'off' : ''} ${late ? 'is-late' : ''} ${closed ? 'closed' : ''} ${open ? 'open' : ''} ${big ? 'big' : ''}"
      data-wd data-c="${c.id}" data-d="${d}" ${off ? 'disabled' : ''} aria-label="${dayName(d)} ${fmt(d)}: ${n} من ${N}${late ? ' (متأخّر، دون نقاط)' : ''}">
    ${big ? '' : `<small>${d === now ? 'اليوم' : dayName(d)}</small>`}
    <span class="dc-c">${arc}<b>${label}</b></span>
  </button>`;
}

function typeInfo(c) {
  const t = TYPES[c.type] || TYPES.custom;
  const m = c.meta || {};
  if (isCounter(c)) return `${QURAN_MODES[m.mode] || 'قراءة'}: عدّاد · +${c.points ?? 1} لكل ${m.unit || 'صفحة'}`;
  if (c.type === 'quran' && m.amount) return `${QURAN_MODES[m.mode] || 'الورد'}: ${m.amount} ${m.unit || 'صفحة'} يوميًا`;
  if (c.type === 'prayer' && N(c) > 1) return `${N(c)} ${N(c) <= 10 ? 'صلوات' : 'صلاة'} · +${c.points ?? 1} لكل صلاة`;
  if (N(c) > 1) return `${N(c)} عناصر · +${c.points ?? 1} لكل واحد`;
  return t.name;
}
const N = (c) => nItems(c);

function taskCard(c, week) {
  const now = today();
  const st = streakOf(c, now);
  const toBonus = 7 - (st % 7);
  const t = TYPES[c.type] || TYPES.custom;
  const r = S.taskRank?.[c.id];
  return `<section class="task" style="--tc:${t.color}">
    <div class="task-head">
      <span class="task-ico">${esc(c.icon || t.icon)}</span>
      <div class="task-title">
        <b>${esc(c.title)}</b>
        <small><span class="type-tag">${t.icon} ${esc(typeInfo(c))}</span>${N(c) === 1 && !isCounter(c) ? ` <span class="pts">+${c.points ?? 1}</span>` : ''}</small>
      </div>
      ${st ? `<span class="streak-badge" title="سلسلة ${st} أيام">🔥<b>${st}</b></span>` : ''}
    </div>
    ${c.description ? `<p class="muted small desc">${esc(c.description)}</p>` : ''}
    <div class="week-row">${week.map((d) => dayCircle(c, d)).join('')}</div>
    ${st && S.streakBonus && toBonus < 7 && S.weekOff === 0 ? `<div class="bonus-line">🎁 ${toBonus === 1 ? 'غدًا' : `بعد ${toBonus} أيام`} تربح +${S.streakBonus} مكافأة السلسلة</div>` : ''}
    ${videoBlock(c)}
    <div class="task-links">
      <button type="button" class="tlink" data-open="${c.id}">${ICON.cal}<span>تقدّم الشهر</span></button>
      <button type="button" class="tlink" data-rank="${c.id}">${ICON.trophy}<span>${r?.points ? `ترتيبي ${r.rank} من ${r.count}` : 'الترتيب'}</span></button>
    </div>
  </section>`;
}

// مهمة مبرمجة لم تبدأ: باهتة مع العدّ التنازلي
function lockedCard(c) {
  const t = TYPES[c.type] || TYPES.custom;
  const [, m, d] = c.start_date.split('-').map(Number);
  return `<section class="task locked" style="--tc:${t.color}">
    <div class="task-head">
      <span class="task-ico">${esc(c.icon || t.icon)}</span>
      <div class="task-title"><b>${esc(c.title)}</b><small><span class="type-tag">${t.icon} ${esc(typeInfo(c))}</span></small></div>
      <span class="lock-badge">🔒</span>
    </div>
    <div class="lock-line">📅 ${dayName(c.start_date) === 'جم' ? 'الجمعة' : dayName(c.start_date)} ${d} ${MONTH_NAMES[m - 1]} · <b>${opensIn(c.start_date)}</b></div>
  </section>`;
}

function videoBlock(c) {
  const id = youtubeId(c.video_url);
  if (!id) return '';
  if (!S.video?.[c.id]) return `<button class="btn ghost small" type="button" data-video="${c.id}">▶ مشاهدة الفيديو</button>`;
  return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1" title="${esc(c.title)}"
      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
    <button class="link small" type="button" data-video="${c.id}">إخفاء الفيديو</button>`;
}

// نافذة صغيرة فوق اليوم المضغوط: الصلوات (أو العناصر) لذلك اليوم
function itemIcon(c, name) { return ITEM_ICONS[name] || (TYPES[c.type] || TYPES.custom).icon; }
function popHtml(c, d) {
  const ok = onTime(c, d);
  const when = d === today() ? 'اليوم' : `${dayName(d)} ${fmt(d)}`;
  const late = ok ? '' : `<p class="pop-note">⏰ انتهت مدّة النقاط لهذا اليوم: يمكنك التسجيل لكن <b>دون نقاط</b>.</p>`;
  const head = (sub) => `<div class="pop-head"><b>${esc(c.icon || '')} ${esc(c.title)}</b><small>${when} · ${sub}</small>
      <button type="button" class="pop-x" data-popx aria-label="إغلاق">✕</button></div>`;
  if (isCounter(c)) {
    const v = S.pop?.v ?? valueOf(c, d);
    const unit = c.meta?.unit || 'صفحة';
    const max = Number(c.meta?.max) || 60;
    return `${head(`كم ${unit} قرأت؟`)}${late}
      <div class="stepper"><button type="button" class="st-b" data-st="-1" aria-label="ناقص">−</button>
        <output class="st-v"><b>${v}</b><small>${unit}</small></output>
        <button type="button" class="st-b" data-st="1" aria-label="زائد">+</button></div>
      <div class="chips st-quick">${[1, 2, 5, 10, 20].filter((x) => x <= max).map((x) => `<button type="button" class="pill" data-sv="${x}">${x}</button>`).join('')}</div>
      <div class="st-pts">${ok ? `+${Math.round(v * (c.points ?? 1))} نقطة` : 'دون نقاط'}</div>
      <div class="row nowrap"><button type="button" class="btn small" data-ssave style="flex:1">حفظ</button>
        ${valueOf(c, d) ? '<button type="button" class="btn danger small" data-sdel>مسح</button>' : ''}</div>`;
  }
  const n = doneCount(c, d);
  const all = n >= N(c);
  return `${head(`${n}/${N(c)}`)}${late}
    <div class="pop-items">${c.items
      .map((name, i) => {
        const on = S.myLogs.has(key(c.id, d, i));
        const l = on && logsOf(c, d).find((x) => x.item === i);
        return `<button type="button" class="pi ${on ? 'on' : ''} ${l?.late ? 'late' : ''}" data-pi="${i}" aria-pressed="${on}">
          <span class="pi-ico">${itemIcon(c, name)}</span><span>${esc(name)}</span><i>${on ? (l?.late ? '✓ دون نقاط' : '✓') : ok ? `+${c.points ?? 1}` : '0'}</i></button>`;
      })
      .join('')}</div>
    ${!all ? `<button type="button" class="btn small pop-all" data-piall>✓ الكل (${N(c) - n})</button>` : ''}`;
}
function closePop() { S.pop = null; $('#pop')?.remove(); document.querySelectorAll('.dc.open').forEach((b) => b.classList.remove('open')); }
function showPop() {
  $('#pop')?.remove();
  if (!S.pop) return;
  const c = S.challenges.find((x) => x.id === S.pop.c);
  const btn = document.querySelector(`[data-wd][data-c="${S.pop.c}"][data-d="${S.pop.d}"]`);
  if (!c || !btn) { S.pop = null; return; }
  btn.classList.add('open');
  const pop = document.createElement('div');
  pop.id = 'pop';
  pop.className = 'popover';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = popHtml(c, S.pop.d) + '<span class="pop-arrow"></span>';
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect();
  const w = Math.min(340, innerWidth - 24);
  pop.style.width = w + 'px';
  const left = Math.max(12, Math.min(innerWidth - w - 12, r.left + r.width / 2 - w / 2));
  const h = pop.offsetHeight;
  const above = r.top - h - 14 > 70;
  pop.style.left = left + 'px';
  pop.style.top = (above ? r.top + scrollY - h - 12 : r.bottom + scrollY + 12) + 'px';
  pop.classList.toggle('below', !above);
  pop.querySelector('.pop-arrow').style.left = r.left + r.width / 2 - left - 8 + 'px';
  pop.querySelector('[data-popx]').addEventListener('click', closePop);
  pop.querySelectorAll('[data-pi]').forEach((b) =>
    b.addEventListener('click', () => mark(c, S.pop.d, [Number(b.dataset.pi)], b.getAttribute('aria-pressed') !== 'true', b))
  );
  // العدّاد
  const max = Number(c.meta?.max) || 60;
  const setV = (v) => { S.pop.v = Math.max(0, Math.min(max, v)); showPop(); };
  pop.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => setV((S.pop.v ?? valueOf(c, S.pop.d)) + Number(b.dataset.st))));
  pop.querySelectorAll('[data-sv]').forEach((b) => b.addEventListener('click', () => setV(Number(b.dataset.sv))));
  pop.querySelector('[data-ssave]')?.addEventListener('click', (e) => setCount(c, S.pop.d, S.pop.v ?? valueOf(c, S.pop.d), e.currentTarget));
  pop.querySelector('[data-sdel]')?.addEventListener('click', (e) => setCount(c, S.pop.d, 0, e.currentTarget));
  pop.querySelector('[data-piall]')?.addEventListener('click', (e) => {
    const d = S.pop.d;
    const missing = c.items.map((_, i) => i).filter((i) => !S.myLogs.has(key(c.id, d, i)));
    mark(c, d, missing, true, e.currentTarget);
  });
}
document.addEventListener('click', (e) => {
  if (S.pop && !e.target.closest('#pop') && !e.target.closest('[data-wd]')) closePop();
});
addEventListener('resize', () => S.pop && showPop());

function onDay(b) {
  const c = S.challenges.find((x) => x.id === Number(b.dataset.c));
  const d = b.dataset.d;
  if (!c) return;
  if (N(c) > 1 || isCounter(c)) {
    if (S.pop && S.pop.c === c.id && S.pop.d === d) return closePop();
    S.pop = { c: c.id, d };
    return showPop();
  }
  mark(c, d, [0], !isFull(c, d), b);
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
  const soonQ = upcoming('once');
  const card = (c) => {
    const st = questState(c);
    const isDone = onceDone(c);
    const left = c.end_date ? diff(now, c.end_date) : null;
    const t = TYPES[c.type] || TYPES.custom;
    const m = c.meta || {};
    const type = `${t.icon} ${t.name}${c.type === 'book' && m.pages ? ` · ${m.pages} صفحة` : ''}${c.type === 'book' && m.author ? ` · ${esc(m.author)}` : ''}`;
    const expanded = S.quest === c.id && !isDone;
    return `<section class="quest ${isDone ? 'is-done' : ''}" style="--tc:${t.color}">
      ${st.vid && !expanded && !isDone ? `<button class="thumb-btn" type="button" data-quest="${c.id}" aria-label="${esc(c.title)}"><img src="https://i.ytimg.com/vi/${st.vid}/hqdefault.jpg" alt="" loading="lazy"><span class="play">▶</span></button>` : ''}
      <button class="quest-head" type="button" data-quest="${c.id}" aria-expanded="${expanded}" ${isDone ? 'disabled' : ''}>
        <span class="task-ico">${esc(c.icon || t.icon)}</span>
        <span class="quest-info"><b>${esc(c.title)}</b>
          <small><span class="tag-type">${type}</span> <span class="pts">+${c.points ?? 1}</span>${
            isDone ? ` · <span class="good">✓ ${doneLabel(c)}</span>` : left !== null ? ` · <span class="${left <= 1 ? 'urgent' : 'muted'}">⏳ ${left === 0 ? 'آخر يوم!' : left === 1 ? 'ينتهي غدًا' : `باقي ${left} أيام`}</span>` : ''}</small></span>
        <span class="go">${isDone ? '🏅' : expanded ? '▲' : c.type === 'submit' ? 'أرسل' : 'ابدأ'}</span>
      </button>
      ${expanded ? `<div class="quest-body">
        ${c.description ? `<p class="small" style="margin:0">${esc(c.description)}</p>` : ''}
        ${c.type === 'quiz' ? quizIntro(c) : c.type === 'submit' ? submitForm(c) : `
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
        <button class="btn big ${st.ready ? 'yellow' : ''}" type="button" data-qdone="${c.id}" ${st.ready ? '' : 'disabled'}>${st.ready ? `🎉 أنجزت! (+${c.points ?? 1})` : '🔒 أكمل الخطوات أولًا'}</button>`}
      </div>` : ''}
    </section>`;
  };
  return `${membersBar()}
    <section class="banner">
      <div><span class="pill-yellow">تحديات خاصة</span><h2>اقرأ، شاهد، أجب، وأرسل!</h2><p>كل تحدٍّ يُنجز مرة واحدة ويضيف نقاطًا لترتيبك.</p></div>
      <span class="banner-ico">🎯</span>
    </section>
    ${open.length ? open.map(card).join('') : `<div class="card empty"><div class="empty-ico">${list.length ? '🏅' : '🎯'}</div><h3>${
      list.length ? 'أنهيت كل التحديات الحالية!' : 'لا توجد تحديات خاصة الآن'}</h3><p class="muted">${S.me.is_admin ? 'أضف تحدّيًا (قراءة، فيديو، أسئلة، إرسال) من «الإدارة».' : 'ترقّب الجديد قريبًا.'}</p></div>`}
    ${done.length ? `<h3 class="sec">✓ أنجزتها (${done.length})</h3>${done.map(card).join('')}` : ''}
    ${soonQ.length ? `<h3 class="sec">🔒 قريبًا</h3>${soonQ.map(lockedCard).join('')}` : ''}
    ${missed.length ? `<h3 class="sec muted">انتهى وقتها</h3>${missed.map((c) => `<div class="quest missed"><div class="quest-head"><span class="task-ico">${esc(c.icon || '🎯')}</span><span class="quest-info"><b>${esc(c.title)}</b><small class="muted">انتهى في ${fmt(c.end_date)}</small></span></div></div>`).join('')}` : ''}`;
}

function doneLabel(c) {
  const l = S.logs.find((x) => x.challenge_id === c.id);
  if (c.type === 'quiz' && l?.value != null) return `نتيجتك ${Math.round(Number(l.value) * 100)}% (+${Math.round((c.points ?? 1) * Number(l.value))})`;
  if (c.type === 'submit') return 'أُرسل للمشرف';
  return 'أنجزت';
}

function quizIntro(c) {
  const qs = quizQuestions(c);
  if (S.qz?.cid === c.id) return '<div class="quiz-box" id="quiz-box"></div>';
  const kinds = [...new Set(qs.map((q) => q.t))].map((t) => `${QTYPES[t].icon} ${QTYPES[t].name}`).join(' · ');
  return `<div class="quiz-intro"><b>${qs.length} ${qs.length === 1 ? 'سؤال' : qs.length <= 10 ? 'أسئلة' : 'سؤالًا'}</b><small>${kinds}</small>
      <small class="muted">محاولة واحدة: النقاط حسب نسبة الإجابات الصحيحة.</small></div>
    <button class="btn big yellow" type="button" data-qzstart="${c.id}" ${qs.length ? '' : 'disabled'}>▶ ابدأ الأسئلة</button>`;
}

// ---------- إرسال إنجاز: ملف و/أو رسالة صوتية ----------
const REC = { rec: null, chunks: [], blob: null, url: null, secs: 0, timer: null, cid: null };
function submitForm(c) {
  const need = c.meta?.need || 'either';
  const accept = { image: 'image/*', pdf: 'application/pdf', any: 'image/*,application/pdf,audio/*,video/*,.doc,.docx,.txt' }[c.meta?.accept || 'any'];
  const f = S.subFile?.cid === c.id ? S.subFile.file : null;
  const hasAudio = REC.cid === c.id && REC.blob;
  const recording = REC.cid === c.id && REC.rec;
  return `<div class="sub-need">📌 المطلوب: <b>${SUBMIT_NEEDS[need]}</b></div>
    ${need !== 'audio' ? `<label class="drop">
        <input type="file" id="sub-file" accept="${accept}" hidden>
        <span class="drop-ico">${f ? '📎' : '⬆️'}</span>
        <span>${f ? `<b>${esc(f.name)}</b><small>${Math.round(f.size / 1024)} ك.ب · اضغط للتغيير</small>` : '<b>اختر ملفًا أو صورة</b><small>من الهاتف أو الكاميرا (حتى 25 ميغا)</small>'}</span>
      </label>` : ''}
    ${need !== 'file' ? `<div class="rec ${recording ? 'on' : ''}">
        ${recording ? `<button type="button" class="rec-btn stop" id="rec-stop" aria-label="إيقاف">■</button><span class="rec-t"><i class="rec-dot"></i> جاري التسجيل… <b id="rec-secs">${REC.secs}</b> ث</span>`
          : hasAudio ? `<audio controls src="${REC.url}"></audio><button type="button" class="btn ghost small" id="rec-again">إعادة</button>`
          : `<button type="button" class="rec-btn" id="rec-start" aria-label="تسجيل">🎙️</button><span class="rec-t">اضغط لتسجيل رسالة صوتية (حتى 3 دقائق)</span>`}
      </div>` : ''}
    <label>ملاحظة (اختياري)<textarea id="sub-note" rows="2" maxlength="500">${esc(S.subNote || '')}</textarea></label>
    <button class="btn big yellow" type="button" data-subsend="${c.id}">📤 إرسال (+${c.points ?? 1})</button>`;
}
async function startRec(c) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    Object.assign(REC, { rec, chunks: [], blob: null, url: null, secs: 0, cid: c.id });
    rec.ondataavailable = (e) => e.data.size && REC.chunks.push(e.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(REC.timer);
      REC.blob = new Blob(REC.chunks, { type: rec.mimeType || 'audio/webm' });
      REC.url = URL.createObjectURL(REC.blob);
      REC.rec = null;
      render();
    };
    rec.start();
    REC.timer = setInterval(() => {
      REC.secs++;
      const el = $('#rec-secs');
      if (el) el.textContent = REC.secs;
      if (REC.secs >= 180) rec.stop();
    }, 1000);
    render();
  } catch {
    toast('لم نتمكّن من استعمال المايكروفون. اسمح للمتصفح باستعماله.', true);
  }
}
async function sendSubmission(c, btn) {
  const need = c.meta?.need || 'either';
  const file = S.subFile?.cid === c.id ? S.subFile.file : null;
  const audio = REC.cid === c.id ? REC.blob : null;
  if (need === 'file' && !file) return toast('أضف الملف أولًا.', true);
  if (need === 'audio' && !audio) return toast('سجّل الرسالة الصوتية أولًا.', true);
  if (need === 'both' && (!file || !audio)) return toast('المطلوب ملف ورسالة صوتية.', true);
  if (need === 'either' && !file && !audio) return toast('أضف ملفًا أو سجّل رسالة صوتية.', true);
  if (file && file.size > 25 * 1024 * 1024) return toast('الملف أكبر من 25 ميغا.', true);
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال…';
  const payload = { note: $('#sub-note')?.value.trim() || undefined };
  const base = `${S.me.id}/${c.id}-${Date.now()}`;
  try {
    if (file) {
      const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
      const path = `${base}.${ext}`;
      const { error } = await sb.storage.from('submissions').upload(path, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      payload.file = { path, name: file.name.slice(0, 120), type: file.type, size: file.size };
    }
    if (audio) {
      const ext = /mp4/.test(audio.type) ? 'm4a' : /ogg/.test(audio.type) ? 'ogg' : 'webm';
      const path = `${base}-voice.${ext}`;
      const { error } = await sb.storage.from('submissions').upload(path, audio, { contentType: audio.type.split(';')[0] });
      if (error) throw error;
      payload.audio = { path, secs: REC.secs };
    }
  } catch {
    btn.disabled = false;
    btn.textContent = '📤 إرسال';
    return toast('تعذّر رفع الملف. أعد المحاولة.', true);
  }
  S.subFile = null;
  S.subNote = '';
  Object.assign(REC, { blob: null, url: null, cid: null, secs: 0 });
  await completeOnce(c, { payload });
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
  const me = meIn(rows);
  const above = me && rows.filter((r) => r.points > me.points).sort((a, b) => a.points - b.points)[0];
  const myPos = me ? `<section class="my-pos">
      ${avatar(me.member_id, me.name, me.avatar_url, 'sm')}
      <div class="mp-txt"><small>موقعك ${c ? `في ${esc(c.title)}` : ''} · ${PERIODS[S.period]}</small>
        <b>${me.points ? `المرتبة ${me.rank} من ${rows.length}` : 'لم تبدأ بعد'}</b>
        <small>${!me.points ? 'سجّل مهمة لتدخل السباق 💪' : above ? `ينقصك <b>${above.points - me.points + 1}</b> نقطة لتتجاوز ${esc(above.name)}` : 'أنت في الصدارة 👑'}</small></div>
      <span class="mp-pts"><b>${me.points}</b><small>نقطة</small></span>
    </section>` : '';
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
    ${myPos}
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
  const got = tierCount(list);
  const x = badgeStats();
  return `${profileCard()}
    ${heroCard()}
    <section class="card" style="display:grid;gap:.7rem">
      <div class="row"><h2>🎖️ الشارات</h2><span class="pill-yellow sm">${got}/${list.length * 4}</span></div>
      <p class="muted small" style="margin:0">لكل شارة 4 درجات: <b style="color:${TIERS[0].color}">برونزي</b> ← <b style="color:${TIERS[1].color}">فضي</b> ← <b style="color:${TIERS[2].color}">ذهبي</b> ← <b style="color:${TIERS[3].color}">ماسي</b></p>
      <div class="badges">${list
        .sort((a, b) => b.tier - a.tier || b.pct - a.pct)
        .map((b) => {
          const t = TIERS[b.tier - 1];
          return `<div class="badge ${b.tier ? 'got' : ''} ${b.tier === 4 ? 'max' : ''}" style="--tier:${t ? t.color : 'var(--off)'}" title="${esc(b.goals.map((g, k) => `${TIERS[k].name}: ${g}`).join(' · '))}">
            <span class="b-ico">${b.icon}</span><b>${esc(b.name)}</b>
            <span class="b-tier">${t ? t.name : 'لم تُفتح بعد'}</span>
            <span class="b-pips">${TIERS.map((tt, k) => `<i class="${k < b.tier ? 'on' : ''}" style="--c:${tt.color}"></i>`).join('')}</span>
            ${b.next ? `<span class="b-prog"><span style="width:${b.pct}%"></span></span><small class="b-num">${Math.min(b.cur, b.next)}/${b.next} ${esc(b.unit)}</small>`
              : `<small class="b-num">🏁 أعلى درجة: ${b.goals[3]} ${esc(b.unit)}</small>`}
          </div>`;
        })
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
  const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
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
        <li>كل مهمة منجزة: نقاطها (الصلوات: لكل صلاة، العدّاد: لكل صفحة، الأسئلة: حسب النتيجة).</li>
        <li>⏰ النقاط تُحتسب فقط إذا سجّلت ${S.editDays === 1 ? 'في اليوم نفسه' : `خلال ${S.editDays === 2 ? 'يومين' : `${S.editDays} أيام`}`}؛ بعدها يمكنك التسجيل دون نقاط.</li>
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
  const n = N(c);
  const t = TYPES[c.type] || TYPES.custom;
  const from = [days[0], c.start_date, member()?.joined_on || days[0]].sort().pop();
  const to = [days[count - 1], now, c.end_date || '9999-12-31'].sort()[0];
  const elapsed = to < from ? 0 : diff(from, to) + 1;
  let full = 0, items = 0, best = 0, run = 0;
  const perItem = Array(n).fill(0);
  for (const d of days) {
    const k = doneCount(c, d);
    items += k;
    for (let i = 0; i < n; i++) if (S.myLogs.has(key(c.id, d, i))) perItem[i]++;
    if (k >= n) { full++; run++; best = Math.max(best, run); } else run = 0;
  }
  const pct = elapsed ? Math.round((full / elapsed) * 100) : 0;
  const r = S.taskRank?.[c.id];
  return `<div class="month-top">
      <button class="btn ghost small" type="button" id="back-today">${ICON.right} رجوع</button>
      <button class="btn ghost small" type="button" data-rank="${c.id}">${ICON.trophy} ${r?.points ? `ترتيبي ${r.rank} من ${r.count}` : 'الترتيب'}</button>
    </div>
    <section class="month-hero" style="--tc:${t.color}">
      <span class="task-ico">${esc(c.icon || t.icon)}</span>
      <div><small>${t.icon} ${esc(t.name)}</small><h2>${esc(c.title)}</h2></div>
    </section>
    <section class="card month" style="display:grid;gap:.9rem">
      <div class="mnav">
        <button class="wk-arrow" type="button" data-mnav="-1" aria-label="الشهر السابق">${ICON.right}</button>
        <b>${MONTH_NAMES[m - 1]} ${y}</b>
        <button class="wk-arrow" type="button" data-mnav="1" aria-label="الشهر التالي" ${month >= now.slice(0, 7) ? 'disabled' : ''}>${ICON.left}</button>
      </div>
      <div class="month-sum">
        <div class="ring-wrap lg">${ring(full, elapsed)}</div>
        <div class="kpis two">
          <div class="kpi"><b>${full}<small>/${elapsed}</small></b><small>يوم كامل</small></div>
          <div class="kpi"><b>${items * (c.points ?? 1)}</b><small>نقطة</small></div>
          <div class="kpi"><b>${best}🔥</b><small>أطول سلسلة</small></div>
          <div class="kpi"><b>${streakOf(c)}</b><small>السلسلة الآن</small></div>
        </div>
      </div>
      ${n > 1 ? `<div class="per-item">${c.items.map((name, i) => {
        const p = elapsed ? Math.round((perItem[i] / elapsed) * 100) : 0;
        return `<div class="pir"><span>${itemIcon(c, name)} ${esc(name)}</span><div class="pir-bar"><span style="width:${p}%"></span></div><b>${p}%</b></div>`;
      }).join('')}</div>` : ''}
      <div class="cal">
        ${DAYS.map((d) => `<span class="cal-h">${d}</span>`).join('')}
        ${'<span></span>'.repeat(blanks)}
        ${days.map((d) => dayCircle(c, d, true)).join('')}
      </div>
      <p class="legend"><span class="lg-full"></span> كامل <span class="lg-part"></span> ناقص <span class="lg-none"></span> لم يُسجَّل${n > 1 ? ' · اضغط على يوم لترى الصلوات' : ''}</p>
    </section>`;
}

// ---------- الإدارة ----------
// نموذج المهمة: أولًا النوع، ثم خصائص كل نوع
function challengeForm(c) {
  if (!c.type) {
    return `<section class="card" style="display:grid;gap:.8rem">
      <div class="row"><h2>مهمة جديدة: اختر النوع</h2><button class="btn ghost small" type="button" id="f-cancel">إلغاء</button></div>
      <div class="type-grid">${Object.entries(TYPES)
        .map(([k, t]) => `<button type="button" class="type-tile" data-type="${k}" style="--tc:${t.color}">
          <span class="tt-ico">${t.icon}</span><b>${t.name}</b><small>${t.desc}</small><span class="tt-kind">${t.kind === 'once' ? 'مرة واحدة' : 'كل يوم'}</span></button>`)
        .join('')}</div>
    </section>`;
  }
  const t = TYPES[c.type] || TYPES.custom;
  const kind = c.kind || t.kind;
  const quiz = c.quiz || {};
  const m = c.meta || {};
  const items = c.items || [];
  const chipSet = (list, picked) => `<div class="pick">${list
    .map((x) => `<label class="pick-chip"><input type="checkbox" data-item value="${esc(x)}" ${picked.includes(x) ? 'checked' : ''}><span>${ITEM_ICONS[x] || ''} ${esc(x)}</span></label>`)
    .join('')}</div>`;
  let specific = '';
  if (c.type === 'prayer') {
    specific = `<fieldset class="box"><legend>🕌 الصلوات المطلوبة</legend>
        <small class="muted">كل صلاة تُسجَّل وحدها، وتظهر عند الضغط على اليوم.</small>
        <b class="small">الفرائض</b>${chipSet(PRAYERS, items)}
        <b class="small">السنن والنوافل</b>${chipSet(SUNAN, items)}
      </fieldset>`;
  } else if (c.type === 'adhkar') {
    specific = `<fieldset class="box"><legend>📿 الأذكار المطلوبة</legend>${chipSet(ADHKAR, items)}
        <label>أذكار أخرى (كل واحد في سطر)<textarea id="f-items-extra" rows="2" placeholder="الاستغفار 100 مرة">${esc(items.filter((x) => !ADHKAR.includes(x)).join('\n'))}</textarea></label>
      </fieldset>`;
  } else if (c.type === 'quran') {
    const counter = m.track === 'counter';
    specific = `<fieldset class="box"><legend>📖 الورد اليومي</legend>
        <div class="seg two" role="radiogroup" aria-label="طريقة التسجيل">
          <button type="button" data-track="fixed" aria-pressed="${!counter}">🎯 المشرف يحدّد المقدار</button>
          <button type="button" data-track="counter" aria-pressed="${counter}">🔢 المشارك يُدخل العدد</button>
        </div>
        <small class="muted">${counter ? 'كل مشارك يُدخل عدد ما قرأ كل يوم، ويربح النقاط لكل وحدة.' : 'المشارك يضغط ✓ عندما يُتمّ المقدار المحدّد.'}</small>
        <div class="grid3">
          <label>النوع<select id="f-mode">${Object.entries(QURAN_MODES).map(([k, v]) => `<option value="${k}" ${(m.mode || 'read') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          ${counter ? `<label>الحدّ الأقصى يوميًا<input type="number" id="f-max" min="1" max="604" value="${m.max || 20}"></label>`
            : `<label>المقدار<input type="number" id="f-amount" min="1" max="604" value="${m.amount || 1}"></label>`}
          <label>الوحدة<select id="f-unit">${UNITS.map((u) => `<option ${(m.unit || 'صفحة') === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
        </div>
      </fieldset>`;
  } else if (c.type === 'quiz') {
    specific = quizBuilder(c.raws || []);
  } else if (c.type === 'submit') {
    specific = `<fieldset class="box"><legend>📤 ماذا يرسل المشارك؟</legend>
        <div class="grid2">
          <label>المطلوب<select id="f-need">${Object.entries(SUBMIT_NEEDS).map(([k, v]) => `<option value="${k}" ${(m.need || 'either') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>نوع الملف<select id="f-accept">${Object.entries({ any: 'أي ملف', image: 'صورة', pdf: 'PDF' }).map(([k, v]) => `<option value="${k}" ${(m.accept || 'any') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <small class="muted">تجد ما أُرسل في «الإدارة ← الإنجازات المرسَلة»، ويمكنك رفضه (فتُلغى نقاطه).</small>
      </fieldset>`;
  } else if (c.type === 'book') {
    specific = `<fieldset class="box"><legend>📚 الكتاب</legend>
        <div class="grid2">
          <label>المؤلّف (اختياري)<input id="f-author" maxlength="80" value="${esc(m.author || '')}"></label>
          <label>عدد الصفحات (اختياري)<input type="number" id="f-pages" min="1" max="5000" value="${esc(m.pages || '')}"></label>
        </div>
        <label>ملف PDF: ارفعه<input id="f-pdf-file" type="file" accept="application/pdf"></label>
        <label>أو ضع رابطه<input id="f-pdf" maxlength="500" dir="ltr" value="${esc(c.pdf_url || '')}" placeholder="https://…pdf"></label>
        ${c.pdf_url ? `<a class="small" href="${esc(c.pdf_url)}" target="_blank" rel="noopener">📄 الملف الحالي</a>` : ''}
      </fieldset>`;
  } else if (c.type === 'video') {
    const vid = youtubeId(c.video_url);
    specific = `<fieldset class="box"><legend>🎬 الفيديو</legend>
        <label>رابط يوتيوب<input id="f-video" maxlength="300" dir="ltr" value="${esc(c.video_url || '')}" placeholder="https://www.youtube.com/watch?v=…" required></label>
        ${vid ? `<img class="thumb" src="https://i.ytimg.com/vi/${vid}/hqdefault.jpg" alt="">` : ''}
        <small class="muted">${kind === 'once' ? 'يُحتسب عند مشاهدة 85% من الفيديو فعلًا (القفز لا يُحتسب).' : 'يُعرض الفيديو في بطاقة المهمة كل يوم.'}</small>
      </fieldset>`;
  } else {
    specific = `<label>عناصر (اختياري، كل عنصر في سطر)<textarea id="f-items" rows="3" placeholder="مثال: الأب&#10;الأم">${esc(items.join('\n'))}</textarea></label>
      <label>رابط فيديو يوتيوب (اختياري)<input id="f-video" maxlength="300" dir="ltr" value="${esc(c.video_url || '')}"></label>`;
  }
  const canQuiz = kind === 'once' && !['quiz', 'submit'].includes(c.type);
  return `<form class="card" id="ch-form" style="display:grid;gap:.8rem">
    <div class="form-head" style="--tc:${t.color}"><span class="tt-ico">${t.icon}</span><div><small>${c.id ? 'تعديل' : 'مهمة جديدة'}</small><h2>${t.name}</h2></div>
      ${c.id ? '' : '<button class="link small" type="button" id="f-retype">تغيير النوع</button>'}</div>
    ${c.type === 'custom' || c.type === 'video' ? `<div class="seg two" role="radiogroup" aria-label="التكرار">
      <button type="button" data-kind="daily" aria-pressed="${kind === 'daily'}">🔁 كل يوم</button>
      <button type="button" data-kind="once" aria-pressed="${kind === 'once'}">🎯 مرة واحدة</button></div>` : ''}
    <div class="grid-icon">
      <label>الرمز (رمز واحد)<input id="f-icon" maxlength="16" value="${esc(c.icon || t.icon)}"></label>
      <label>العنوان<input id="f-title" maxlength="80" value="${esc(c.title || t.title)}" required></label>
    </div>
    ${specific}
    <label>وصف أو تعليمات (اختياري)<input id="f-desc" maxlength="300" value="${esc(c.description || '')}" placeholder="${esc(t.hint)}"></label>
    <label>النقاط ${isCounter(c) ? `لكل ${esc(m.unit || 'صفحة')}` : c.type === 'quiz' ? '(كاملة عند 100%، وبالنسبة لغيرها)' : N(c) > 1 || ['prayer', 'adhkar'].includes(c.type) ? 'لكل عنصر' : kind === 'once' ? '(مرة واحدة)' : 'لكل يوم'}<input type="number" id="f-points" min="0" max="1000" value="${c.points ?? (kind === 'once' ? 20 : 5)}" required></label>
    ${canQuiz ? `<fieldset class="box"><legend>❓ سؤال للتأكّد (اختياري)</legend>
        <label>السؤال<input id="f-q" maxlength="200" value="${esc(quiz.q || '')}" placeholder="${c.type === 'video' ? 'ما العبرة من القصة؟' : 'ما الفكرة الرئيسية في الفصل الأول؟'}"></label>
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

// قراءة قيم النموذج إلى S.editing (للحفاظ عليها عند تبديل الخيارات)
function readForm() {
  const f = S.editing;
  if (!f || !$('#ch-form')) return;
  const val = (id) => $(id)?.value.trim() ?? '';
  f.icon = val('#f-icon');
  f.title = val('#f-title');
  f.description = val('#f-desc');
  f.points = Number($('#f-points').value);
  if ($('#f-video')) f.video_url = val('#f-video');
  f.start_date = $('#f-start').value;
  f.end_date = $('#f-end').value;
  f.active = $('#f-active').checked;
  const picked = [...document.querySelectorAll('[data-item]:checked')].map((x) => x.value);
  if (f.type === 'prayer') f.items = [...PRAYERS, ...SUNAN].filter((x) => picked.includes(x));
  if (f.type === 'adhkar') f.items = [...ADHKAR.filter((x) => picked.includes(x)), ...$('#f-items-extra').value.split('\n').map((x) => x.trim()).filter(Boolean)].slice(0, 10);
  if ($('#f-items')) f.items = $('#f-items').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10);
  f.meta = { ...(f.meta || {}) };
  if (f.type === 'quran') {
    Object.assign(f.meta, { mode: $('#f-mode').value, unit: $('#f-unit').value });
    if ($('#f-amount')) f.meta.amount = Math.max(1, Number($('#f-amount').value) || 1);
    if ($('#f-max')) f.meta.max = Math.max(1, Number($('#f-max').value) || 20);
  }
  if (f.type === 'submit') Object.assign(f.meta, { need: $('#f-need').value, accept: $('#f-accept').value });
  if (f.type === 'quiz') { readBuilder(); f.meta.questions = f.raws.map(rawToQ); }
  if (f.type === 'book') Object.assign(f.meta, { author: val('#f-author') || undefined, pages: Number($('#f-pages').value) || undefined });
  if ($('#f-pdf')) f.pdf_url = val('#f-pdf');
  if ($('#f-q')) {
    const q = val('#f-q');
    const choices = $('#f-choices').value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    f.quiz = q ? { q, choices, answer: Math.max(0, (Number($('#f-answer').value) || 1) - 1) } : null;
  }
}

async function renderAdmin() {
  if (!S.me.is_admin) return '';
  if (S.editing) return challengeForm(S.editing);
  const now = today();
  const c = S.challenges.find((x) => x.id === S.detailId) || S.challenges[0];
  const details = c ? await adminDetails(c) : '';
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
      <div class="row"><h2>📋 المهام</h2><div class="row"><button class="btn small yellow" type="button" data-add>+ مهمة جديدة</button></div></div>
      ${S.challenges
        .map((x, i) => `<div class="admin-task">
            <span class="task-ico">${esc(x.icon || '⭐')}</span>
            <div style="min-width:0"><b>${esc(x.title)}</b> ${x.active ? '' : '<span class="tag soft">متوقفة</span>'}
              <div class="small muted">${TYPES[x.type]?.icon || ''} ${TYPES[x.type]?.name || ''} · ${x.kind === 'once' ? 'مرة واحدة' : 'يومية'} · ⭐ ${x.points ?? 1}${x.items ? ` لكل عنصر (${x.items.length})` : ''}${x.pdf_url ? ' · 📄' : ''}${youtubeId(x.video_url) ? ' · 🎬' : ''}${x.quiz?.q ? ' · ❓' : ''} · من ${fmt(x.start_date)}${x.end_date ? ` إلى ${fmt(x.end_date)}` : ''}</div></div>
            <div class="row nowrap">
              <button class="icon-btn sm" type="button" data-move="${x.id}" data-dir="-1" ${i ? '' : 'disabled'} aria-label="إلى الأعلى">▲</button>
              <button class="icon-btn sm" type="button" data-move="${x.id}" data-dir="1" ${i < S.challenges.length - 1 ? '' : 'disabled'} aria-label="إلى الأسفل">▼</button>
              <button class="btn ghost small" type="button" data-edit="${x.id}">تعديل</button>
              <button class="btn danger small" type="button" data-del="${x.id}">حذف</button></div>
          </div>`)
        .join('') || '<p class="muted">لا توجد مهام بعد.</p>'}
    </div>
    <div class="card" style="display:grid;gap:.6rem">
      <h3>⚡ إضافة سريعة</h3><p class="muted small" style="margin:0">مهام جاهزة بنقرة (يمكن تعديلها بعد ذلك).</p>
      <div class="chips">${TEMPLATES.map((t, i) => `<button class="pill" type="button" data-tpl="${i}" ${titles.has(t.title) ? 'disabled' : ''}>${t.icon} ${esc(t.title)}${titles.has(t.title) ? ' ✓' : ''}</button>`).join('')}</div>
    </div>
    <form class="card" id="settings-form" style="display:grid;gap:.7rem">
      <h3>⚙️ القواعد والمكافآت</h3>
      <label>مدّة الحصول على النقاط<select id="edit-days">${Object.entries(WINDOWS)
        .map(([k, t]) => `<option value="${k}" ${Number(k) === S.editDays ? 'selected' : ''}>${t}</option>`)
        .join('')}</select></label>
      <p class="muted small" style="margin:-.3rem 0 0">يمكن للمشارك تسجيل أي يوم فات، لكن <b>النقاط والمكافآت</b> لا تُحتسب إلا إذا سجّل خلال هذه المدّة. تسجيلاتك أنت (التصحيح) تُحتسب دائمًا.</p>
      <div class="grid2">
        <label>✨ مكافأة اليوم المثالي<input type="number" id="perfect-bonus" min="0" max="1000" value="${S.perfectBonus}"></label>
        <label>🔥 مكافأة كل 7 أيام متتالية<input type="number" id="streak-bonus" min="0" max="1000" value="${S.streakBonus}"></label>
      </div>
      <div class="row"><button class="btn" type="submit">حفظ</button><button class="btn ghost" type="button" data-goto="rules">📜 تعديل القانون</button></div>
    </form>
    ${details}`;
}

// ---------- جدول المتابعة (المشرف) ----------
async function adminDetails(c) {
  S.detailId = c.id;
  const now = today();
  const A = (S.adm ??= { view: 'week', off: 0 });
  let days;
  let title;
  if (A.view === 'week') {
    const st = addDays(weekStart(now), A.off * 7);
    days = Array.from({ length: 7 }, (_, i) => addDays(st, i));
    title = `${weekTitle(A.off)} · ${rangeLabel(days[0], days[6])}`;
  } else {
    const [y, m] = (A.month || now.slice(0, 7)).split('-').map(Number);
    days = Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
    title = `${MONTH_NAMES[m - 1]} ${y}`;
  }
  const once = c.kind === 'once';
  const q = sb.from('habit_logs').select('member_id, day, item, created_at, value, late, payload').eq('challenge_id', c.id);
  const [{ data: people }, { data: logs }, { data: board }] = await Promise.all([
    sb.from('members').select('id, name, avatar_url, profiles(display_name)'),
    once ? q : q.gte('day', days[0]).lte('day', days[days.length - 1]),
    sb.rpc('ranking2', { p_challenge: c.id, p_period: 'all' }),
  ]);
  const rows = ranked(board || []);
  const who = Object.fromEntries((people || []).map((p) => [p.id, p]));
  const t = TYPES[c.type] || TYPES.custom;
  const select = `<label>المهمة<select id="d-c">${S.challenges.map((x) => `<option value="${x.id}" ${x.id === c.id ? 'selected' : ''}>${esc(x.icon || '⭐')} ${esc(x.title)}</option>`).join('')}</select></label>`;
  if (once) return onceDetails(c, rows, logs || [], who, select);

  const byUser = {};
  for (const l of logs || []) ((byUser[l.member_id] ??= {})[l.day] ??= []).push(l);
  const elapsed = days.filter((d) => d <= now && inRange(c, d)).length;
  const head = days.map((d) => `<th class="${d === now ? 'today' : ''} ${['جم'].includes(dayName(d)) ? 'fri' : ''}"><small>${dayName(d)}</small><b>${Number(d.slice(8))}</b></th>`).join('');
  const body = rows.map((r) => {
    const mine = byUser[r.member_id] || {};
    let full = 0, pts = 0;
    const cells = days.map((d) => {
      const out = d > now || !inRange(c, d);
      const ls = mine[d] || [];
      const k = Math.min(ls.length, nItems(c));
      const isFullDay = k >= nItems(c);
      const late = ls.length && ls.every((l) => l.late);
      if (isFullDay) full++;
      pts += ls.reduce((s2, l) => s2 + logPts(c, l), 0);
      const at = ls.length ? new Date(ls.reduce((a, l) => (l.created_at > a ? l.created_at : a), '')).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' }) : '';
      const what = ls.length && c.items ? ls.map((l) => c.items[l.item]).join('، ') : '';
      const tip = out ? '' : ls.length ? `سُجّل ${at}${late ? ' (متأخّر، دون نقاط)' : ''}${what ? ' — ' + what : ''}` : `${dayName(d)} ${fmt(d)}: لم يُسجَّل`;
      const content = out ? '' : isCounter(c) && ls.length ? `<b>${ls.reduce((a, l) => a + Number(l.value ?? 1), 0)}</b>`
        : isFullDay ? '✓' : k ? `<span class="ac-frac">${k}/${nItems(c)}</span><i class="ac-bar"><i style="width:${(k / nItems(c)) * 100}%"></i></i>` : '<span class="ac-dot"></span>';
      return `<td><button type="button" class="ac ${out ? 'out' : isFullDay ? 'full' : k ? 'part' : 'none'} ${late ? 'late' : ''} ${d === now ? 'today' : ''}" title="${esc(tip)}"
        ${out || isCounter(c) ? 'disabled' : `data-u="${r.member_id}" data-d="${d}" data-n="${esc(r.name)}" data-full="${isFullDay}"`}>${content}</button></td>`;
    }).join('');
    const pct = elapsed ? Math.round((full / elapsed) * 100) : 0;
    const p = who[r.member_id];
    return `<tr>
      <th class="who" scope="row"><span class="who-in">${avatar(r.member_id, r.name, p?.avatar_url, 'xs')}<span><b>${esc(r.name)}</b>${p?.profiles?.display_name && p.profiles.display_name !== r.name ? `<small>${esc(p.profiles.display_name)}</small>` : ''}</span></span></th>
      ${cells}
      <td class="tot"><b>${Math.round(pts)}</b></td>
      <td class="tot"><span class="pct ${pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : 'lo'}">${pct}%</span></td>
      <td class="tot">${r.streak ? `🔥${r.streak}` : '–'}</td>
    </tr>`;
  }).join('');
  const active = rows.filter((r) => Object.keys(byUser[r.member_id] || {}).length).length;
  return `<section class="card adm" style="display:grid;gap:.8rem">
      <div class="row"><h2>📊 جدول المتابعة</h2>
        <div class="seg two mini"><button type="button" data-av="week" aria-pressed="${A.view === 'week'}">أسبوع</button><button type="button" data-av="month" aria-pressed="${A.view === 'month'}">شهر</button></div></div>
      ${select}
      <div class="mnav">
        <button class="wk-arrow" type="button" data-an="-1" aria-label="السابق">${ICON.right}</button>
        <b>${title}</b>
        <button class="wk-arrow" type="button" data-an="1" aria-label="التالي" ${(A.view === 'week' ? A.off >= 0 : (A.month || now.slice(0, 7)) >= now.slice(0, 7)) ? 'disabled' : ''}>${ICON.left}</button>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${rows.length}</b><small>مشارك</small></div>
        <div class="kpi"><b>${active}</b><small>سجّل في الفترة</small></div>
        <div class="kpi"><b>${rows.length - active}</b><small>لم يسجّل</small></div>
      </div>
      ${confirmBox()}
    </section>
    <div class="atable-wrap" style="--tc:${t.color}"><table class="atable ${A.view}">
      <thead><tr><th class="who">المشارك</th>${head}<th class="tot">نقاط</th><th class="tot">مواظبة</th><th class="tot">سلسلة</th></tr></thead>
      <tbody>${body || `<tr><td colspan="${days.length + 4}" class="muted center">لا يوجد مشاركون بعد.</td></tr>`}</tbody>
    </table></div>
    <p class="legend"><span class="lg-full"></span> كامل <span class="lg-part"></span> ناقص <span class="lg-late"></span> متأخّر (دون نقاط) <span class="lg-none"></span> لم يُسجَّل · اضغط على خانة للتصحيح</p>`;
}

// تحدٍّ لمرة واحدة: من أنجز، متى، النتيجة، وما أرسله
function onceDetails(c, rows, logs, who, select) {
  const byUser = Object.fromEntries(logs.map((l) => [l.member_id, l]));
  const done = rows.filter((r) => byUser[r.member_id]);
  const items = rows.map((r) => {
    const l = byUser[r.member_id];
    const p = who[r.member_id];
    const at = l ? new Date(l.created_at).toLocaleString('fr-TN', { timeZone: 'Africa/Tunis', dateStyle: 'short', timeStyle: 'short' }) : '';
    const pay = l?.payload || {};
    return `<div class="sub-row ${l ? 'ok' : ''}">
      ${avatar(r.member_id, r.name, p?.avatar_url, 'sm')}
      <div class="sub-info"><b>${esc(r.name)}</b>
        <small>${l ? `✓ ${at}${c.type === 'quiz' && l.value != null ? ` · النتيجة <b>${Math.round(Number(l.value) * 100)}%</b>` : ''}` : '<span class="muted">لم ينجز بعد</span>'}</small>
        ${pay.note ? `<small class="sub-note">💬 ${esc(pay.note)}</small>` : ''}
        ${l && (pay.file || pay.audio) ? `<div class="row" style="justify-content:flex-start">
          ${pay.file ? `<button class="btn ghost small" type="button" data-open-file="${esc(pay.file.path)}">📎 ${esc(pay.file.name || 'الملف')}</button>` : ''}
          ${pay.audio ? `<button class="btn ghost small" type="button" data-play="${esc(pay.audio.path)}">▶ الرسالة الصوتية${pay.audio.secs ? ` (${pay.audio.secs} ث)` : ''}</button>` : ''}
        </div><div class="sub-player" data-player="${esc(pay.audio?.path || '')}"></div>` : ''}
      </div>
      ${l ? `<button class="btn danger small" type="button" data-reject="${r.member_id}" data-n="${esc(r.name)}">${c.type === 'submit' ? 'رفض' : 'إلغاء'}</button>` : ''}
    </div>`;
  }).join('');
  return `<section class="card adm" style="display:grid;gap:.8rem">
      <h2>${c.type === 'submit' ? '📤 الإنجازات المرسَلة' : '📊 من أنجز التحدّي'}</h2>
      ${select}
      <div class="kpis">
        <div class="kpi"><b>${done.length}</b><small>أنجز</small></div>
        <div class="kpi"><b>${rows.length - done.length}</b><small>لم ينجز</small></div>
        ${c.type === 'quiz' && done.length ? `<div class="kpi"><b>${Math.round((done.reduce((a, r) => a + Number(byUser[r.member_id].value ?? 0), 0) / done.length) * 100)}%</b><small>متوسط النتيجة</small></div>` : ''}
      </div>
      ${confirmBox()}
      <div class="subs">${items || '<p class="muted">لا يوجد مشاركون بعد.</p>'}</div>
      ${c.type === 'submit' ? '<p class="muted small" style="margin:0">«رفض» يحذف الإرسال فتُلغى نقاطه، ويمكن للمشارك أن يرسل من جديد.</p>' : ''}
    </section>`;
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
async function mark(c, d, list, done, el) {
  const wasPerfect = isPerfect(d);
  const wasFull = isFull(c, d);
  const late = !onTime(c, d);
  const add = (i) => { S.myLogs.add(key(c.id, d, i)); S.logs.push({ challenge_id: c.id, day: d, item: i, late, created_at: new Date().toISOString() }); };
  const del = (i) => { S.myLogs.delete(key(c.id, d, i)); S.logs = S.logs.filter((l) => !(l.challenge_id === c.id && l.day === d && l.item === i)); };
  list.forEach(done ? add : del);
  if (done) {
    const r = el?.getBoundingClientRect();
    FX.float(el, late ? '+0' : `+${(c.points ?? 1) * list.length}`);
    if (late) toast('سُجّل دون نقاط: انتهت مدّة النقاط لهذا اليوم.');
    FX.chime();
    FX.buzz();
    if (r) FX.confetti(isFull(c, d) && !wasFull ? 50 : 14, { x: r.left + r.width / 2, y: r.top });
  }
  render();
  const results = await Promise.all(list.map((i) => toggle(S.memberId, c.id, d, done, i)));
  if (results.some((ok) => !ok)) {
    list.forEach((i, k) => { if (!results[k]) (done ? del : add)(i); });
    return render();
  }
  if (done && isFull(c, d) && !wasFull && !late) {
    if (N(c) > 1 && S.pop) closePop();
    const st = streakOf(c, d);
    if (S.streakBonus && st && st % 7 === 0) celebrate({ icon: '🔥', title: `${st} أيام متتالية!`, text: `سلسلة رائعة في «${c.title}». واصل!`, pts: S.streakBonus });
  }
  if (done && !late && !wasPerfect && isPerfect(d)) {
    celebrate({ icon: '✨', title: 'يوم مثالي!', text: 'أكملت كل مهام اليوم. ما شاء الله، تبارك الرحمن!', pts: S.perfectBonus || 0 });
  }
  await loadRanks();
  checkRewards();
  render();
}

// العدّاد: يُستبدل تسجيل اليوم بالقيمة الجديدة (0 = مسح)
async function setCount(c, d, v, el) {
  const late = !onTime(c, d);
  const old = logsOf(c, d);
  const wasPerfect = isPerfect(d);
  const before = valueOf(c, d);
  closePop();
  if (old.length) {
    const { error } = await sb.from('habit_logs').delete().match({ member_id: S.memberId, challenge_id: c.id, day: d });
    if (error) return toast('تعذّر الحفظ.', true);
    S.logs = S.logs.filter((l) => !(l.challenge_id === c.id && l.day === d));
    S.myLogs.delete(key(c.id, d));
  }
  if (v > 0) {
    const { data, error } = await sb.from('habit_logs').insert({ member_id: S.memberId, challenge_id: c.id, day: d, item: 0, value: v }).select('late').single();
    if (error) { toast('تعذّر الحفظ.', true); return render(); }
    S.logs.push({ challenge_id: c.id, day: d, item: 0, value: v, late: data?.late ?? late, created_at: new Date().toISOString() });
    S.myLogs.add(key(c.id, d));
    if (v > before) {
      FX.float(el, late ? '+0' : `+${Math.round((v - before) * (c.points ?? 1))}`);
      FX.chime();
      FX.buzz();
    }
    if (late) toast('سُجّل دون نقاط: انتهت مدّة النقاط لهذا اليوم.');
    else if (!wasPerfect && isPerfect(d)) celebrate({ icon: '✨', title: 'يوم مثالي!', text: 'أكملت كل مهام اليوم. ما شاء الله، تبارك الرحمن!', pts: S.perfectBonus || 0 });
  }
  await loadRanks();
  checkRewards();
  render();
}

// إنجاز تحدٍّ (مرة واحدة)، مع قيمة (نتيجة الأسئلة) أو محتوى مرسَل
async function completeOnce(c, extra = {}) {
  const row = { member_id: S.memberId, challenge_id: c.id, day: today(), item: 0, ...extra };
  const { error } = await sb.from('habit_logs').insert(row);
  if (error && error.code !== '23505') { toast(error.code === '42501' ? 'لا يمكن تسجيل هذا التحدّي.' : 'تعذّر الحفظ، أعد المحاولة.', true); render(); return false; }
  S.logs.push({ challenge_id: c.id, day: today(), item: 0, value: extra.value ?? null, payload: extra.payload ?? null, late: false, created_at: new Date().toISOString() });
  S.myLogs.add(key(c.id, today()));
  S.quest = null;
  S.qz = null;
  const pts = Math.round((c.points ?? 1) * Number(extra.value ?? 1));
  celebrate({ icon: c.icon || '🎯', title: 'تحدٍّ منجز!', text: `أنهيت «${c.title}». بارك الله فيك!`, pts });
  await loadRanks();
  checkRewards();
  render();
  return true;
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
  v.querySelectorAll('[data-wd]').forEach((b) => b.addEventListener('click', () => onDay(b)));
  v.querySelectorAll('[data-wk]').forEach((b) =>
    b.addEventListener('click', () => { const k = Number(b.dataset.wk); S.weekOff = k ? Math.min(0, S.weekOff + k) : 0; closePop(); render(); })
  );
  v.querySelectorAll('[data-rank]').forEach((b) =>
    b.addEventListener('click', () => { S.boardId = Number(b.dataset.rank); S.period = 'week'; go('board'); })
  );
  v.querySelectorAll('[data-open]').forEach((b) =>
    b.addEventListener('click', () => { S.openId = Number(b.dataset.open); S.detMonth = null; closePop(); render(); window.scrollTo({ top: 0 }); })
  );
  $('#back-today')?.addEventListener('click', () => { S.openId = null; closePop(); render(); });
  v.querySelectorAll('[data-mnav]').forEach((b) =>
    b.addEventListener('click', () => {
      const [y, m] = (S.detMonth || today().slice(0, 7)).split('-').map(Number);
      S.detMonth = iso(new Date(y, m - 1 + Number(b.dataset.mnav), 1)).slice(0, 7);
      closePop();
      render();
    })
  );
  v.querySelectorAll('[data-video]').forEach((b) =>
    b.addEventListener('click', () => { S.video ??= {}; const id = Number(b.dataset.video); S.video[id] = !S.video[id]; render(); })
  );
  // التحديات الخاصة
  v.querySelectorAll('[data-quest]').forEach((b) =>
    b.addEventListener('click', () => { const id = Number(b.dataset.quest); S.quest = S.quest === id ? null : id; if (S.qz?.cid !== S.quest) S.qz = null; render(); })
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
    b.addEventListener('click', () => {
      b.disabled = true;
      completeOnce(S.challenges.find((x) => x.id === Number(b.dataset.qdone)));
    })
  );
  v.querySelectorAll('[data-qzstart]').forEach((b) => b.addEventListener('click', () => {
    S.qz = { cid: Number(b.dataset.qzstart) };
    render();
  }));
  $('#sub-file')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) { S.subNote = $('#sub-note')?.value || ''; S.subFile = { cid: S.quest, file: f }; render(); } });
  $('#rec-start')?.addEventListener('click', () => { S.subNote = $('#sub-note')?.value || ''; startRec(S.challenges.find((x) => x.id === S.quest)); });
  $('#rec-stop')?.addEventListener('click', () => REC.rec?.stop());
  $('#rec-again')?.addEventListener('click', () => { Object.assign(REC, { blob: null, url: null, cid: null, secs: 0 }); render(); });
  v.querySelectorAll('[data-subsend]').forEach((b) => b.addEventListener('click', () => sendSubmission(S.challenges.find((x) => x.id === Number(b.dataset.subsend)), b)));
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
  v.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { S.editing = { start_date: today(), active: true }; render(); window.scrollTo({ top: 0 }); }));
  v.querySelectorAll('[data-type]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = TYPES[b.dataset.type];
      S.editing = { ...S.editing, type: b.dataset.type, kind: t.kind, icon: t.icon, title: t.title, points: t.kind === 'once' ? 20 : 5,
        items: b.dataset.type === 'prayer' ? [...PRAYERS] : b.dataset.type === 'adhkar' ? ['أذكار الصباح', 'أذكار المساء'] : null,
        meta: b.dataset.type === 'quran' ? { mode: 'read', amount: 1, unit: 'صفحة' } : {},
        raws: b.dataset.type === 'quiz' ? [{ t: 'mcq', q: '', a: '', b: '1' }] : undefined };
      render();
      window.scrollTo({ top: 0 });
    })
  );
  v.querySelectorAll('[data-track]').forEach((b) => b.addEventListener('click', () => { readForm(); S.editing.meta = { ...S.editing.meta, track: b.dataset.track }; render(); }));
  if (S.editing?.type === 'quiz') bindBuilder(v);
  $('#f-retype')?.addEventListener('click', () => { S.editing = { start_date: S.editing.start_date, active: true }; render(); });
  v.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    const x = S.challenges.find((c) => c.id === Number(b.dataset.edit));
    S.editing = { ...x, meta: { ...(x.meta || {}) }, raws: x.type === 'quiz' ? quizQuestions(x).map(qToRaw) : undefined };
    render();
    window.scrollTo({ top: 0 });
  }));
  v.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { readForm(); S.editing.kind = b.dataset.kind; render(); }));
  v.querySelectorAll('[data-tpl]').forEach((b) =>
    b.addEventListener('click', async () => {
      const t = TEMPLATES[Number(b.dataset.tpl)];
      b.disabled = true;
      const { error } = await sb.from('challenges').insert({ ...t, kind: 'daily', items: t.items || null, meta: t.meta || null, sort: S.challenges.length + 1, start_date: today() });
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
    const kind = ['quiz', 'submit', 'book'].includes(f.type) ? 'once' : f.kind || TYPES[f.type].kind;
    if (f.type === 'quiz') {
      const qs = f.meta.questions || [];
      if (!qs.length) return toast('أضف سؤالًا واحدًا على الأقل.', true);
      const bad = qs.map((q, k) => qProblem(q, k + 1)).find(Boolean);
      if (bad) return toast(bad, true);
    }
    const row = {
      type: f.type, kind, icon: firstIcon(f.icon), title: f.title, description: f.description || null,
      start_date: f.start_date || today(), end_date: f.end_date || null, active: f.active,
      points: Math.max(0, Math.min(1000, Number(f.points) || 0)), video_url: f.video_url || null,
      items: kind === 'daily' && f.items?.length > 1 ? f.items : null, pdf_url: f.type === 'book' ? f.pdf_url || null : null,
      quiz: kind === 'once' ? f.quiz || null : null, meta: f.meta && Object.keys(f.meta).length ? JSON.parse(JSON.stringify(f.meta)) : null,
    };
    if (!row.title) return toast('العنوان إجباري.', true);
    if (['prayer', 'adhkar'].includes(f.type) && !f.items?.length) return toast('اختر عنصرًا واحدًا على الأقل.', true);
    if (f.type === 'video' && !youtubeId(row.video_url)) return toast('ضع رابط فيديو يوتيوب صالحًا.', true);
    if (f.type === 'book' && !row.pdf_url && !$('#f-pdf-file')?.files?.[0]) return toast('ارفع ملف PDF أو ضع رابطه.', true);

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
  v.querySelectorAll('[data-av]').forEach((b) => b.addEventListener('click', () => { S.adm.view = b.dataset.av; S.adm.off = 0; S.adm.month = null; render(); }));
  v.querySelectorAll('[data-an]').forEach((b) => b.addEventListener('click', () => {
    const k = Number(b.dataset.an);
    if (S.adm.view === 'week') S.adm.off = Math.min(0, S.adm.off + k);
    else { const [y, m] = (S.adm.month || today().slice(0, 7)).split('-').map(Number); S.adm.month = iso(new Date(y, m - 1 + k, 1)).slice(0, 7); }
    render();
  }));
  const signed = async (path) => { const { data, error } = await sb.storage.from('submissions').createSignedUrl(path, 3600); if (error) toast('تعذّر فتح الملف.', true); return data?.signedUrl; };
  v.querySelectorAll('[data-open-file]').forEach((b) => b.addEventListener('click', async () => {
    const w = window.open('', '_blank');
    const url = await signed(b.dataset.openFile);
    if (url && w) w.location = url; else w?.close();
  }));
  v.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', async () => {
    const url = await signed(b.dataset.play);
    const box = v.querySelector(`[data-player="${CSS.escape(b.dataset.play)}"]`);
    if (url && box) { box.innerHTML = `<audio controls autoplay src="${esc(url)}"></audio>`; b.hidden = true; }
  }));
  v.querySelectorAll('[data-reject]').forEach((b) => b.addEventListener('click', () => {
    const c = S.challenges.find((x) => x.id === S.detailId);
    S.pending = {
      label: `${c.type === 'submit' ? 'رفض إرسال' : 'إلغاء إنجاز'} ${b.dataset.n}؟ تُحذف نقاطه ويمكنه المحاولة من جديد.`,
      run: async () => {
        const { data: ls } = await sb.from('habit_logs').select('payload').match({ member_id: Number(b.dataset.reject), challenge_id: c.id });
        const files = (ls || []).flatMap((l) => [l.payload?.file?.path, l.payload?.audio?.path]).filter(Boolean);
        const { error } = await sb.from('habit_logs').delete().match({ member_id: Number(b.dataset.reject), challenge_id: c.id });
        if (error) return toast('تعذّر الحذف.', true);
        if (files.length) await sb.storage.from('submissions').remove(files);
        toast('تم');
        await loadAll();
      },
    };
    render();
  }));
  v.querySelectorAll('.ac[data-u]').forEach((td) =>
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
const soundIcon = () => {
  $('#sound-btn').innerHTML = FX.sound
    ? '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>'
    : '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5"/></svg>';
  $('#sound-btn').setAttribute('aria-pressed', String(FX.sound));
};
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
