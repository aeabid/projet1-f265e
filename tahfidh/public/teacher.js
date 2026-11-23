'use strict';
// واجهات المعلّم: الطلبة (بطاقات + حضور الحصة)، السجل الشامل، التحديات، تقييم الحصة، وعرض التقييمات

const Q_ATT_ICON = { present: '✓', absent: '✗', excused: '!' };
const attChip = (a) => (a ? `<span class="att-chip ${a}">${Q_ATT_ICON[a]} ${Q_ATT[a]}</span>` : '<span class="att-chip none">—</span>');
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const sessionOf = (d, ws) => qAddDays(d, -((dow(d) - ws + 7) % 7));
// التقييم: نقاط من 1 إلى 5 (والقيم القديمة تظهر كما هي)
const starsTxt = (v) => {
  if (!v) return '';
  if (/^[1-5]$/.test(v)) return `<span class="stars" title="${v} من 5">${'★'.repeat(+v)}<i>${'★'.repeat(5 - v)}</i></span>`;
  return `<span class="badge ${v}">${Q_RATING[v] || esc(v)}</span>`;
};
const starInput = (name, value = '') =>
  `<span class="star-in" data-name="${name}"><input type="hidden" name="${name}" value="${/^[1-5]$/.test(value || '') ? value : ''}">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" data-v="${n}" aria-label="${n} من 5">★</button>`).join('')}</span>`;
function bindStars(root) {
  root.querySelectorAll('.star-in').forEach((box) => {
    const inp = box.querySelector('input');
    const paint = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= Number(inp.value || 0)));
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      inp.value = inp.value === b.dataset.v ? '' : b.dataset.v;
      paint();
    });
    box._set = (v) => ((inp.value = /^[1-5]$/.test(v || '') ? v : ''), paint());
    paint();
  });
}
const attSeg = (name, value) =>
  `<span class="att-seg">${Object.entries(Q_ATT)
    .map(([k, l]) => `<label class="${k}"><input type="radio" name="${name}" value="${k}" ${value === k ? 'checked' : ''}><span>${Q_ATT_ICON[k]} ${l}</span></label>`).join('')}</span>`;

// ---------- الطلبة: بطاقات، وحضور حصة الأسبوع ----------
async function quranStudentsTab(page, d, root) {
  if (!d.students.length) {
    page.innerHTML = '<div class="card empty-state"><span>📖</span><p>لا يوجد طلبة بعد. أضف مجموعة ثم طالبًا جديدًا.</p></div>';
    return;
  }
  const t = today();
  let ref = t;
  page.innerHTML = `<div class="card ses-card">
      <div class="ses-nav"><button type="button" class="ses-btn" id="ses-prev" aria-label="الحصة السابقة">→</button>
        <div class="ses-label" id="ses-label"></div>
        <button type="button" class="ses-btn" id="ses-next" aria-label="الحصة الموالية">←</button></div>
      <div class="ses-sum" id="ov-sum"></div>
      <div class="ses-actions"><button type="button" class="btn small ghost" id="ov-all">✓ الكل حاضر</button><button type="button" class="btn small" id="ov-save">حفظ الحضور</button></div>
    </div>
    <div class="q-filters">
      <input type="search" id="q-search" placeholder="🔍 بحث بالاسم…">
      <select id="q-group"><option value="">كل المجموعات</option>${d.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="none">بلا مجموعة</option></select>
      <select id="q-sort"><option value="name">ترتيب بالاسم</option><option value="review">الأقل وردًا أولًا</option><option value="hifz">الأكثر حفظًا أولًا</option><option value="absent">الغائبون أولًا</option></select>
    </div>
    <div class="st-cards" id="ov-body"></div>
    <label class="check small muted"><input type="checkbox" id="q-off"> إظهار الطلبة المتوقفين</label>`;
  let saved = {};
  let draft = {};
  let sessions = {};
  const visible = () => {
    const q = $('#q-search').value.trim();
    const g = $('#q-group').value;
    const sort = $('#q-sort').value;
    let list = d.students.filter((x) => (x.active || $('#q-off').checked) && (!q || x.full_name.includes(q)) && (!g || (g === 'none' ? !x.group_id : String(x.group_id) === g)));
    if (sort === 'review') list = [...list].sort((a, b) => (a.review?.percent ?? 101) - (b.review?.percent ?? 101));
    if (sort === 'hifz') list = [...list].sort((a, b) => b.solid_hizb + b.weak_hizb - (a.solid_hizb + a.weak_hizb));
    if (sort === 'absent') list = [...list].sort((a, b) => (draft[b.id] && draft[b.id] !== 'present') - (draft[a.id] && draft[a.id] !== 'present'));
    return list;
  };
  const mainSession = () => {
    const c = {};
    visible().forEach((s) => sessions[s.id] && (c[sessions[s.id]] = (c[sessions[s.id]] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || sessionOf(ref, 6);
  };
  const header = () => {
    const ses = mainSession();
    const cur = ses === sessionOf(t, dow(ses));
    $('#ses-label').innerHTML = `<small>${cur ? 'حصة هذا الأسبوع' : 'حصة سابقة'}</small><b>${qDay(ses)} ${fmtDate(ses)}</b>`;
    $('#ses-next').disabled = qAddDays(ref, 7) > t;
  };
  const summary = () => {
    const list = visible().filter((x) => x.active);
    const n = (k) => list.filter((x) => draft[x.id] === k).length;
    const none = list.filter((x) => !draft[x.id]).length;
    const dirty = Object.keys({ ...saved, ...draft }).some((k) => saved[k] !== draft[k]);
    $('#ov-sum').innerHTML = `<span class="att-chip present">✓ ${n('present')} حاضر</span><span class="att-chip absent">✗ ${n('absent')} غائب</span>
      <span class="att-chip excused">! ${n('excused')} بعذر</span>${none ? `<span class="att-chip none">${none} لم يُسجَّل</span>` : ''}
      ${dirty ? '<b class="q-unsaved">● غير محفوظ</b>' : ''}`;
  };
  const main = () => mainSession();
  const render = () => {
    const ms = main();
    $('#ov-body').innerHTML = visible()
      .map((s) => {
        const r = s.review || {};
        const l = s.lesson;
        const a = draft[s.id] || '';
        const own = sessions[s.id] && sessions[s.id] !== ms ? `<small class="st-ses">حصته: ${qDay(sessions[s.id])} ${qShort(sessions[s.id])}</small>` : '';
        return `<article class="st-card ${a ? `att-${a}` : ''} ${s.active ? '' : 'off'}" data-id="${s.id}">
          <div class="st-top"><a href="#/quran/student/${s.id}" class="st-id">${avatar(s, 'md')}
            <span><b>${esc(s.full_name)}</b><small>${[s.group_name ? `🕌 ${esc(s.group_name)}` : 'بلا مجموعة', s.age && `${s.age} سنة`].filter(Boolean).join(' · ')}</small>${own}</span></a>
            ${s.active ? '' : '<span class="badge general">متوقف</span>'}
            <button type="button" class="st-del" data-del-st="${s.id}" title="حذف الطالب" aria-label="حذف الطالب">🗑</button></div>
          <div class="st-stats">
            <div><small>المحفوظ</small><b>${hizbTxt(s.solid_hizb + s.weak_hizb)}</b></div>
            <div><small>الورد هذا الأسبوع</small><b>${r.percent ?? 0}%</b>${bar(r.percent || 0, 100)}</div>
            <div><small>تكرار المقرر</small><b>${l ? `${l.week_total}/${l.target}` : '—'}</b>${l ? bar(l.week_total, l.target, l.week_total >= l.target ? 'ok' : '') : ''}</div>
          </div>
          ${s.active ? attSeg(`ov${s.id}`, a) : ''}
        </article>`;
      })
      .join('') || '<p class="muted">لا نتائج.</p>';
    $('#ov-body').querySelectorAll('[data-del-st]').forEach((x) =>
      x.addEventListener('click', async () => {
        const s = d.students.find((y) => y.id === Number(x.dataset.delSt));
        if (!confirmAction(`حذف ${s.full_name} وكل متابعته نهائيًا؟\n(إن كان سيعود لاحقًا فالأفضل تعديله إلى «متوقف»)`)) return;
        try {
          await api('DELETE', `/api/quran/students/${s.id}`);
          toast('تم حذف الطالب');
          viewQuranHome(root, 'students');
        } catch (e) {
          toast(e.message, true);
        }
      })
    );
    header();
    summary();
  };
  const load = async () => {
    const r = await api('GET', `/api/quran/attendance?week=${ref}`);
    saved = r.marks;
    sessions = r.sessions;
    draft = { ...saved };
    render();
  };
  ['q-search', 'q-group', 'q-sort', 'q-off'].forEach((id) => $(`#${id}`).addEventListener(id === 'q-search' ? 'input' : 'change', render));
  $('#ses-prev').addEventListener('click', () => ((ref = qAddDays(ref, -7)), load()));
  $('#ses-next').addEventListener('click', () => {
    ref = qAddDays(ref, 7) > t ? t : qAddDays(ref, 7);
    load();
  });
  $('#ov-body').addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    draft[e.target.name.slice(2)] = e.target.value;
    const card = e.target.closest('.st-card');
    card.classList.remove('att-present', 'att-absent', 'att-excused');
    card.classList.add(`att-${e.target.value}`);
    summary();
  });
  $('#ov-all').addEventListener('click', () => {
    for (const s of visible()) if (s.active && !draft[s.id]) draft[s.id] = 'present';
    render();
  });
  $('#ov-save').addEventListener('click', async () => {
    const out = Object.fromEntries(Object.entries(draft).filter(([k, v]) => saved[k] !== v));
    if (!Object.keys(out).length) return toast('لا يوجد تغيير للحفظ');
    try {
      const r = await api('POST', '/api/quran/attendance', { week: ref, marks: out });
      saved = { ...draft };
      summary();
      toast(`تم حفظ حضور ${r.saved} طالب ✓`);
    } catch (e) {
      toast(e.message, true);
    }
  });
  await load();
}

