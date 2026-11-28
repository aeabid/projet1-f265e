'use strict';
// اختبر حفظك: أسئلة من محفوظ الطالب، برواية قالون عن نافع
// النص: بيانات مجمع الملك فهد لطباعة المصحف الشريف (KFGQPC Qaloon v10) — العدّ المدني الأول (6214 آية)

let QALOON = null;
async function loadQaloon() {
  if (!QALOON) {
    const r = await fetch('/qaloon.json');
    if (!r.ok) throw new Error('تعذّر تحميل نص المصحف، أعد المحاولة');
    QALOON = (await r.json()).suras;
  }
  return QALOON;
}

// ---------- أدوات ----------
// تطبيع للمقارنة فقط (العرض يبقى بالرسم العثماني كما هو)
const qzNorm = (t) =>
  String(t || '')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/[ےى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
const qzWords = (t) => String(t).split(' ').filter(Boolean);
const qzPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const qzShuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
// مقطع من الآية بعدد من الكلمات (مع «…» إن قُطع)
const qzClip = (words, n) => (words.length > n ? `${words.slice(0, n).join(' ')} …` : words.join(' '));
const QZ_TYPES = {
  complete: { name: 'أكمل الآية', desc: 'ترى بداية الآية وتختار تكملتها', icon: '✍️' },
  next: { name: 'الآية التالية', desc: 'ترى آية وتختار التي بعدها', icon: '⬅️' },
  sura: { name: 'في أي سورة؟', desc: 'ترى آية وتحدّد سورتها', icon: '📖' },
  similar: { name: 'المتشابهات', desc: 'آيات تتشابه بدايتها في محفوظك: اختر التكملة الصحيحة', icon: '🔀' },
  missing: { name: 'الكلمة الناقصة', desc: 'ترى الآية وقد خُفيت منها كلمة فتختارها', icon: '🧩' },
};

// ---------- آيات المحفوظ ----------
// المحفوظ مقاطع (سورة، من آية، إلى آية) بعدّ المصحف المعتاد؛ نحوّلها إلى آيات قالون (العدّ المدني) بالتناسب داخل السورة
function qzPool(mem, suras) {
  const want = new Map();
  for (const id of Object.keys(mem || {}).map(Number)) {
    const g = QD.segments[id];
    if (!g) continue;
    (want.get(g.sura) || want.set(g.sura, []).get(g.sura)).push([g.from, g.to]);
  }
  const pool = [];
  for (const [s, ranges] of want) {
    const nq = suras[s - 1].length;
    const nh = QD.AYAT[s - 1];
    for (let a = 1; a <= nq; a++) {
      const h = Math.min(nh, Math.max(1, Math.round((a * nh) / nq)));
      if (!ranges.some(([f, t]) => h >= f && h <= t)) continue;
      const text = suras[s - 1][a - 1];
      pool.push({ s, a, text, words: qzWords(text), n: qzNorm(text) });
    }
  }
  return pool;
}

// ---------- مولّدات الأسئلة ----------
function qzGenerators(pool, seen = {}) {
  const key = (v) => `${v.s}:${v.a}`;
  const inPool = new Map(pool.map((v) => [key(v), v]));
  const bySura = new Map();
  for (const v of pool) (bySura.get(v.s) || bySura.set(v.s, []).get(v.s)).push(v);
  const suraIds = [...bySura.keys()];
  // نصوص تتكرر في أكثر من سورة لا تصلح لسؤال «في أي سورة»
  const textSuras = new Map();
  for (const v of pool) (textSuras.get(v.n) || textSuras.set(v.n, new Set()).get(v.n)).add(v.s);
  // الخيارات الخاطئة: من نفس السورة أولًا ثم من باقي المحفوظ، بلا تكرار في المعنى
  const distract = (correct, cands, make, n = 3) => {
    const seen = new Set([qzNorm(correct)]);
    const out = [];
    for (const c of cands) {
      const t = make(c);
      const k = qzNorm(t);
      if (!t || seen.has(k)) continue;
      seen.add(k);
      out.push(t);
      if (out.length === n) break;
    }
    return out;
  };
  const near = (v) => [...qzShuffle(bySura.get(v.s).filter((x) => x !== v)), ...qzShuffle(pool.filter((x) => x.s !== v.s))];
  const options = (correct, wrong) => (wrong.length < 2 ? null : qzShuffle([{ t: correct, ok: true }, ...wrong.map((t) => ({ t, ok: false }))]));
  const ref = (v) => ({ s: v.s, a: v.a });

  // المتشابهات: آيات تشترك في أول ثلاث كلمات (أو كلمتين) وتختلف بعدها
  const groups = [];
  for (const len of [3, 2]) {
    const m = new Map();
    for (const v of pool) {
      if (v.words.length < len + 2) continue;
      const k = qzNorm(v.words.slice(0, len).join(' '));
      (m.get(k) || m.set(k, []).get(k)).push(v);
    }
    for (const list of m.values()) {
      const uniq = [...new Map(list.map((v) => [v.n, v])).values()];
      if (uniq.length >= 2 && uniq.length <= 12 && new Set(uniq.map((v) => v.s)).size >= 2) groups.push({ len, list: uniq });
    }
    if (groups.length >= 8) break;
  }

  // اختيار الآية: سؤال محدّد (want: لإعادة سؤال أخطأ فيه)، أو آية لم يُسأل عنها في هذا النوع،
  // فإن سُئل عن الكل نختار من أقدمها سؤالًا — فلا يحسّ الطالب بالتكرار
  const pickV = (list, type, want) => {
    if (want) return list.find((x) => x.s === want.s && x.a === want.a) || null;
    if (!list.length) return null;
    const fresh = list.filter((x) => !seen[`${type}:${x.s}:${x.a}`]);
    if (fresh.length) return qzPick(fresh);
    const old = [...list].sort((a, b) => seen[`${type}:${a.s}:${a.a}`] - seen[`${type}:${b.s}:${b.a}`]);
    return qzPick(old.slice(0, Math.max(1, Math.ceil(old.length / 3))));
  };
  const src = (v, p) => ({ s: v.s, a: v.a, ...(p !== undefined ? { p } : {}) });
  // منع الالتباس: لا يكون للسؤال إلا جواب صحيح واحد من محفوظ الطالب
  const startKey = (x, n) => qzNorm(x.words.slice(0, n).join(' '));
  // آيات أخرى في نفس السورة تبدأ بنفس الكلمات المعروضة
  const twins = (v, n) => bySura.get(v.s).filter((x) => x !== v && x.words.length > n && startKey(x, n) === startKey(v, n));
  // نزيد كلمات حتى تتميّز بداية الآية في سورتها؛ وإن لم تتميّز نترك السؤال
  const uniqueStart = (v, n) => {
    while (n < v.words.length - 1 && twins(v, n).length) n++;
    return twins(v, n).length || n >= v.words.length - 1 ? null : n;
  };
  const textCount = new Map();
  for (const v of pool) textCount.set(v.n, (textCount.get(v.n) || 0) + 1);
  const poolTexts = new Set(pool.map((v) => v.n));

  return {
    complete(want) {
      const v = pickV(pool.filter((x) => x.words.length >= 5), 'complete', want);
      if (!v) return null;
      // موضع القطع يتغيّر في كل مرة (بين 30% و65% من الآية) إلا عند إعادة سؤال أخطأ فيه
      const k0 = want?.p >= 2 && want.p < v.words.length - 1 ? want.p : Math.max(2, Math.min(v.words.length - 2, Math.round(v.words.length * (0.3 + Math.random() * 0.35))));
      const k = uniqueStart(v, k0);
      if (k === null) return null;
      const rest = qzClip(v.words.slice(k), 9);
      const wrong = distract(rest, near(v), (x) => {
        if (x.words.length < 3) return null;
        const c = Math.max(1, Math.round(x.words.length * (0.3 + Math.random() * 0.35)));
        return qzClip(x.words.slice(c), 9);
      });
      const opts = options(rest, wrong);
      return opts && { type: 'complete', title: `أكمل الآية (سورة ${QD.suraName(v.s)})`, verse: `${v.words.slice(0, k).join(' ')} …`, opts, ref: ref(v), src: src(v, k) };
    },
    next(want) {
      const v = pickV(pool.filter((x) => inPool.has(`${x.s}:${x.a + 1}`) && textCount.get(x.n) === 1), 'next', want);
      if (!v) return null;
      const nx = inPool.get(`${v.s}:${v.a + 1}`);
      const right = qzClip(nx.words, 8);
      const wrong = distract(right, near(v).filter((x) => x !== nx && x !== v), (x) => qzClip(x.words, 8));
      const opts = options(right, wrong);
      return opts && { type: 'next', title: `ما الآية التي بعدها؟ (سورة ${QD.suraName(v.s)})`, verse: v.text, opts, ref: ref(nx), src: src(v) };
    },
    sura(want) {
      const v = pickV(pool.filter((x) => x.words.length >= 3 && textSuras.get(x.n).size === 1), 'sura', want);
      if (!v) return null;
      const others = qzShuffle(suraIds.filter((s) => s !== v.s));
      for (let d = 1; others.length < 3 && d < 114; d++) for (const s of [v.s - d, v.s + d]) if (s >= 1 && s <= 114 && !others.includes(s)) others.push(s);
      const opts = qzShuffle([{ t: QD.suraName(v.s), ok: true }, ...others.slice(0, 3).map((s) => ({ t: QD.suraName(s), ok: false }))]);
      return { type: 'sura', title: 'في أي سورة هذه الآية؟', verse: v.text, opts, plain: true, ref: ref(v), src: src(v) };
    },
    similar(want) {
      if (!groups.length) return null;
      let g;
      let v;
      if (want) {
        v = pool.find((x) => x.s === want.s && x.a === want.a);
        g = v && groups.find((x) => x.list.includes(v));
        if (!g) return null;
      } else {
        v = pickV(groups.flatMap((x) => x.list), 'similar');
        g = qzPick(groups.filter((x) => x.list.includes(v)));
      }
      // أطول بداية مشتركة بين آيات المجموعة
      let common = g.len;
      while (g.list.every((x) => x.words.length > common + 1 && qzNorm(x.words[common]) === qzNorm(v.words[common]))) common++;
      // إن شاركتها آية أخرى من نفس السورة هذه البداية نزيد كلمات حتى تتميّز (مثل: قل هو الذي أنشأكم / قل هو الذي ذرأكم)
      const shown = uniqueStart(v, common);
      if (shown === null) return null;
      // المتشابه الحقيقي: آيات من سور أخرى تبدأ بنفس الكلمات المعروضة
      const alike = pool.filter((x) => x !== v && x.s !== v.s && x.words.length > shown + 1 && startKey(x, shown) === startKey(v, shown));
      if (!alike.length) return null;
      const tail = (x) => (x.words.length > shown + 1 ? qzClip(x.words.slice(shown), 7) : null);
      const right = tail(v);
      const wrong = distract(right, [...qzShuffle(alike), ...near(v).filter((x) => !(x.s === v.s && startKey(x, shown) === startKey(v, shown)))], tail);
      const opts = options(right, wrong);
      const n = alike.length + 1;
      return opts && {
        type: 'similar', title: `أكمل في سورة ${QD.suraName(v.s)}`, verse: `${v.words.slice(0, shown).join(' ')} …`,
        hint: `تتشابه هذه البداية في ${n === 2 ? 'موضعين' : `${n} ${n <= 10 ? 'مواضع' : 'موضعًا'}`} من محفوظك، في سور مختلفة`, opts, ref: ref(v), src: src(v),
      };
    },
    missing(want) {
      const v = pickV(pool.filter((x) => x.words.length >= 4), 'missing', want);
      if (!v) return null;
      const idx = qzShuffle(v.words.map((_, i) => i).filter((i) => i > 0 && qzNorm(v.words[i]).length >= 3));
      if (!idx.length) return null;
      const i = want && idx.includes(want.p) ? want.p : idx[0];
      const right = v.words[i];
      const L = qzNorm(right).length;
      const cands = near(v).flatMap((x) => qzShuffle(x.words)).filter((w) => Math.abs(qzNorm(w).length - L) <= 2);
      const fits = (w) => poolTexts.has(qzNorm([...v.words.slice(0, i), w, ...v.words.slice(i + 1)].join(' ')));
      const wrong = distract(right, cands.filter((w) => !fits(w)), (w) => w);
      const opts = options(right, wrong);
      return opts && {
        type: 'missing', title: `ما الكلمة الناقصة؟ (سورة ${QD.suraName(v.s)})`,
        verse: v.words.map((w, k) => (k === i ? '<span class="qz-gap">⬚</span>' : esc(w))).join(' '), raw: true, opts, ref: ref(v), src: src(v, i),
      };
    },
  };
}

// ---------- ذاكرة الطالب: ما سُئل عنه، وما أخطأ فيه (على هذا الجهاز) ----------
const qzKeyOf = (q) => `${q.type}:${q.src.s}:${q.src.a}`;
const qzStoreName = () => `qz:${state.user.id}`;
function qzStore() {
  try {
    return { seen: {}, wrong: [], ...JSON.parse(localStorage.getItem(qzStoreName()) || '{}') };
  } catch {
    return { seen: {}, wrong: [] };
  }
}
function qzSaveStore(st) {
  st.seen = Object.fromEntries(Object.entries(st.seen).sort((a, b) => b[1] - a[1]).slice(0, 4000));
  st.wrong = st.wrong.slice(-200);
  try { localStorage.setItem(qzStoreName(), JSON.stringify(st)); } catch {}
}

// بناء الاختبار: الأسئلة التي أخطأ فيها تعود أولًا (حتى نصف الاختبار)، ثم أسئلة جديدة موزّعة على الأنواع
function qzBuild(pool, types, count, store, only = null) {
  const gen = qzGenerators(pool, store.seen);
  const out = [];
  const used = new Set();
  const add = (q, review) => {
    if (!q || used.has(qzKeyOf(q))) return false;
    used.add(qzKeyOf(q));
    out.push(review ? { ...q, review: true } : q);
    return true;
  };
  const redo = (only || store.wrong.filter((w) => types.includes(w.type))).slice(0, only ? count : Math.ceil(count / 2));
  for (const w of qzShuffle(redo)) add(gen[w.type]?.(w), true);
  if (only) return out;
  const order = [];
  while (order.length < count) order.push(...qzShuffle(types));
  for (const t of order) {
    if (out.length >= count) break;
    for (const type of [t, ...qzShuffle(types.filter((x) => x !== t))]) {
      let ok = false;
      for (let k = 0; k < 12 && !ok; k++) ok = add(gen[type]());
      if (ok) break;
    }
  }
  return qzShuffle(out);
}

// ---------- الواجهة ----------
const QZ_KEY = 'qzSettings';
const qzSettings = () => {
  try {
    return { types: Object.keys(QZ_TYPES), count: 10, ...JSON.parse(localStorage.getItem(QZ_KEY) || '{}') };
  } catch {
    return { types: Object.keys(QZ_TYPES), count: 10 };
  }
};

async function viewQuiz(el) {
  if (state.user.role !== 'talib') {
    el.innerHTML = '<div class="card empty-state"><span>🧠</span><p>الاختبارات للطلبة: كل طالب يُختبر في محفوظه.</p></div>';
    return;
  }
  el.innerHTML = '<p class="muted loading">جاري تحميل المصحف برواية قالون…</p>';
  const [{ student }, suras] = await Promise.all([api('GET', `/api/quran/students/${state.user.id}`), loadQaloon()]);
  const pool = qzPool(student.memorized, suras);
  if (!pool.length) {
    el.innerHTML = `<div class="page-head"><h2>🧠 اختبر حفظك</h2></div>
      <div class="card empty-state"><span>📗</span><p>حدّد محفوظك أولًا، ثم تأتيك الأسئلة منه.</p><a class="btn" href="#/my-hifz">تحديد المحفوظ</a></div>`;
    return;
  }
  const set = qzSettings();
  set.types = set.types.filter((t) => QZ_TYPES[t]);
  if (!set.types.length) set.types = Object.keys(QZ_TYPES);
  let last = null;
  try { last = JSON.parse(localStorage.getItem('qzLast') || 'null'); } catch {}
  const suraCount = new Set(pool.map((v) => v.s)).size;
  const store = qzStore();
  const draw = () => {
    el.innerHTML = `<div class="qz-setup">
      <div class="qz-hero"><div><h2>🧠 اختبر حفظك</h2>
        <p>أسئلة من محفوظك فقط: <b>${pool.length}</b> آية في <b>${suraCount}</b> ${suraCount > 2 && suraCount < 11 ? 'سور' : 'سورة'}</p>
        <small>برواية قالون عن نافع</small>
        ${store.wrong.length ? `<span class="qz-redo-note">🔁 ${store.wrong.length} ${store.wrong.length === 1 ? 'سؤال أخطأت فيه يعود' : store.wrong.length === 2 ? 'سؤالان أخطأت فيهما يعودان' : 'أسئلة أخطأت فيها تعود'} في اختبارك حتى تصحّحها</span>` : ''}</div>
        ${last ? `<span class="qz-last"><b>${last.score}/${last.total}</b><small>آخر نتيجة</small></span>` : ''}</div>
      <h3 class="qz-h">نوع الأسئلة</h3>
      <div class="qz-types">${Object.entries(QZ_TYPES).map(([k, t]) => `<label class="qz-type ${set.types.includes(k) ? 'on' : ''}">
          <input type="checkbox" value="${k}" ${set.types.includes(k) ? 'checked' : ''}>
          <span class="qz-check" aria-hidden="true"></span>
          <span class="qz-type-txt"><b>${t.icon} ${t.name}</b><small>${t.desc}</small></span></label>`).join('')}</div>
      <h3 class="qz-h">عدد الأسئلة</h3>
      <div class="q-seg rec-seg qz-count">${[5, 10, 20].map((n) => `<a href="javascript:void 0" data-n="${n}" class="${set.count === n ? 'on' : ''}">${n}</a>`).join('')}</div>
      <p class="muted small qz-src">النص: مصحف مجمع الملك فهد برواية قالون عن نافع (العدّ المدني).</p>
      <div class="qz-start"><button type="button" class="btn block" id="qz-go">ابدأ الاختبار</button></div></div>`;
    el.querySelectorAll('.qz-type input').forEach((c) =>
      c.addEventListener('change', () => {
        set.types = [...el.querySelectorAll('.qz-type input:checked')].map((x) => x.value);
        c.closest('.qz-type').classList.toggle('on', c.checked);
        $('#qz-go').disabled = !set.types.length;
      })
    );
    el.querySelectorAll('.qz-count [data-n]').forEach((a) =>
      a.addEventListener('click', () => {
        set.count = Number(a.dataset.n);
        el.querySelectorAll('.qz-count a').forEach((x) => x.classList.toggle('on', x === a));
      })
    );
    $('#qz-go').addEventListener('click', () => {
      try { localStorage.setItem(QZ_KEY, JSON.stringify(set)); } catch {}
      const qs = qzBuild(pool, set.types, set.count, store);
      if (!qs.length) return toast('محفوظك قليل لهذا النوع من الأسئلة، اختر نوعًا آخر', true);
      qzRun(el, qs, () => draw(), { store, pool });
    });
  };
  draw();
}

function qzRun(el, qs, onExit, ctx) {
  let i = 0;
  const answers = [];
  const refTxt = (r) => `سورة ${QD.suraName(r.s)} · الآية ${r.a}`;
  // أثناء الاختبار: نخفي الشريط السفلي ليتّسع السؤال
  document.body.classList.add('qz-mode');
  window.addEventListener('hashchange', () => document.body.classList.remove('qz-mode'), { once: true });
  const show = () => {
    const q = qs[i];
    const t = QZ_TYPES[q.type];
    el.innerHTML = `<div class="qz-run">
      <div class="qz-top"><button type="button" class="qz-x" id="qz-x" aria-label="إنهاء">✕</button>
        <div class="qz-prog"><i style="width:${(i / qs.length) * 100}%"></i></div><span class="qz-n">${i + 1}/${qs.length}</span></div>
      <div class="qz-meta"><span class="qz-pill">${t.icon} ${t.name}</span>${q.review ? '<span class="qz-pill redo">🔁 أخطأت فيه سابقًا</span>' : ''}</div>
      <h3 class="qz-q">${esc(q.title)}</h3>
      ${q.hint ? `<p class="qz-hint">💡 ${esc(q.hint)}</p>` : ''}
      <div class="qz-verse qtxt">${q.raw ? q.verse : esc(q.verse)}</div>
      <div class="qz-opts">${q.opts.map((o, k) => `<button type="button" class="qz-opt ${q.plain ? 'plain' : ''}" data-k="${k}" style="--d:${k * 60}ms">
        <span class="qz-k">${'أبجد'[k]}</span><span class="qz-t ${q.plain ? '' : 'qtxt'}">${esc(o.t)}</span></button>`).join('')}</div>
      <button type="button" class="qz-idk" id="qz-idk">لا أعرف</button>
      <div class="qz-after" id="qz-after" hidden></div></div>`;
    $('#qz-x').addEventListener('click', () => {
      if (i === 0 || confirmAction('إنهاء الاختبار؟')) answers.length ? result() : (document.body.classList.remove('qz-mode'), onExit());
    });
    const answer = (k) => {
      const ok = k !== null && q.opts[k].ok;
      answers.push({ q, ok, k });
      // الذاكرة: ما سُئل عنه لا يتكرر قريبًا، وما أخطأ فيه يعود حتى يصحّحه
      const key = qzKeyOf(q);
      ctx.store.seen[key] = Date.now();
      ctx.store.wrong = ctx.store.wrong.filter((w) => qzKeyOf({ type: w.type, src: w }) !== key);
      if (!ok) ctx.store.wrong.push({ type: q.type, ...q.src });
      qzSaveStore(ctx.store);
      el.querySelectorAll('.qz-opt').forEach((b, j) => {
        b.disabled = true;
        if (q.opts[j].ok) b.classList.add('right');
        else if (j === k) b.classList.add('wrong');
        else b.classList.add('dim');
      });
      $('#qz-idk').hidden = true;
      if (q.type === 'missing') {
        const gap = el.querySelector('.qz-gap');
        if (gap) {
          gap.textContent = q.opts.find((o) => o.ok).t;
          gap.classList.add(ok ? 'ok' : 'bad');
        }
      }
      const after = $('#qz-after');
      after.hidden = false;
      after.innerHTML = `<div class="qz-fb ${ok ? 'ok' : 'bad'}"><b>${ok ? '✓ أحسنت' : k === null ? 'لا بأس، هذا الجواب' : '✗ ليست هذه'}</b>
          <span>${refTxt(q.ref)}</span></div>
        <button type="button" class="btn block" id="qz-next">${i + 1 < qs.length ? 'السؤال التالي' : 'عرض النتيجة'}</button>`;
      if (navigator.vibrate) navigator.vibrate(ok ? 30 : [40, 60, 40]);
      $('#qz-next').addEventListener('click', () => {
        ++i < qs.length ? show() : result();
        window.scrollTo(0, 0);
      });
      $('#qz-next').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    el.querySelectorAll('.qz-opt').forEach((b) => b.addEventListener('click', () => answer(Number(b.dataset.k))));
    $('#qz-idk').addEventListener('click', () => answer(null));
  };
  const result = () => {
    document.body.classList.remove('qz-mode');
    const score = answers.filter((a) => a.ok).length;
    const total = answers.length;
    const p = Math.round((score / total) * 100);
    try { localStorage.setItem('qzLast', JSON.stringify({ score, total, at: Date.now() })); } catch {}
    const msg = p === 100 ? 'ما شاء الله، حفظ متقن! 🌟' : p >= 80 ? 'أحسنت، حفظك جيد جدًا' : p >= 50 ? 'جيد، راجع ما أخطأت فيه' : 'تحتاج إلى مراجعة هذه المواضع';
    const byType = Object.keys(QZ_TYPES)
      .map((k) => [k, answers.filter((a) => a.q.type === k)])
      .filter(([, l]) => l.length);
    const wrong = answers.filter((a) => !a.ok);
    el.innerHTML = `<div class="qz-res">
      <div class="qz-score"><span class="qz-ring" style="--p:${p}"><b>${score}<small>/${total}</small></b></span>
        <h2>${msg}</h2><p class="muted">${p}% إجابات صحيحة</p></div>
      <div class="card"><h3>حسب نوع السؤال</h3>${byType.map(([k, l]) => {
        const s = l.filter((a) => a.ok).length;
        return `<div class="qz-row"><span>${QZ_TYPES[k].icon} ${QZ_TYPES[k].name}</span><b>${s}/${l.length}</b>
          <span class="q-bar ${s === l.length ? 'ok' : ''}"><i style="width:${(s / l.length) * 100}%"></i></span></div>`;
      }).join('')}</div>
      ${wrong.length ? `<details class="card qz-review" open><summary><h3>مواضع تحتاج مراجعة (${wrong.length})</h3></summary>
        ${wrong.map((a) => `<div class="qz-rv"><small>${refTxt(a.q.ref)} · ${QZ_TYPES[a.q.type].name}</small>
          <p class="qtxt">${esc(QALOON[a.q.ref.s - 1][a.q.ref.a - 1])}</p></div>`).join('')}</details>` : ''}
      ${wrong.length ? `<button type="button" class="btn block qz-redo" id="qz-redo">🔁 أعد الأسئلة التي أخطأت فيها (${wrong.length})</button>` : ''}
      <div class="qz-res-actions"><button type="button" class="btn" id="qz-again">اختبار جديد</button><a class="btn ghost" href="#/home">الرئيسية</a></div></div>`;
    $('#qz-again').addEventListener('click', onExit);
    $('#qz-redo')?.addEventListener('click', () => {
      const again = qzBuild(ctx.pool, [], wrong.length, ctx.store, wrong.map((a) => ({ type: a.q.type, ...a.q.src })));
      if (again.length) qzRun(el, qzShuffle(again), onExit, ctx);
    });
    window.scrollTo(0, 0);
  };
  show();
}

routes.unshift([/^#\/quiz$/, viewQuiz]);