// ---------- السجل الشامل لمجموعة: خريطة حرارية متحركة ----------
const REC_METRICS = [
  ['all', 'نظرة عامة'],
  ['att', 'الحضور'],
  ['ward', 'الورد'],
  ['reps', 'التكرار'],
];
const heat = (p) => (p === null || p === undefined ? 'h0' : p <= 0 ? 'h0' : p < 25 ? 'h1' : p < 50 ? 'h2' : p < 75 ? 'h3' : p < 100 ? 'h4' : 'h5');

async function viewQuranRecord(el, gid, n = 4, to = '') {
  const r = await api('GET', `/api/quran/groups/${gid}/record?weeks=${n}${to ? `&to=${to}` : ''}`);
  const href = (nn, tt) => `#/quran/record/${gid}?w=${nn}${tt ? `&to=${tt}` : ''}`;
  const olderTo = qAddDays(r.weeks[0], -1);
  const newerRef = qAddDays(r.weeks[r.weeks.length - 1], 7 * n);
  const newerTo = newerRef > r.today ? '' : newerRef;
  const curWeek = sessionOf(r.today, r.group.meet_day);
  const T = r.target;
  let metric = localStorage.getItem('recMetric') || 'all';
  let sort = 'name';
  const order = r.weeks.map((_, i) => i).reverse(); // الأحدث أولًا
  const repsPct = (w) => Math.round((w.reps / T) * 100);

  // ملخّص الفترة لكل طالب
  const tot = (s) => {
    const marked = s.weeks.filter((w) => w.att).length;
    const present = s.weeks.filter((w) => w.att === 'present').length;
    const read = s.weeks.reduce((t, w) => t + w.read, 0);
    const reps = s.weeks.reduce((t, w) => t + w.reps, 0);
    return {
      marked, present,
      att: marked ? Math.round((present / marked) * 100) : null,
      ward: s.memorized ? Math.round((read / (s.memorized * n)) * 100) : null,
      reps: Math.round((reps / (T * n)) * 100),
    };
  };
  const totals = new Map(r.students.map((s) => [s.id, tot(s)]));
  const avg = (k) => {
    const v = r.students.map((s) => totals.get(s.id)[k]).filter((x) => x !== null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };

  const cell = (s, w, k) => {
    const d = `data-s="${s.id}" data-w="${k}"`;
    if (metric === 'att') return `<button type="button" class="hm att-${w.att || 'none'}" ${d}>${w.att ? Q_ATT_ICON[w.att] : '·'}</button>`;
    if (metric === 'ward') return `<button type="button" class="hm ${heat(w.ward)}" ${d}><b>${w.ward ?? 0}<small>%</small></b><small>${num(w.read)} ح</small></button>`;
    if (metric === 'reps') return `<button type="button" class="hm ${heat(repsPct(w))}" ${d}><b>${w.reps}</b><small>/${T}</small></button>`;
    return `<button type="button" class="hm hm-all att-${w.att || 'none'}" ${d}>
        <i class="hm-dot"></i>
        <span class="mb ward"><i style="--v:${Math.min(100, w.ward || 0)}%"></i></span>
        <span class="mb reps"><i style="--v:${Math.min(100, repsPct(w))}%"></i></span></button>`;
  };
  const totCell = (s) => {
    const t = totals.get(s.id);
    if (metric === 'att') return `<b>${t.present}<small>/${t.marked || n}</small></b>`;
    if (metric === 'ward') return `<b>${t.ward ?? '—'}${t.ward !== null ? '<small>%</small>' : ''}</b>`;
    if (metric === 'reps') return `<b>${t.reps}<small>%</small></b>`;
    return `<span class="ring" style="--p:${t.att ?? 0}"><b>${t.att ?? '—'}</b></span>`;
  };
  const sorted = () => {
    const list = [...r.students];
    if (sort === 'name') return list;
    const k = metric === 'all' ? 'att' : metric;
    return list.sort((a, b) => (totals.get(b.id)[k] ?? -1) - (totals.get(a.id)[k] ?? -1));
  };
  const legend = () =>
    metric === 'att' ? '<span class="lg att-present">✓ حاضر</span><span class="lg att-absent">✗ غائب</span><span class="lg att-excused">! بعذر</span><span class="lg att-none">· لم يُسجَّل</span>'
    : metric === 'all' ? '<span class="lg-i"><i class="dot p"></i>الحضور</span><span class="lg-i"><i class="bar w"></i>الورد</span><span class="lg-i"><i class="bar r"></i>التكرار</span><span class="lg-i">⭕ نسبة الحضور</span>'
    : `<span class="lg-scale">${['h0', 'h1', 'h2', 'h3', 'h4', 'h5'].map((h) => `<i class="${h}"></i>`).join('')}</span><span>0%</span><span>←</span><span>100%+</span>`;

  const draw = () => {
    const grid = $('#hm-grid');
    grid.style.setProperty('--cols', r.weeks.length);
    grid.innerHTML = `<div class="hm-row hm-head"><span class="hm-name">الطالب</span>
        ${order.map((i) => `<span class="hm-wk ${r.weeks[i] === curWeek ? 'cur' : ''}">${qShort(r.weeks[i])}${r.weeks[i] === curWeek ? '<small>الآن</small>' : ''}</span>`).join('')}
        <span class="hm-wk hm-totl">المجموع</span></div>
      ${sorted().map((s, row) => `<div class="hm-row" style="--i:${row}">
        <a class="hm-name" href="#/quran/student/${s.id}" title="${esc(s.full_name)}">${avatar(s, 'xs')}<span>${esc(s.full_name)}</span></a>
        ${order.map((i) => cell(s, s.weeks[i], i)).join('')}
        <span class="hm-tot">${totCell(s)}</span></div>`).join('')}`;
    $('#hm-legend').innerHTML = legend();
    el.querySelectorAll('.rec-metric button').forEach((b) => b.classList.toggle('on', b.dataset.m === metric));
    $('#hm-sort').textContent = sort === 'name' ? '↕ بالاسم' : '↓ الأعلى أولًا';
  };

  el.innerHTML = `<p><a href="#/quran/groups">→ السجل</a></p>
    <div class="rec-hero">
      <div><h2>${esc(r.group.name)}</h2><small>حصة يوم ${Q_DAYS[r.group.meet_day]} · ${r.students.length} طالب</small></div>
      <div class="rec-kpis">
        <span><b>${avg('att') ?? '—'}%</b><small>الحضور</small></span>
        <span><b>${avg('ward') ?? '—'}%</b><small>الورد</small></span>
        <span><b>${avg('reps') ?? '—'}%</b><small>التكرار</small></span></div>
    </div>
    <div class="rec-metric" role="tablist">${REC_METRICS.map(([k, l]) => `<button type="button" data-m="${k}">${l}</button>`).join('')}</div>
    <div class="rec-bar">
      <a class="ses-btn" href="${href(n, olderTo)}" aria-label="أسابيع أقدم">→</a>
      <span class="rec-mid"><b class="rec-range">${qShort(r.weeks[0])} – ${qShort(qAddDays(r.weeks[r.weeks.length - 1], 6))}</b>
        <span class="rec-n2">${[4, 6, 8, 12].map((k) => `<a href="${href(k, to)}" class="${k === n ? 'on' : ''}">${k}</a>`).join('')}<small>أسابيع</small></span></span>
      ${r.has_next ? `<a class="ses-btn" href="${href(n, newerTo)}" aria-label="أسابيع أحدث">←</a>` : '<span class="ses-btn" aria-disabled="true">←</span>'}
    </div>
    ${r.students.length ? `<div class="card hm-card">
        <div class="hm-tools"><div class="hm-legend" id="hm-legend"></div><button type="button" class="chip-btn" id="hm-sort"></button></div>
        <div class="hm-scroll" id="hm-scroll"><div class="hm-grid" id="hm-grid"></div></div>
        <p class="muted small hm-hint">اضغط على أي خانة لرؤية التفاصيل · اسحب يمينًا أو يسارًا للتنقّل بين الأسابيع</p></div>`
      : '<div class="card empty-state"><span>👥</span><p>لا يوجد طلبة في هذه المجموعة.</p></div>'}`;
  if (!r.students.length) return;
  draw();

  el.querySelectorAll('.rec-metric button').forEach((b) =>
    b.addEventListener('click', () => {
      metric = b.dataset.m;
      try { localStorage.setItem('recMetric', metric); } catch {}
      draw();
    })
  );
  $('#hm-sort').addEventListener('click', () => ((sort = sort === 'name' ? 'top' : 'name'), draw()));
  // تفاصيل الخانة في لوحة سفلية
  $('#hm-grid').addEventListener('click', (e) => {
    const b = e.target.closest('.hm[data-s]');
    if (!b) return;
    const s = r.students.find((x) => x.id === Number(b.dataset.s));
    const w = s.weeks[Number(b.dataset.w)];
    const wk = r.weeks[Number(b.dataset.w)];
    recSheet(`<div class="sh-head">${avatar(s, 'md')}<div><b>${esc(s.full_name)}</b><small>حصة ${qDay(wk)} ${fmtDate(wk)}${wk === curWeek ? ' · هذا الأسبوع' : ''}</small></div></div>
      <div class="sh-att">${attChip(w.att)}${w.hifz_eval ? `<span>الحفظ ${starsTxt(w.hifz_eval)}</span>` : ''}${w.ada_eval ? `<span>الأداء ${starsTxt(w.ada_eval)}</span>` : ''}</div>
      <div class="sh-stat"><div><span>📖 الورد</span><b>${w.ward ?? 0}%</b></div>
        <div class="q-bar ${w.ward >= 100 ? 'ok' : ''}"><i style="width:${Math.min(100, w.ward || 0)}%"></i></div>
        <small>قرأ ${num(w.read)} حزب من محفوظه (${hizbTxt(s.memorized)}) · ${w.days} ${w.days === 1 ? 'يوم' : 'أيام'}</small></div>
      <div class="sh-stat"><div><span>🔁 تكرار المقرر</span><b>${w.reps}/${T}</b></div>
        <div class="q-bar ${w.reps >= T ? 'ok' : ''}"><i style="width:${Math.min(100, repsPct(w))}%"></i></div></div>
      <div class="sh-actions"><a class="btn small ghost" href="#/quran/student/${s.id}">صفحة الطالب</a>
        <a class="btn small ghost" href="#/quran/student/${s.id}?week=${wk}">أسبوعه بالتفصيل</a></div>`);
  });
  // السحب للتنقّل بين الأسابيع (عند عدم وجود تمرير أفقي)
  const sc = $('#hm-scroll');
  let x0 = null;
  let y0 = null;
  sc.addEventListener('touchstart', (e) => ((x0 = e.touches[0].clientX), (y0 = e.touches[0].clientY)), { passive: true });
  sc.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx)) return;
    if (sc.scrollWidth > sc.clientWidth + 4) return; // الجدول يتمرّر: نترك التمرير الطبيعي
    if (dx > 0) location.hash = href(n, olderTo);
    else if (r.has_next) location.hash = href(n, newerTo);
  });
}
function recSheet(html) {
  document.querySelector('.sheet-wrap')?.remove();
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet" role="dialog"><span class="sheet-grip"></span>${html}</div>`;
  const close = () => {
    w.classList.add('out');
    setTimeout(() => w.remove(), 220);
  };
  w.addEventListener('click', (e) => (e.target === w || e.target.closest('a')) && close());
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(w);
}

// ---------- التحديات: ترتيب طلبة المجموعة ----------
async function viewChallenges(el, qs = '') {
  const p = new URLSearchParams(qs);
  const period = p.get('period') || 'week';
  const r = await api('GET', `/api/quran/challenges?period=${period}${p.get('g') ? `&group_id=${p.get('g')}` : ''}`);
  const href = (per, g) => `#/challenges?period=${per}${g ? `&g=${g}` : ''}`;
  const gid = r.group?.id || '';
  const staff = isStaff();
  const medal = (k) => (k === 1 ? '🥇' : k === 2 ? '🥈' : k === 3 ? '🥉' : k ?? '—');
  const PER = { week: 'هذا الأسبوع', month: 'هذا الشهر', all: 'منذ بدايته' };
  const HOW = {
    attendance: 'عدد الحصص التي حضرها ÷ عدد الحصص المسجّلة. الغياب بعذر يُحسب حصة لم يحضرها، لكنه يظهر منفصلًا في التفاصيل.',
    lesson: 'مجموع تكرارات المقرر ÷ (60 × عدد الأسابيع). من بلغ 60 في كل أسبوع نال 100%.',
    ward: `<b>النقاط = الأحزاب التي قرأها × نسبة إنجازه</b> (والنسبة لا تتجاوز 100%).<br>
      فمن أتمّ مراجعة محفوظه نال نقاطًا بعدد الأحزاب التي قرأها، ومن لم يتمّه نقصت نقاطه بقدر ما بقي.<br>
      مثال: حافظ حزبين راجعهما كاملين = <b>2</b> نقطة · حافظ 40 راجعها كاملة = <b>40</b> نقطة · حافظ 40 راجع 10 فقط (25%) = 10 × 25% = <b>2,5</b> نقطة.`,
  };
  const board = (k, title, icon, list, val, bar, detail) => `<section class="card rk-card">
    <div class="section-head"><h3>${icon} ${title}</h3></div>
    <details class="rk-how"><summary>ℹ️ كيف يُحسب الترتيب؟</summary><p>${HOW[k]}</p></details>
    <ol class="rk-list">${list.map((x) => {
      const open = staff || x.me;
      return `<li class="${x.me ? 'me' : ''} ${x.rank && x.rank <= 3 ? `top top${x.rank}` : ''} ${open ? 'tap' : ''}" ${open ? `data-st="${x.id}" data-k="${k}" role="button" tabindex="0"` : ''}>
        <span class="rk-pos">${medal(x.rank)}</span>${avatar(x, 'sm')}
        <span class="rk-name"><b>${esc(x.full_name)}${x.me ? ' <small>(أنت)</small>' : ''}</b><small>${detail(x)}</small>
          <span class="q-bar ${bar(x) >= 100 ? 'ok' : ''}"><i style="width:${Math.min(100, bar(x) || 0)}%"></i></span></span>
        <b class="rk-val">${val(x)}</b>${open ? '<span class="rk-go">‹</span>' : ''}</li>`;
    }).join('')}</ol></section>`;
  const maxPts = Math.max(1, ...(r.rankings?.ward || []).map((x) => x.ward_points || 0));
  el.innerHTML = `<div class="page-head"><h2>🏆 التحديات</h2>${r.group ? `<span class="pill">🕌 ${esc(r.group.name)}</span>` : ''}</div>
    ${r.groups.length > 1 ? `<label class="rk-group">المجموعة<select id="rk-g">${r.groups.map((g) => `<option value="${g.id}" ${g.id === gid ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
    <div class="q-seg rec-seg rk-seg">${[['week', 'هذا الأسبوع'], ['month', 'هذا الشهر'], ['all', 'الإجمالي']]
      .map(([k, l]) => `<a href="${href(k, p.get('g'))}" class="${k === period ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${!r.rankings ? '<div class="card empty-state"><span>🏆</span><p>التحديات تكون بين طلبة المجموعة الواحدة. لست في مجموعة بعد.</p></div>'
      : !r.rankings.attendance.length ? '<div class="card empty-state"><span>👥</span><p>لا يوجد طلبة في هذه المجموعة.</p></div>'
      : board('attendance', 'الحضور', '🕌', r.rankings.attendance, (x) => (x.attendance === null ? '—' : `${x.attendance}%`), (x) => x.attendance,
          (x) => (x.marked ? `حضر ${x.present} من ${x.marked} ${x.marked > 2 ? 'حصص' : 'حصة'}` : 'لم يُسجَّل حضور بعد')) +
        board('lesson', 'تكرار المقرر', '🔁', r.rankings.lesson, (x) => `${x.lesson}%`, (x) => x.lesson, (x) => `${x.reps} من ${x.reps_target} تكرارًا`) +
        board('ward', 'الورد', '📖', r.rankings.ward, (x) => (x.ward_points === null ? '—' : `${num(x.ward_points)}<small> نقطة</small>`),
          (x) => ((x.ward_points || 0) / maxPts) * 100,
          (x) => (x.ward_target ? `قرأ ${num(x.read)} من ${num(x.ward_target)} حزبًا (${x.ward}%)` : 'لم يحدّد محفوظه بعد'))}
    ${staff || r.rankings?.attendance.some((x) => x.me) ? '<p class="muted small rk-tip">اضغط على الطالب لرؤية التفاصيل التي أدّت إلى نتيجته.</p>' : ''}`;
  $('#rk-g')?.addEventListener('change', (e) => (location.hash = href(period, e.target.value)));
  const openDetail = async (li) => {
    try {
      const d = await api('GET', `/api/quran/challenges/student/${li.dataset.st}?period=${period}`);
      challengeSheet(d, li.dataset.k, PER[period]);
    } catch (e) {
      toast(e.message, true);
    }
  };
  el.querySelectorAll('.rk-list li[data-st]').forEach((li) => {
    li.addEventListener('click', () => openDetail(li));
    li.addEventListener('keydown', (e) => e.key === 'Enter' && openDetail(li));
  });
}

// تفاصيل نتيجة الطالب: المعادلة بأرقامه، ثم أسبوعًا بأسبوع
function challengeSheet(d, focus, perLabel) {
  const s = d.student;
  const blocks = {
    attendance: `<div class="sh-stat ${focus === 'attendance' ? 'focus' : ''}"><div><span>🕌 الحضور</span><b>${s.attendance ?? '—'}${s.attendance !== null ? '%' : ''}</b></div>
      <div class="sh-chips"><span class="att-chip present">✓ ${s.present}</span><span class="att-chip absent">✗ ${s.absent}</span><span class="att-chip excused">! ${s.excused}</span></div>
      <code class="sh-eq">${s.marked ? `${s.present} حضور ÷ ${s.marked} حصص = ${s.attendance}%` : 'لا حصص مسجّلة في هذه الفترة'}</code></div>`,
    lesson: `<div class="sh-stat ${focus === 'lesson' ? 'focus' : ''}"><div><span>🔁 تكرار المقرر</span><b>${s.lesson}%</b></div>
      <code class="sh-eq">${s.reps} تكرارًا ÷ (60 × ${s.weeks} ${s.weeks > 2 ? 'أسابيع' : 'أسبوع'}) = ${s.lesson}%</code></div>`,
    ward: `<div class="sh-stat ${focus === 'ward' ? 'focus' : ''}"><div><span>📖 الورد</span><b>${s.ward_points === null ? '—' : `${num(s.ward_points)} نقطة`}</b></div>
      ${s.memorized ? `<code class="sh-eq">المطلوب: ${num(s.memorized)} حزب محفوظ × ${s.weeks} ${s.weeks > 2 ? 'أسابيع' : 'أسبوع'} = ${num(s.ward_target)} حزب</code>
        <code class="sh-eq">الإنجاز: قرأ ${num(s.read)} ÷ ${num(s.ward_target)} = ${s.ward}%</code>
        <code class="sh-eq">النقاط: ${num(s.read)} × ${Math.min(100, s.ward)}% = ${num(s.ward_points)}</code>` : '<small>لم يحدّد الطالب محفوظه بعد.</small>'}</div>`,
  };
  const order = [focus, ...['attendance', 'lesson', 'ward'].filter((k) => k !== focus)];
  recSheet(`<div class="sh-head">${avatar(s, 'md')}<div><b>${esc(s.full_name)}</b><small>🏆 ${esc(d.group.name)} · ${perLabel}${s.memorized ? ` · المحفوظ ${hizbTxt(s.memorized)}` : ''}</small></div></div>
    <div class="sh-scroll">
      ${order.map((k) => blocks[k]).join('')}
      <h4 class="sh-sub">أسبوعًا بأسبوع</h4>
      <div class="sh-weeks">${d.weeks.map((w) => `<div class="sh-wk">
          <span class="sh-wd">${qShort(w.start)}</span>${attChip(w.att)}
          <span class="${heat(w.ward)} sh-pill">📖 ${num(w.read)} ح${w.ward !== null ? ` · ${w.ward}%` : ''}</span>
          <span class="${heat(Math.round((w.reps / d.target) * 100))} sh-pill">🔁 ${w.reps}/${d.target}</span></div>`).join('')}</div>
    </div>
    ${isStaff() ? `<div class="sh-actions"><a class="btn small ghost" href="#/quran/student/${s.id}">صفحة الطالب</a><a class="btn small ghost" href="#/quran/history/${s.id}">سجلّه</a></div>` : ''}`);
}

// ---------- تقييم الحصة ----------
function quranMeetingForm(full, preset = {}, onDone) {
  const st = full.student;
  const t = today();
  const cur = sessionOf(t, st.week_start);
  const list = Array.from({ length: 8 }, (_, i) => qAddDays(cur, -7 * i));
  const start = preset.date ? sessionOf(preset.date, st.week_start) : cur;
  if (!list.includes(start)) list.push(start);
  const mOf = (s) => full.meetings.find((x) => x.date >= s && x.date <= qAddDays(s, 6)) || {};
  const lessonOf = (s) => full.lessons.find((l) => l.assigned_on <= qAddDays(s, 6));
  const info = (s) => {
    const l = lessonOf(s);
    const wk = s === cur && full.lesson && l && full.lesson.id === l.id ? full.lesson.week_total : null;
    return `<div class="mf-info"><span class="mf-k">📝 المقرر (كما كتبه الطالب)</span>
      ${l ? `<b>${esc(l.content)}</b> <small class="muted">${athmanTxt(l.athman)} · أُملي ${fmtDate(l.assigned_on)}</small>
        ${wk !== null ? `<span class="mf-reps">🔁 ${wk}/${l.target} هذا الأسبوع</span>` : ''}` : '<span class="muted">لم يكتب الطالب مقررًا بعد.</span>'}
      ${s === cur ? `<span class="mf-k">📖 الورد هذا الأسبوع</span><b>${full.progress.percent ?? 0}%</b>` : ''}</div>`;
  };
  const m = mOf(start);
  openModal(
    `✍️ تقييم ${st.full_name}`,
    `<label>الحصة<select name="date" id="mf-date">${list.sort().reverse()
      .map((d) => `<option value="${d}" ${d === start ? 'selected' : ''}>${qDay(d)} ${fmtDate(d)}${d === cur ? ' (هذا الأسبوع)' : ''}${mOf(d).id ? ' ✓' : ''}</option>`).join('')}</select></label>
     <div class="mf-att">${attSeg('attendance', preset.attendance || m.attendance || 'present')}</div>
     <div id="mf-rates">
       <div class="mf-rate"><span>الحفظ</span>${starInput('hifz_eval', m.hifz_eval)}</div>
       <div class="mf-rate"><span>الأداء</span>${starInput('ada_eval', m.ada_eval)}</div></div>
     <label>ملاحظة للطالب<textarea name="note" rows="3" placeholder="تصل الطالب في الإشعارات">${esc(m.note || '')}</textarea></label>
     <div id="mf-info">${info(start)}</div>`,
    async (data) => {
      const absent = data.attendance !== 'present';
      await api('POST', `/api/quran/students/${st.id}/meetings`, {
        date: data.date, attendance: data.attendance, note: data.note,
        hifz_eval: absent ? '' : data.hifz_eval, ada_eval: absent ? '' : data.ada_eval,
      });
      onDone();
    }
  );
  const f = $('#modal-form');
  bindStars(f);
  const toggle = () => ($('#mf-rates').hidden = f.querySelector('input[name=attendance]:checked')?.value !== 'present');
  f.querySelectorAll('input[name=attendance]').forEach((x) => x.addEventListener('change', toggle));
  toggle();
  $('#mf-date').addEventListener('change', (e) => {
    const s = e.target.value;
    const mm = mOf(s);
    f.querySelectorAll('input[name=attendance]').forEach((x) => (x.checked = x.value === (mm.attendance || 'present')));
    f.querySelector('.star-in[data-name=hifz_eval]')._set(mm.hifz_eval);
    f.querySelector('.star-in[data-name=ada_eval]')._set(mm.ada_eval);
    f.querySelector('textarea[name=note]').value = mm.note || '';
    $('#mf-info').innerHTML = info(s);
    toggle();
  });
}

// ---------- عرض التقييمات والملاحظات (مطويّة عند الطالب) ----------
function meetingsList(meetings, staff) {
  if (!meetings.length) return '<p class="muted">لا تقييمات مسجّلة بعد.</p>';
  return `<div class="meets">${meetings
    .map((m, i) => `<details class="meet att-${m.attendance}" ${(staff || i === 0) && (m.note || m.hifz_eval || m.ada_eval) ? 'open' : ''}>
      <summary><span class="meet-date"><b>${qDay(m.date)}</b> ${fmtDate(m.date)}</span>${attChip(m.attendance)}
        ${m.hifz_eval && /^[1-5]$/.test(m.hifz_eval) ? starsTxt(m.hifz_eval) : ''}${m.note ? '<span class="meet-has">📝</span>' : ''}</summary>
      <div class="meet-body">
        ${m.hifz_eval || m.ada_eval ? `<div class="meet-rates">${m.hifz_eval ? `<span>الحفظ ${starsTxt(m.hifz_eval)}</span>` : ''}${m.ada_eval ? `<span>الأداء ${starsTxt(m.ada_eval)}</span>` : ''}
          ${m.review_eval ? `<span>المراجعة ${starsTxt(m.review_eval)}</span>` : ''}${m.tajweed_eval ? `<span>التجويد ${starsTxt(m.tajweed_eval)}</span>` : ''}</div>` : ''}
        ${m.lesson_content ? `<p class="muted small">📝 المقرر: ${esc(m.lesson_content)}</p>` : ''}
        ${m.note ? `<p class="meet-note">${esc(m.note)}</p>` : ''}
        ${!m.note && !m.hifz_eval && !m.ada_eval ? `<p class="muted small">${m.attendance === 'present' ? 'حضور فقط، بلا تقييم.' : 'لا ملاحظات.'}</p>` : ''}
        <div class="meet-foot"><small class="muted">${m.by_name ? `— ${esc(m.by_name)}` : ''}</small>
          ${staff ? `<button type="button" class="link small danger" data-del-meet="${m.id}">حذف</button>` : ''}</div></div></details>`)
    .join('')}</div>`;
}

routes.unshift(
  [/^#\/quran\/record\/(\d+)(?:\?w=(\d+)(?:&to=(\d{4}-\d{2}-\d{2}))?)?$/, (el, id, w, to) => viewQuranRecord(el, Number(id), Number(w) || 4, to || '')],
  [/^#\/challenges(?:\?(.*))?$/, (el, qs) => viewChallenges(el, qs || '')]
);
