'use strict';
// حلقة التحفيظ: المشرفون (الشيخ والإدارة) يتابعون الطلبة، والطالب يحدّد محفوظه ويختار ما يراجعه ويعدّ قراءات درسه
// البيانات: quran-data.js (globalThis.QURAN)

const QD = globalThis.QURAN;
const Q_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const Q_RATING = { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', weak: 'ضعيف' };
const Q_ATT = { present: 'حاضر', absent: 'غائب', excused: 'غائب بعذر' };
const Q_ATT_CLS = { present: 'good', absent: 'weak', excused: 'average' };
const isStaff = () => state.user?.role === 'admin';
const qDay = (d) => Q_DAYS[new Date(`${d}T00:00:00Z`).getUTCDay()];
const qShort = (d) => `${Number(d.slice(8, 10))}/${Number(d.slice(5, 7))}`;
const qAddDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const num = (n) => String(Math.round((n || 0) * 10) / 10).replace('.', ',');
const hizbTxt = (n) => `${num(n)} حزب`;
const pct = (done, total) => (total ? Math.min(100, Math.round((done / total) * 100)) : 0);
const bar = (done, total, cls = '') => `<div class="q-bar ${cls}"><i style="width:${pct(done, total)}%"></i></div>`;
const ratingBadge = (v, label) => (v ? `<span class="badge ${v}">${label}: ${Q_RATING[v]}</span>` : '');
const ratingSelect = (name, label, value = '') =>
  `<label>${label}<select name="${name}"><option value="">—</option>${Object.entries(Q_RATING)
    .map(([k, l]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${l}</option>`)
    .join('')}</select></label>`;
const daySelect = (name, value) =>
  `<select name="${name}">${Q_DAYS.map((d, i) => `<option value="${i}" ${Number(value) === i ? 'selected' : ''}>${d}</option>`).join('')}</select>`;
const athmanTxt = (a) => (a === 0.5 ? 'نصف ثمن' : a === 1 ? 'ثمن' : a === 2 ? 'ثمنان' : a === 4 ? 'ربع حزب' : `${num(a)} أثمان`);
const athmanSel = (v = 1) =>
  `<select name="athman">${[[0.5, 'نصف ثمن'], [1, 'ثمن'], [2, 'ثمنان']]
    .map(([k, l]) => `<option value="${k}" ${Number(v) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
// اختيار السورة: من الفاتحة إلى الناس
const suraSelect = (value = '', required = true) =>
  `<select name="content" ${required ? 'required' : ''}><option value="">— اختر السورة —</option>${QD.NAMES
    .map((n, i) => `<option value="${n}" ${n === value ? 'selected' : ''}>${i + 1}. ${n}</option>`).join('')}
    ${value && !QD.NAMES.includes(value) ? `<option value="${esc(value)}" selected>${esc(value)}</option>` : ''}</select>`;
const athmanSelect = athmanSel(1);
const segLabel = (ids) => QD.rangeLabel([...ids].sort((a, b) => a - b).map((i) => QD.segments[i]));

// العدّاد أسبوعي: يبدأ من الصفر يوم اللقاء، وينتهي اليوم الذي يسبق اللقاء الموالي
function lessonPace(lesson, day, weekStart) {
  const back = (new Date(`${day}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
  const end = qAddDays(day, 6 - back);
  const daysLeft = Math.max(1, Math.round((Date.parse(end) - Date.parse(day)) / 864e5) + 1);
  const remaining = Math.max(0, lesson.target - (lesson.week_total ?? lesson.total));
  return { remaining, perDay: Math.ceil(remaining / daysLeft), daysLeft };
}

// تقدّم المراجعة (نفس حساب الخادم): كل المحفوظ مرة في الأسبوع
function reviewProgress(mem, reps, counts) {
  const size = (i) => QD.segments[i]?.size || 0;
  const solid = Object.keys(mem).filter((k) => mem[k] === 's').map(Number);
  const weak = Object.keys(mem).filter((k) => mem[k] === 'w').map(Number);
  const solidTotal = solid.reduce((t, i) => t + size(i), 0);
  const solidDone = solid.filter((i) => counts.get(i)).reduce((t, i) => t + size(i), 0);
  const weakTotal = weak.reduce((t, i) => t + size(i), 0) * reps;
  const weakDone = weak.reduce((t, i) => t + Math.min(counts.get(i) || 0, reps) * size(i), 0);
  return { solid_total: solidTotal, solid_done: solidDone, weak_total: weakTotal, weak_done: weakDone, weak_reps: reps,
    percent: solidTotal + weakTotal ? Math.round(((solidDone + weakDone) / (solidTotal + weakTotal)) * 100) : null };
}
function progressBlock(p) {
  if (!p || (!p.solid_total && !p.weak_total)) return '<p class="muted">حدّد المحفوظ أولًا، ثم سجّل ما تراجعه كل يوم.</p>';
  return `<div class="q-prog">
    ${p.solid_total ? `<div class="q-prog-row"><span><span class="q-dot s"></span>الورد <small>(كل المحفوظ مرة في الأسبوع)</small></span>
      ${bar(p.solid_done, p.solid_total, 'ok')}<b>${num(p.solid_done)} / ${num(p.solid_total)} حزب</b></div>` : ''}
  </div>`;
}

// ربع ← أجزاء ← سور (السورة الطويلة تظهر في كل جزء بآياتها). filter: المقاطع المعروضة فقط
function quranTree(filter = () => true) {
  return QD.QUARTERS.map((q) => {
    const segs = QD.segments.filter((g) => g.quarter === q.n && filter(g.id));
    const juzs = [...new Set(segs.map((g) => g.juz))].map((j) => {
      const js = segs.filter((g) => g.juz === j);
      const suras = [...new Set(js.map((g) => g.sura))].map((s) => {
        const ss = js.filter((g) => g.sura === s);
        const from = ss[0].from;
        const to = ss[ss.length - 1].to;
        const whole = from === 1 && to === QD.AYAT[s - 1];
        return { sura: s, ids: ss.map((g) => g.id), name: QD.suraName(s), range: whole ? '' : `${from}–${to}` };
      });
      return { juz: j, ids: js.map((g) => g.id), hizbs: [...new Set(js.map((g) => g.hizb))], suras };
    });
    return { ...q, ids: segs.map((g) => g.id), juzs };
  }).filter((q) => q.ids.length);
}
// حفظ حالة فتح الأرباع والأجزاء
function rememberOpen(root, key) {
  const open = new Set(JSON.parse(sessionStorage.getItem(key) || '[]'));
  root.querySelectorAll('details').forEach((d) => {
    if (open.has(d.dataset.key)) d.open = true;
    d.addEventListener('toggle', () => {
      d.open ? open.add(d.dataset.key) : open.delete(d.dataset.key);
      sessionStorage.setItem(key, JSON.stringify([...open]));
    });
  });
}

// ---------- الرئيسية (المشرفون) ----------
async function viewQuranHome(el, tab = '') {
  const d = await api('GET', '/api/quran/overview');
  const active = d.students.filter((s) => s.active);
  const withReview = active.filter((s) => s.review?.percent !== null && s.review?.percent !== undefined);
  const avg = withReview.length ? Math.round(withReview.reduce((t, s) => t + s.review.percent, 0) / withReview.length) : 0;
  const reached = active.filter((s) => s.lesson && s.lesson.week_total >= s.lesson.target).length;
  tab = tab === 'overview' ? 'students' : tab || sessionStorage.getItem('qTab') || 'students';
  if (!['students', 'groups', 'signups'].includes(tab)) tab = 'students';
  sessionStorage.setItem('qTab', tab);
  el.innerHTML = `
    ${heroBanner({ sub: 'تابع مراجعة الطلبة وحفظهم أسبوعًا بأسبوع.', art: '📖',
      actions: '<button type="button" class="btn" id="q-add-st">＋ طالب جديد</button><button type="button" class="btn ghost" id="q-add-g">＋ مجموعة</button>' })}
    <div class="kpis">
      <div class="kpi"><b>${active.length}</b><span>طالب</span></div>
      <div class="kpi"><b>${d.groups.length}</b><span>مجموعة</span></div>
      <div class="kpi"><b>${avg}%</b><span>معدّل إنجاز المراجعة هذا الأسبوع</span></div>
      <div class="kpi"><b class="in">${reached}</b><span>بلغ هدف تكرار المقرر</span></div>
    </div>
    <a href="#/quran/signups" class="signup-alert" id="signup-alert" hidden>📝 <span></span> <b>عرض ←</b></a>
    <div class="board-tabs" role="tablist">
      <a href="#/quran/students" class="${tab === 'students' ? 'on' : ''}"><span>👥</span>الطلبة</a>
      <a href="#/quran/groups" class="${tab === 'groups' ? 'on' : ''}"><span>🕌</span>المجموعات</a>
      <a href="#/quran/signups" class="${tab === 'signups' ? 'on' : ''}"><span>📝</span>طلبات التسجيل<b class="tab-badge" id="signup-badge" hidden></b></a>
    </div>
    <div id="q-page"></div>`;
  $('#q-add-st').addEventListener('click', () => quranStudentForm(null, d, () => viewQuranHome(el, 'students')));
  $('#q-add-g').addEventListener('click', () => quranGroupForm(null, () => viewQuranHome(el, 'groups')));
  const page = $('#q-page');
  if (tab === 'groups') return quranGroupsTab(page, d, el);
  refreshSignupBadge();
  if (tab === 'signups') return signupsTab(page, d.groups);
  return quranStudentsTab(page, d);
}

// الطلبة: جدول تقدّم كل الطلبة + حضور / غيابات اليوم المختار، في صفحة واحدة
async function quranStudentsTab(page, d) {
  if (!d.students.length) {
    page.innerHTML = '<div class="card empty-state"><span>📖</span><p>لا يوجد طلبة بعد. أضف مجموعة ثم طالبًا جديدًا.</p></div>';
    return;
  }
  const day0 = today();
  page.innerHTML = `<div class="card">
      <div class="q-filters">
        <input type="search" id="q-search" placeholder="بحث بالاسم…">
        <select id="q-group"><option value="">كل المجموعات</option>${d.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="none">بلا مجموعة</option></select>
        <select id="q-sort"><option value="name">ترتيب بالاسم</option><option value="review">الأقل مراجعة أولًا</option><option value="hifz">الأكثر حفظًا أولًا</option><option value="absent">الغائبون أولًا</option></select>
      </div>
      <div class="q-att-bar">
        <label class="q-date">📋 الحضور والغيابات ليوم <input type="date" id="ov-date" value="${day0}" max="${day0}"></label>
        <span class="q-actions"><button type="button" class="btn small ghost" id="ov-all">الكل حاضر</button><button type="button" class="btn small" id="ov-save">حفظ الحضور</button></span>
        <div class="q-att-sum" id="ov-sum"></div>
      </div>
      <div class="q-table-wrap"><table class="q-table q-ov"><thead><tr>
        <th>الطالب</th><th>المحفوظ</th><th>المراجعة هذا الأسبوع</th><th>مراجعة اليوم</th><th>المقرر</th><th>الحضور</th></tr></thead>
        <tbody id="ov-body"></tbody></table></div>
      <label class="check small muted"><input type="checkbox" id="q-off"> إظهار الطلبة المتوقفين</label>
    </div>`;
  let saved = {};
  let draft = {};
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
  const summary = () => {
    const list = d.students.filter((x) => x.active);
    const n = (k) => list.filter((x) => draft[x.id] === k).length;
    const none = list.filter((x) => !draft[x.id]).length;
    const dirty = Object.keys({ ...saved, ...draft }).some((k) => saved[k] !== draft[k]);
    const day = $('#ov-date').value;
    $('#ov-sum').innerHTML = `${day === day0 ? 'اليوم' : `${qDay(day)} ${fmtDate(day)}`}:
      <span class="badge good">حاضر ${n('present')}</span> <span class="badge weak">غائب ${n('absent')}</span>
      <span class="badge average">غائب بعذر ${n('excused')}</span>${none ? ` <span class="badge general">لم يُسجَّل ${none}</span>` : ''}
      ${dirty ? '<b class="q-unsaved">● غير محفوظ</b>' : ''}`;
  };
  const att = (s) => `<span class="q-att-opts">${Object.entries(Q_ATT)
    .map(([k, l]) => `<label class="chip-check q-${k}"><input type="radio" name="ov${s.id}" value="${k}" ${draft[s.id] === k ? 'checked' : ''}> ${l}</label>`).join('')}</span>`;
  const render = () => {
    $('#ov-body').innerHTML = visible()
      .map((s) => {
        const r = s.review || {};
        const l = s.lesson;
        const a = draft[s.id];
        return `<tr class="${a === 'absent' ? 'is-absent' : a === 'excused' ? 'is-excused' : ''} ${s.active ? '' : 'q-off'}">
          <td class="ov-name"><a href="#/quran/student/${s.id}"><b>${esc(s.full_name)}</b></a>${s.active ? '' : ' <span class="badge general">متوقف</span>'}
            <small class="q-what">${[s.group_name && esc(s.group_name), s.age && `${s.age} سنة`].filter(Boolean).join(' · ')}</small></td>
          <td data-l="المحفوظ">${hizbTxt(s.solid_hizb + s.weak_hizb)}</td>
          <td data-l="المراجعة هذا الأسبوع"><div class="q-mini">${bar(r.percent || 0, 100)}<b>${r.percent ?? 0}%</b></div></td>
          <td data-l="مراجعة اليوم" class="${s.reviewed_today ? 'in' : 'muted'}">${s.reviewed_today ? hizbTxt(s.reviewed_today) : '—'}</td>
          <td data-l="المقرر">${l ? `<div class="q-mini">${bar(l.week_total, l.target, l.week_total >= l.target ? 'ok' : '')}<b>${l.week_total}/${l.target}</b></div>` : '—'}</td>
          <td class="ov-att">${att(s)}</td></tr>`;
      })
      .join('') || '<tr><td colspan="6" class="muted">لا نتائج.</td></tr>';
    summary();
  };
  const load = async () => {
    saved = (await api('GET', `/api/quran/attendance?date=${$('#ov-date').value}`)).marks;
    draft = { ...saved };
    render();
  };
  ['q-search', 'q-group', 'q-sort', 'q-off'].forEach((id) => $(`#${id}`).addEventListener(id === 'q-search' ? 'input' : 'change', render));
  $('#ov-date').addEventListener('change', load);
  $('#ov-body').addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    draft[e.target.name.slice(2)] = e.target.value;
    const tr = e.target.closest('tr');
    tr.classList.toggle('is-absent', e.target.value === 'absent');
    tr.classList.toggle('is-excused', e.target.value === 'excused');
    summary();
  });
  $('#ov-all').addEventListener('click', () => {
    for (const s of visible()) if (!draft[s.id]) draft[s.id] = 'present';
    render();
  });
  $('#ov-save').addEventListener('click', async () => {
    const out = Object.fromEntries(Object.entries(draft).filter(([k, v]) => saved[k] !== v));
    if (!Object.keys(out).length) return toast('لا يوجد تغيير للحفظ');
    try {
      const r = await api('POST', '/api/quran/attendance', { date: $('#ov-date').value, marks: out });
      saved = { ...draft };
      summary();
      toast(`تم حفظ حضور ${r.saved} طالب ✓`);
    } catch (e) {
      toast(e.message, true);
    }
  });
  await load();
}

function quranGroupsTab(page, d, root) {
  page.innerHTML = d.groups.length
    ? `<div class="cards">${d.groups
        .map(
          (g) => `<div class="card q-group">
        <div class="section-head"><h3>🕌 ${esc(g.name)}</h3></div>
        <p class="muted small">يوم اللقاء: <b>${Q_DAYS[g.meet_day]}</b> · ${g.students} طالب</p>
        ${g.notes ? `<p class="small">${esc(g.notes)}</p>` : ''}
        <div class="q-actions"><a class="btn small" href="#/quran/group/${g.id}">📋 حصة اللقاء</a>
          <button type="button" class="btn small ghost" data-edit="${g.id}">تعديل</button>
          <button type="button" class="btn small ghost danger" data-del="${g.id}">حذف</button></div>
      </div>`
        )
        .join('')}</div>`
    : '<div class="card empty-state"><span>🕌</span><p>لا توجد مجموعات بعد. أنشئ مجموعة لكل حلقة.</p></div>';
  page.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => quranGroupForm(d.groups.find((g) => g.id === Number(b.dataset.edit)), () => viewQuranHome(root, 'groups')))
  );
  page.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف المجموعة؟ (الطلبة يبقون بلا مجموعة)')) return;
      await api('DELETE', `/api/quran/groups/${b.dataset.del}`).catch((e) => toast(e.message, true));
      viewQuranHome(root, 'groups');
    })
  );
}

function quranGroupForm(g, onDone) {
  openModal(
    g ? 'تعديل المجموعة' : 'مجموعة جديدة',
    `<label>اسم المجموعة<input name="name" required maxlength="80" value="${esc(g?.name || '')}"></label>
     <label>يوم اللقاء (بداية الأسبوع)${daySelect('meet_day', g?.meet_day ?? 6)}</label>
     <label>ملاحظات<textarea name="notes" rows="2">${esc(g?.notes || '')}</textarea></label>`,
    async (data) => {
      await api(g ? 'PUT' : 'POST', g ? `/api/quran/groups/${g.id}` : '/api/quran/groups', data);
      toast('تم الحفظ ✓');
      onDone();
    }
  );
}

// نموذج الطالب: الهوية، المجموعة، نسق المراجعة، الحساب
function quranStudentForm(s, d, onDone) {
  openModal(
    s ? `تعديل: ${s.full_name}` : 'طالب جديد',
    `<div class="row"><label>الاسم<input name="first_name" required maxlength="60" value="${esc(s?.first_name || '')}"></label>
       <label>اللقب<input name="last_name" maxlength="60" value="${esc(s?.last_name || '')}"></label></div>
     <label>العمر<input name="age" type="number" min="3" max="99" value="${s?.age ?? ''}"></label>
     <label>المجموعة<select name="group_id"><option value="">— بلا مجموعة —</option>${d.groups
       .map((g) => `<option value="${g.id}" data-day="${g.meet_day}" ${s?.group_id === g.id ? 'selected' : ''}>${esc(g.name)} (${Q_DAYS[g.meet_day]})</option>`)
       .join('')}</select></label>
     <fieldset class="q-fs"><legend>نسق المراجعة</legend>
       <label>بداية الأسبوع (عادة يوم اللقاء مع الشيخ)${daySelect('week_start', s?.week_start ?? 6)}</label>
       <p class="muted small">المحفوظ يُراجَع كله مرة واحدة في الأسبوع، والطالب يختار كل يوم ما يراجعه. والمقرر الأسبوعي يُكرَّر 60 مرة.</p>
     </fieldset>
     <fieldset class="q-fs"><legend>حساب الطالب</legend>
       ${s ? `<p class="muted small">اسم المستخدم: <b dir="ltr">${esc(s.username)}</b></p>` : '<label>اسم المستخدم<input name="username" required dir="ltr" autocomplete="off"></label>'}
       <label>${s ? 'كلمة سر جديدة (اختياري)' : 'كلمة السر'}<input name="password" ${s ? '' : 'required'} minlength="6" autocomplete="new-password"></label>
       <label>هاتف (الطالب أو وليّه)<input name="phone" type="tel" value="${esc(s?.phone || '')}"></label>
       ${s ? `<label class="check"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}> يدرس حاليًا</label>` : ''}
     </fieldset>`,
    async (data) => {
      const r = await api(s ? 'PUT' : 'POST', s ? `/api/quran/students/${s.id}` : '/api/quran/students', data);
      toast('تم الحفظ ✓');
      onDone(r.student);
    }
  );
  const sel = $('#modal-form select[name=group_id]');
  sel.addEventListener('change', () => {
    const day = sel.selectedOptions[0]?.dataset.day;
    if (day !== undefined) {
      $('#modal-form select[name=week_start]').value = day;
      $('#modal-form select[name=week_start]')._pickSync?.();
    }
  });
}

// ---------- حصة اللقاء لمجموعة: الحضور ثم تقييم كل طالب ----------
async function viewQuranGroup(el, id) {
  const d = await api('GET', '/api/quran/overview');
  const g = d.groups.find((x) => x.id === id);
  if (!g) throw new Error('المجموعة غير موجودة');
  const members = d.students.filter((s) => s.group_id === id && s.active);
  const day = today();
  el.innerHTML = `<p><a href="#/quran/groups">→ المجموعات</a></p>
    <div class="card"><div class="section-head"><h2>📋 ${esc(g.name)}</h2><label class="q-date">تاريخ اللقاء <input type="date" id="qg-date" value="${day}" max="${day}"></label></div>
      <p class="muted small">سجّل الحضور، ثم اضغط «تقييم» لكل طالب حاضر: تقييم المراجعة، تسميع المقرر، الملاحظة والمقرر الأسبوعي.</p>
      ${members.length ? `<ul class="q-att">${members
        .map((s) => `<li><span class="q-att-name">${avatar(s, 'sm')} <a href="#/quran/student/${s.id}">${esc(s.full_name)}</a>
            <small class="muted">المراجعة ${s.review?.percent ?? 0}%${s.lesson ? ` · المقرر ${s.lesson.week_total}/${s.lesson.target}` : ''}</small></span>
          <span class="q-att-opts">${Object.entries(Q_ATT)
            .map(([k, l]) => `<label class="chip-check q-${k}"><input type="radio" name="a${s.id}" value="${k}" ${k === 'present' ? 'checked' : ''}> ${l}</label>`)
            .join('')}</span>
          <button type="button" class="btn small ghost" data-eval="${s.id}">✍️ تقييم</button></li>`)
        .join('')}</ul>
      <button type="button" class="btn" id="qg-save">حفظ الحضور</button>` : '<p class="muted">لا يوجد طلبة في هذه المجموعة.</p>'}
    </div>`;
  $('#qg-save')?.addEventListener('click', async () => {
    const marks = Object.fromEntries(members.map((s) => [s.id, el.querySelector(`input[name="a${s.id}"]:checked`)?.value]));
    try {
      const r = await api('POST', `/api/quran/groups/${id}/attendance`, { date: $('#qg-date').value, marks });
      toast(`تم حفظ حضور ${r.saved} طالب ✓`);
    } catch (e) {
      toast(e.message, true);
    }
  });
  el.querySelectorAll('[data-eval]').forEach((b) =>
    b.addEventListener('click', async () => {
      const full = await api('GET', `/api/quran/students/${b.dataset.eval}`);
      const att = el.querySelector(`input[name="a${b.dataset.eval}"]:checked`)?.value;
      quranMeetingForm(full, { date: $('#qg-date').value, attendance: att }, () => toast('تم الحفظ ✓'));
    })
  );
}

// نموذج اللقاء: الحضور، التقييمات، الملاحظة، وإملاء الدرس الجديد
function quranMeetingForm(full, preset = {}, onDone) {
  const st = full.student;
  const day = preset.date || today();
  const m = full.meetings.find((x) => x.date === day) || {};
  const prev = full.lessons.find((l) => l.assigned_on < day) || full.lessons.find((l) => l.assigned_on <= day);
  openModal(
    `✍️ لقاء ${st.full_name}`,
    `<div class="row"><label>التاريخ<input type="date" name="date" value="${day}" max="${today()}"></label>
       <label>الحضور<select name="attendance">${Object.entries(Q_ATT)
         .map(([k, l]) => `<option value="${k}" ${(preset.attendance || m.attendance || 'present') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
     <fieldset class="q-fs"><legend>المراجعة الأسبوعية</legend>
       ${progressBlock(full.progress)}
       ${ratingSelect('review_eval', 'تقييم المراجعة', m.review_eval)}</fieldset>
     <fieldset class="q-fs"><legend>تسميع المقرر</legend>
       ${full.lessons.length ? `<label>المقرر<select name="lesson_id"><option value="">—</option>${full.lessons
         .map((l) => `<option value="${l.id}" ${(m.lesson_id || prev?.id) === l.id ? 'selected' : ''}>${esc(l.content)} · ${fmtDate(l.assigned_on)} (${l.total}/${l.target})</option>`).join('')}</select></label>` : '<p class="muted small">لا مقرر سابق.</p>'}
       <div class="row">${ratingSelect('hifz_eval', 'الحفظ', m.hifz_eval)}${ratingSelect('ada_eval', 'الأداء', m.ada_eval)}</div>
       ${ratingSelect('tajweed_eval', 'التجويد والأحكام', m.tajweed_eval)}</fieldset>
     <label>ملاحظة يراها الطالب<textarea name="note" rows="2">${esc(m.note || '')}</textarea></label>
     <fieldset class="q-fs"><legend>📝 المقرر الأسبوعي (اللوح)</legend>
       <label class="check"><input type="checkbox" name="new_lesson" ${m.id ? '' : 'checked'}> إملاء مقرر جديد لهذا الأسبوع</label>
       <div class="row"><label>السورة${suraSelect('', false)}</label>
         <label>المقدار${athmanSelect}</label></div>
       <p class="muted small">يُكرَّر 60 مرة في الأسبوع.</p></fieldset>`,
    async (data) => {
      const { new_lesson, content, athman, ...meeting } = data;
      if (new_lesson && !String(content || '').trim()) throw new Error('اختر سورة المقرر الأسبوعي، أو أزل علامة «إملاء مقرر جديد»');
      await api('POST', `/api/quran/students/${st.id}/meetings`, meeting);
      if (new_lesson) await api('POST', `/api/quran/students/${st.id}/lessons`, { content, athman: Number(athman), assigned_on: meeting.date });
      onDone();
    }
  );
}

// تاريخ الإملاء: يوم اللقاء فقط (لقاء هذا الأسبوع)، لا اختيار حرّ من الأجندة
function lessonDateSelect(st, current = '') {
  const t = today();
  const meet = qAddDays(t, -((new Date(`${t}T00:00:00Z`).getUTCDay() - st.week_start + 7) % 7));
  const days = [...new Set([meet, current].filter(Boolean))].sort().reverse();
  return `<select name="assigned_on">${days
    .map((d) => `<option value="${d}" ${d === (current || meet) ? 'selected' : ''}>${qDay(d)} ${fmtDate(d)}${d === meet ? ' (لقاء هذا الأسبوع)' : ''}</option>`).join('')}</select>`;
}

function quranLessonForm(st, onDone, l = null) {
  openModal(
    l ? '✏️ تعديل المقرر' : '📝 مقرر جديد',
    `<div class="row"><label>السورة${suraSelect(l?.content || '')}</label>
       <label>المقدار${athmanSel(l?.athman ?? 1)}</label></div>
     <p class="muted small">يُكرَّر المقرر 60 مرة في الأسبوع.</p>
     <label>تاريخ الإملاء (يوم اللقاء)${lessonDateSelect(st, l?.assigned_on)}</label>`,
    async (data) => {
      await api(l ? 'PUT' : 'POST', l ? `/api/quran/lessons/${l.id}` : `/api/quran/students/${st.id}/lessons`, { ...data, athman: Number(data.athman) });
      toast('تم ✓');
      onDone();
    }
  );
}

// ---------- العدّاد بملء الشاشة: الضغط في أي مكان = قراءة واحدة ----------
function openCounter(lesson, todayCount, onClose) {
  let total = lesson.week_total;
  let todayN = todayCount;
  let pending = 0;
  let timer = null;
  let celebrated = total >= lesson.target;
  const ov = document.createElement('div');
  ov.className = 'q-counter-full';
  ov.innerHTML = `
    <div class="qc-top"><button type="button" class="qc-btn" data-act="close">✕ إغلاق</button>
      <span class="qc-lesson">${esc(lesson.content)}</span>
      <button type="button" class="qc-btn" data-act="undo">↶ تراجع</button></div>
    <div class="qc-center"><div class="qc-ring"><b id="qc-n"></b><small id="qc-of"></small></div>
      <p class="qc-hint" id="qc-hint"></p></div>
    <div class="qc-foot" id="qc-foot"></div>`;
  document.body.append(ov);
  document.body.classList.add('no-scroll');
  const flush = async () => {
    clearTimeout(timer);
    if (!pending) return;
    const add = pending;
    pending = 0;
    try {
      await api('PUT', `/api/quran/lessons/${lesson.id}/reps`, { add });
    } catch (e) {
      pending += add;
      toast(e.message, true);
    }
  };
  const paint = () => {
    $('#qc-n', ov).textContent = total;
    $('#qc-of', ov).textContent = `من ${lesson.target}`;
    ov.querySelector('.qc-ring').style.setProperty('--p', pct(total, lesson.target));
    ov.classList.toggle('done', total >= lesson.target);
    $('#qc-hint', ov).textContent = total >= lesson.target ? `🎉 وصلت للهدف! كرّرت المقرر ${total} مرة` : 'اضغط في أي مكان من الشاشة بعد كل تكرار';
    $('#qc-foot', ov).textContent = `اليوم: ${todayN} تكرار · الباقي ${Math.max(0, lesson.target - total)}`;
  };
  const bump = (n) => {
    if (n < 0 && todayN <= 0) return;
    total = Math.max(0, total + n);
    todayN = Math.max(0, todayN + n);
    pending += n;
    if (navigator.vibrate) navigator.vibrate(n > 0 ? 12 : [8, 40, 8]);
    if (!celebrated && total >= lesson.target) {
      celebrated = true;
      if (navigator.vibrate) navigator.vibrate([60, 60, 120]);
    }
    paint();
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  };
  ov.addEventListener('pointerdown', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'close') return;
    if (act === 'undo') return bump(-1);
    e.preventDefault();
    bump(1);
    ov.classList.remove('tap');
    void ov.offsetWidth;
    ov.classList.add('tap');
  });
  ov.querySelector('[data-act="close"]').addEventListener('click', async () => {
    await flush();
    ov.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('visibilitychange', onHide);
    onClose();
  });
  const onHide = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onHide);
  paint();
}

// ---------- جدول الأسبوع: رسم صغير للأيام السبعة، ثم بطاقة لكل يوم ----------
function weekView(full, day, canEdit) {
  const size = (w) => w.solid + w.weak + w.other;
  const max = Math.max(1, ...full.week.map(size));
  const lessonOf = (d) => full.lessons.find((l) => l.assigned_on <= d)?.content || '';
  const past = full.week.filter((w) => w.date <= day);
  const suras = [...new Set(past.map((w) => lessonOf(w.date)).filter(Boolean))];
  const totalH = full.week.reduce((t, w) => t + size(w), 0);
  const totalR = full.week.reduce((t, w) => t + (w.reps || 0), 0);
  const days = past.filter((w) => size(w) > 0).length;
  const short = (d) => qDay(d).replace(/^ال/, '');
  let prevSura = suras.length === 1 ? suras[0] : '';
  return `<div class="wk-chart" aria-hidden="true">${full.week
      .map((w) => `<div class="wk-col ${w.date === day ? 'today' : ''} ${w.date > day ? 'future' : ''}">
        <div class="wk-bar"><i style="height:${Math.round((size(w) / max) * 100)}%"></i>${w.reps ? '<span class="wk-dot"></span>' : ''}</div>
        <small>${short(w.date)}</small></div>`).join('')}</div>
    ${suras.length === 1 ? `<div class="wk-lesson">📖 المقرر هذا الأسبوع: <b>${esc(suras[0])}</b></div>` : ''}
    <div class="wk-tablewrap"><table class="wk-table">
      <thead><tr><th>اليوم</th><th>🔁 الورد</th><th>📝 تكرار المقرر</th></tr></thead>
      <tbody>${full.week
        .map((w) => {
          const future = w.date > day;
          const click = !future && canEdit;
          const sura = lessonOf(w.date);
          const showSura = !future && sura && sura !== prevSura;
          if (!future) prevSura = sura;
          return `<tr class="${w.date === day ? 'today' : ''} ${future ? 'future' : ''} ${click ? 'clickable' : ''}" ${click ? `data-day="${w.date}"` : ''}>
            <td class="wk-td-day"><b>${qDay(w.date)}</b><small>${qShort(w.date)}</small></td>
            <td class="wk-td-ward">${future ? '' : size(w)
              ? `<span class="wk-label">${esc(w.label)}</span><span class="wk-pill g">${hizbTxt(size(w))}</span>`
              : '<span class="wk-none">—</span>'}${showSura ? `<span class="wk-pill s">📖 ${esc(sura)}</span>` : ''}</td>
            <td class="wk-td-reps">${future ? '' : w.reps ? `<span class="wk-reps">${w.reps}</span>` : '<span class="wk-none">—</span>'}</td></tr>`;
        })
        .join('')}</tbody>
      <tfoot><tr><td>المجموع<small>${days} ${days === 1 ? 'يوم' : days === 2 ? 'يومان' : 'أيام'} ورد</small></td>
        <td><span class="wk-pill g">${hizbTxt(totalH)}</span></td><td><span class="wk-reps total">${totalR}</span></td></tr></tfoot>
    </table></div>`;
}

// ---------- صفحة الطالب ----------
// صفحة الطالب. part: home (الرئيسية: المقرر، الورد، جدول الأسبوع، ملاحظات الشيخ)، records (سجلّي: خلاصة الشهر وقائمة المقرر)، all (المشرف: كل شيء)
async function viewQuranStudent(el, id, week = '', part = 'all') {
  const full = await api('GET', `/api/quran/students/${id}${week ? `?week=${week}` : ''}`);
  const { student: st, lesson, today: day, progress } = full;
  const staff = isStaff();
  const me = state.user.role === 'talib';
  const pace = lesson ? lessonPace(lesson, day, st.week_start) : null;
  const todayReps = lesson?.reps?.find((r) => r.date === day)?.count || 0;
  const todayRow = full.week.find((w) => w.date === day);
  const thisWeek = !week || full.week_start === qAddDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() - st.week_start + 7) % 7));
  const left = [...(progress.solid_left || []), ...(progress.weak_left || [])];
  const prevWeek = qAddDays(full.week_start, -7);
  const nextWeek = qAddDays(full.week_start, 7);
  const sum = (k) => full.week.reduce((t, w) => t + (w[k] || 0), 0);
  const PARTS = { home: ['lesson', 'ward', 'table', 'notes'], records: ['month', 'lessons'] };
  const show = (k) => part === 'all' || (PARTS[part] || []).includes(k);
  const base = me ? '#/home' : `#/quran/student/${st.id}`;
  el.innerHTML = `
    ${me && part === 'records' ? `<div class="page-head"><h2>📜 سجلّي</h2><a class="btn small ghost" href="#/quran/history/${st.id}">السجلّ السنوي</a></div>` : ''}
    ${me && part === 'records' ? '' : me ? heroBanner({ sub: `${st.group_name ? `🕌 ${esc(st.group_name)} · ` : ''}أسبوعك يبدأ يوم <b>${Q_DAYS[st.week_start]}</b> (يوم اللقاء).`, art: '📖' })
      : `<p><a href="#/quran/students">→ الطلبة</a></p>
      <div class="card q-head">${avatar(st, 'md')}<div><h2>${esc(st.full_name)}</h2>
        <span class="muted small">${[st.group_name && `🕌 ${esc(st.group_name)}`, st.age && `${st.age} سنة`, `الأسبوع يبدأ ${Q_DAYS[st.week_start]}`].filter(Boolean).join(' · ')}</span></div>
        <div class="q-actions"><button type="button" class="btn small" id="q-meet">✍️ اللقاء والتقييم</button><button type="button" class="btn small ghost" id="q-lesson">📝 مقرر جديد</button><a class="btn small ghost" href="#/quran/history/${st.id}">📜 السجلّ</a><button type="button" class="btn small ghost" id="q-edit">تعديل</button></div></div>`}

    ${show('lesson') ? `<section class="card q-lesson">
      <div class="section-head"><h3>📝 المقرر الأسبوعي</h3><span class="q-actions">${lesson ? `<span class="pill">${athmanTxt(lesson.athman)}</span>` : ''}
        ${me ? '<button type="button" class="btn small ghost" id="q-lesson-me">＋ مقرر جديد</button>' : ''}</span></div>
      ${lesson ? `<p class="q-lesson-txt">${esc(lesson.content)} ${me || staff ? `<button type="button" class="link small" data-edit-lesson="${lesson.id}" title="تعديل المقرر">✏️ تعديل</button>` : ''}</p>
        <button type="button" class="q-tap ${lesson.week_total >= lesson.target ? 'ok' : ''}" id="q-open-counter" ${me || staff ? '' : 'disabled'}>
          <span class="q-ring" style="--p:${pct(lesson.week_total, lesson.target)}"><b>${lesson.week_total}</b><small>من ${lesson.target}</small></span>
          <span class="q-tap-txt">${lesson.week_total >= lesson.target ? `🎉 وصلت للهدف هذا الأسبوع! كرّرت المقرر <b>${lesson.week_total}</b> مرة.`
            : `<b>اضغط هنا لفتح العدّاد</b><small>اليوم: ${todayReps} تكرار · المطلوب اليوم حوالي ${Math.max(0, pace.perDay - todayReps)} أخرى</small>
               <small>الباقي ${pace.remaining} في ${pace.daysLeft} ${pace.daysLeft > 1 ? 'أيام' : 'يوم'}</small>`}</span></button>
        <p class="muted small">العدّاد يبدأ من الصفر كل أسبوع (يوم ${Q_DAYS[st.week_start]}).</p>
        ${me || staff ? '<button type="button" class="link small" id="q-set">✏️ كتابة العدد مباشرة</button>' : ''}`
        : `<p class="muted">لا يوجد مقرر حاليًا. ${staff ? 'اضغط «مقرر جديد» أو «اللقاء والتقييم».' : 'أضف المقرر الذي أملاه عليك الشيخ بزر «＋ مقرر جديد».'}</p>`}
    </section>` : ''}

    ${show('ward') ? `<section class="card">
      <div class="section-head"><h3>🔁 الورد ${thisWeek ? 'هذا الأسبوع' : `أسبوع ${qShort(full.week_start)}`}</h3>${progress.percent !== null ? `<span class="pill">${progress.percent}%</span>` : ''}</div>
      ${progressBlock(progress)}
      ${thisWeek && (me || staff) && (st.solid_hizb || st.weak_hizb) ? `
        <div class="q-today-rev">${todayRow?.ids.length
          ? `<p>✅ <b>ورد اليوم:</b> ${esc(todayRow.label)} <span class="muted small">(${hizbTxt(todayRow.solid + todayRow.weak + todayRow.other)})</span></p>`
          : '<p class="muted">لم تسجّل ورد اليوم بعد.</p>'}
          <a class="btn block" href="#/quran/review/${st.id}">${todayRow?.ids.length ? '✏️ تعديل ورد اليوم' : '＋ سجّل ورد اليوم'}</a></div>
        ${left.length ? `<details class="q-left"><summary>ما بقي هذا الأسبوع (${hizbTxt(QD.sizeOf(left))})</summary>
          <p>${esc(segLabel(left))}</p></details>`
          : progress.percent === 100 ? '<p class="q-goal">🎉 راجعت كل محفوظك هذا الأسبوع، بارك الله فيك.</p>' : ''}` : ''}
    </section>` : ''}

    ${show('table') ? `<section class="card">
      <div class="section-head"><h3>📅 جدول الأسبوع</h3><span class="q-weeknav"><a href="${base}?week=${prevWeek}" title="الأسبوع السابق">→</a>
        ${weekSelect(st, full.week_start, day)}
        ${nextWeek <= day ? `<a href="${base}?week=${nextWeek}" title="الأسبوع الموالي">←</a>` : '<span></span>'}</span></div>
      ${weekView(full, day, me || staff)}
    </section>` : ''}

    ${show('month') ? '<section class="card" id="q-month"></section>' : ''}

    ${part === 'all' ? `<section class="card">
      <div class="section-head"><h3>📗 المحفوظ</h3>${me || staff ? `<a class="btn small" href="#/quran/hifz/${st.id}">${me ? 'تحديد محفوظي' : 'تحديد المحفوظ'}</a>` : ''}</div>
      <div class="q-mem-sum"><div><b>${hizbTxt(st.solid_hizb + st.weak_hizb)}</b><small>محفوظ · يُراجَع كله مرة في الأسبوع</small></div>
        <div><b>${Math.round(((st.solid_hizb + st.weak_hizb) / 60) * 100)}%</b><small>من القرآن (60 حزبًا)</small></div></div>
      ${bar(st.solid_hizb + st.weak_hizb, 60)}
    </section>` : ''}

    ${show('lessons') && full.lessons.length ? `<section class="card"><h3>📚 المقرر الأسبوعي</h3>
      ${full.lessons.length ? `<ul class="levels">${full.lessons
        .map((l) => `<li><span>${fmtDate(l.assigned_on)} — <b>${esc(l.content)}</b> <small class="muted">${athmanTxt(l.athman)}</small></span><span>${l.total} تكرار
          ${me || staff ? `<button type="button" class="link small" data-edit-lesson="${l.id}">تعديل</button>` : ''}
          ${staff || l.created_by === state.user.id ? `<button type="button" class="link small danger" data-del-lesson="${l.id}">حذف</button>` : ''}</span></li>`)
        .join('')}</ul>` : '<p class="muted">لا دروس.</p>'}</section>` : ''}

    ${show('notes') ? `<section class="card">
      <h3>🗒 اللقاءات وملاحظات الشيخ</h3>
      ${full.meetings.length ? `<ul class="notes">${full.meetings
        .map((m) => `<li class="note"><div class="note-head"><b>${fmtDate(m.date)}</b> <span class="badge ${Q_ATT_CLS[m.attendance]}">${Q_ATT[m.attendance]}</span>
            ${ratingBadge(m.review_eval, 'المراجعة')} ${ratingBadge(m.hifz_eval, 'الحفظ')} ${ratingBadge(m.ada_eval, 'الأداء')} ${ratingBadge(m.tajweed_eval, 'التجويد')}
            ${staff ? `<button type="button" class="link small danger" data-del-meet="${m.id}">حذف</button>` : ''}</div>
          ${m.lesson_content ? `<p class="muted small">المقرر المسمَّع: ${esc(m.lesson_content)}</p>` : ''}
          ${m.note ? `<p>${esc(m.note)}</p>` : ''}</li>`)
        .join('')}</ul>` : '<p class="muted">لا لقاءات مسجّلة بعد.</p>'}
    </section>` : ''}`;

  const reload = () => viewQuranStudent(el, id, week, part);
  $('#q-week-sel')?.addEventListener('change', (e) => (location.hash = `${base}?week=${e.target.value}`));
  if (show('month')) monthCard($('#q-month'), st);
  $('#q-lesson-me')?.addEventListener('click', () => quranLessonForm(st, reload));
  el.querySelectorAll('[data-edit-lesson]').forEach((b) =>
    b.addEventListener('click', () => quranLessonForm(st, reload, full.lessons.find((l) => l.id === Number(b.dataset.editLesson))))
  );
  el.querySelectorAll('[data-del-lesson]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف هذا المقرر وعدّاد تكراراته؟')) return;
      await api('DELETE', `/api/quran/lessons/${b.dataset.delLesson}`).catch((e) => toast(e.message, true));
      reload();
    })
  );
  $('#q-open-counter')?.addEventListener('click', () => openCounter(lesson, todayReps, reload));
  el.querySelectorAll('[data-day]').forEach((tr) => tr.addEventListener('click', () => (location.hash = `#/quran/review/${st.id}?date=${tr.dataset.day}`)));
  $('#q-set')?.addEventListener('click', () =>
    openModal(
      '✏️ عدد التكرارات',
      `<label>اليوم<input type="date" name="date" value="${day}" min="${lesson.assigned_on}" max="${day}"></label>
       <label>عدد التكرارات في ذلك اليوم<input type="number" name="count" min="0" value="${todayReps}" required></label>
       <p class="muted small">مجموع هذا الأسبوع: ${lesson.week_total} من ${lesson.target}.</p>`,
      async (data) => {
        await api('PUT', `/api/quran/lessons/${lesson.id}/reps`, data);
        reload();
      }
    )
  );
  if (staff) {
    $('#q-meet')?.addEventListener('click', () => quranMeetingForm(full, {}, () => (toast('تم الحفظ ✓'), reload())));
    $('#q-lesson')?.addEventListener('click', () => quranLessonForm(st, reload));
    $('#q-edit')?.addEventListener('click', async () => {
      const d = await api('GET', '/api/quran/overview');
      quranStudentForm(st, d, reload);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn ghost danger extra';
      del.textContent = 'حذف الطالب';
      $('#modal-form .actions').append(del);
      del.addEventListener('click', async () => {
        if (!confirmAction(`حذف ${st.full_name} وكل متابعته نهائيًا؟`)) return;
        await api('DELETE', `/api/quran/students/${st.id}`).catch((e) => toast(e.message, true));
        $('#modal').close();
        location.hash = '#/quran/students';
      });
    });
    el.querySelectorAll('[data-del-meet]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذا اللقاء؟')) return;
        await api('DELETE', `/api/quran/meetings/${b.dataset.delMeet}`).catch((e) => toast(e.message, true));
        reload();
      })
    );
  }
}

// ---------- تسجيل المراجعة: الطالب يختار ما راجعه من محفوظه ----------
async function viewQuranReview(el, id, dayArg = '') {
  const day0 = today();
  const day = dayArg && dayArg <= day0 ? dayArg : day0;
  const full = await api('GET', `/api/quran/students/${id}?week=${day}`);
  const st = full.student;
  const mem = st.memorized || {};
  const memIds = Object.keys(mem).map(Number);
  if (!memIds.length) {
    el.innerHTML = `<div class="card empty-state"><span>📗</span><p>حدّد محفوظك أولًا، ثم سجّل ما تراجعه منه.</p>
      <a class="btn" href="#/quran/hifz/${id}">تحديد المحفوظ</a></div>`;
    return;
  }
  const row = full.week.find((w) => w.date === day);
  const selected = new Set(row?.ids || []);
  // عدد مرات قراءة كل مقطع اليوم (السورة الواحدة قد تُقرأ أكثر من مرة)
  const times = new Map(Object.entries(row?.counts || {}).map(([k, v]) => [Number(k), v]));
  const timesOf = (ids) => Math.min(...ids.map((i) => times.get(i) || 1));
  const daySize = () => Math.round([...selected].reduce((t, i) => t + (QD.segments[i]?.size || 0) * (times.get(i) || 1), 0) * 10) / 10;
  // ما رُوجع في بقية أيام الأسبوع
  const others = new Map();
  for (const w of full.week) if (w.date !== day) for (const i of w.ids) others.set(i, (others.get(i) || 0) + 1);
  // الأسبوع الجديد (يوم اللقاء) يبدأ فارغًا: لا يظهر بالأخضر إلا ما قُرئ في هذا الأسبوع
  const reps = st.weak_reps || 1;
  const tree = quranTree((sid) => mem[sid]);
  const memSegs = QD.segments.filter((g) => mem[g.id]);
  const suraGroup = (segs) =>
    [...new Set(segs.map((g) => g.sura))].map((s) => {
      const ss = segs.filter((g) => g.sura === s);
      const from = ss[0].from;
      const to = ss[ss.length - 1].to;
      return { ids: ss.map((g) => g.id), name: QD.suraName(s), num: s, range: from === 1 && to === QD.AYAT[s - 1] ? '' : `${from}–${to}` };
    });
  const juzList = [...new Set(memSegs.map((g) => g.juz))].map((j) => {
    const js = memSegs.filter((g) => g.juz === j);
    return { juz: j, ids: js.map((g) => g.id), suras: suraGroup(js) };
  });
  const suraList = suraGroup(memSegs);
  const VIEWS = { quarters: 'بالأرباع', juz: 'بالأجزاء', suras: 'بالسور' };
  let view = (() => {
    try {
      return VIEWS[localStorage.getItem('qReviewView')] ? localStorage.getItem('qReviewView') : 'quarters';
    } catch {
      return 'quarters';
    }
  })();
  const read = (i) => others.get(i) || 0;
  const need = (i) => read(i) < (mem[i] === 'w' ? reps : 1);
  const stateOf = (ids) => (ids.every((i) => selected.has(i)) ? 'on' : ids.some((i) => selected.has(i)) ? 'mix' : '');
  const kind = (ids) => (ids.every((i) => mem[i] === 's') ? 'ks' : ids.every((i) => mem[i] === 'w') ? 'kw' : 'ksw');
  el.innerHTML = `<p><a href="${state.user.role === 'talib' ? '#/home' : `#/quran/student/${id}`}">→ ${state.user.role === 'talib' ? 'الرئيسية' : esc(st.full_name)}</a></p>
    <div class="card"><div class="section-head"><h2>🔁 ورد ${day === day0 ? 'اليوم' : `يوم ${qDay(day)}`}</h2>
      <label class="q-date"><input type="date" id="qr-date" value="${day}" max="${day0}"></label></div>
      <div id="qr-prog"></div>
      <div class="q-seg" role="tablist" aria-label="طريقة العرض">${Object.entries(VIEWS)
        .map(([k, l]) => `<button type="button" role="tab" data-view="${k}" class="${k === view ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div id="q-tree"></div>
    <div class="q-savebar"><span id="q-sum"></span><button type="button" class="btn" id="q-save">حفظ</button></div>`;
  $('#qr-date').addEventListener('change', (e) => (location.hash = `#/quran/review/${id}?date=${e.target.value}`));
  el.querySelectorAll('.q-seg button').forEach((b) =>
    b.addEventListener('click', () => {
      view = b.dataset.view;
      try {
        localStorage.setItem('qReviewView', view);
      } catch {}
      el.querySelectorAll('.q-seg button').forEach((x) => x.classList.toggle('on', x === b));
      render();
    })
  );
  const pick = (cls) => `<button type="button" class="q-pick ${cls}" title="الكل">${cls === 'on' ? '✓' : cls === 'mix' ? '◐' : '○'}</button>`;
  // بطاقة سورة: الرقم، الاسم، الحالة (قُرئت هذا الأسبوع / مختارة اليوم / لم تُقرأ)، وعدد المرات للمختارة
  const timesTxt = (k) => (k === 1 ? 'مرة' : k === 2 ? 'مرتين' : k <= 10 ? `${k} مرات` : `${k} مرة`);
  const chip = (s) => {
    const n = Math.min(...s.ids.map(read));
    const today = stateOf(s.ids);
    const done = !today && s.ids.every((i) => read(i) > 0);
    const state = today === 'on' ? 'picked' : today === 'mix' ? 'half' : done ? 'done' : s.ids.some(need) ? 'need' : '';
    const mark = today === 'on' ? '✓' : done ? '✓' : '';
    const sub = [s.range && `الآيات ${s.range}`, done ? (n > 1 ? `قُرئت ${timesTxt(n)}` : 'قُرئت') : today === 'on' ? 'اليوم' : 'لم تُقرأ'].filter(Boolean).join(' · ');
    const ids = s.ids.join(',');
    return `<div class="q-tile ${state}">
      <button type="button" class="q-tile-main" data-ids="${ids}">
        <span class="q-tile-num">${s.num ?? s.sura}</span>
        <span class="q-tile-name"><b>${s.name}</b><small>${sub}</small></span>
        <span class="q-tile-mark" aria-hidden="true">${mark}</span>
      </button>
      ${today === 'on' ? `<div class="q-tile-step">
        <button type="button" data-times="${ids}" data-d="-1" aria-label="أقل">−</button>
        <b>${timesTxt(timesOf(s.ids))}</b>
        <button type="button" data-times="${ids}" data-d="1" aria-label="مرة أخرى">＋</button></div>` : ''}
    </div>`;
  };
  const juzBlock = (j, key) => `<details class="q-juz" data-key="${key}">
      <summary><span class="q-jname">الجزء ${j.juz} <small class="muted">· ${hizbTxt(QD.sizeOf(j.ids))}</small>${j.ids.some(need) ? ' <span class="q-need">•</span>' : ''}</span>
        <span data-ids="${j.ids.join(',')}">${pick(stateOf(j.ids))}</span></summary>
      <div class="q-tiles">${j.suras.map((s) => chip(s)).join('')}</div></details>`;
  function render() {
    const counts = new Map(others);
    for (const i of selected) counts.set(i, (counts.get(i) || 0) + 1);
    $('#qr-prog').innerHTML = progressBlock(reviewProgress(mem, reps, counts));
    $('#q-sum').innerHTML = selected.size ? `${day === day0 ? 'اليوم' : qDay(day)}: <b>${hizbTxt(daySize())}</b>` : '<span class="muted">لم تختر شيئًا بعد</span>';
    if (view === 'suras') {
      // بالسور: كل سور المحفوظ في قائمة واحدة
      $('#q-tree').innerHTML = `<div class="card"><div class="q-tiles">${suraList.map((x) => chip(x)).join('')}</div></div>`;
    } else if (view === 'juz') {
      // بالأجزاء: من الجزء 1 إلى الجزء 30 (ما فيه محفوظ فقط)، وكل جزء يُفتح على سوره
      $('#q-tree').innerHTML = `<div class="card q-quarter q-juz-list">${juzList.map((j) => juzBlock(j, `rj-${j.juz}`)).join('')}</div>`;
    } else {
      $('#q-tree').innerHTML = tree
        .map((q) => `<details class="card q-quarter" data-key="r${q.n}">
            <summary><span class="q-num">${q.n}</span><span class="q-qname"><b>${q.name}</b><small>محفوظ: ${hizbTxt(QD.sizeOf(q.ids))}${q.ids.some(need) ? ' · بقي منه' : ' · ✓ رُوجع'}</small></span>
              <span data-ids="${q.ids.join(',')}">${pick(stateOf(q.ids))}</span></summary>
            ${q.juzs.map((j) => juzBlock(j, `r${q.n}-${j.juz}`)).join('')}</details>`)
        .join('');
    }
    $('#q-tree').querySelectorAll('[data-ids]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ids = b.dataset.ids.split(',').map(Number);
        const all = ids.every((i) => selected.has(i));
        for (const i of ids) {
          if (all) {
            selected.delete(i);
            times.delete(i);
          } else selected.add(i);
        }
        render();
      })
    );
    // − / ＋ : عدد مرات قراءة السورة اليوم (− عند مرة واحدة = إلغاء)
    $('#q-tree').querySelectorAll('[data-times]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ids = b.dataset.times.split(',').map(Number);
        const k = timesOf(ids) + Number(b.dataset.d);
        for (const i of ids) {
          if (k < 1) {
            selected.delete(i);
            times.delete(i);
          } else times.set(i, Math.min(20, k));
        }
        render();
      })
    );
    rememberOpen($('#q-tree'), 'qOpenR');
  }
  render();
  $('#q-save').addEventListener('click', async () => {
    try {
      const counts = Object.fromEntries([...selected].filter((i) => (times.get(i) || 1) > 1).map((i) => [i, times.get(i)]));
      const btn = $('#q-save');
      btn.disabled = true;
      const r = await api('PUT', `/api/quran/students/${id}/review`, { date: day, ids: [...selected], counts }).finally(() => (btn.disabled = false));
      // يبقى الطالب في نفس المكان من الصفحة
      toast(r.progress.percent === 100 ? '🎉 أتممت مراجعة كل محفوظك هذا الأسبوع' : 'تم الحفظ، بارك الله فيك ✓');
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// ---------- تحديد المحفوظ: ربع ← جزء ← سورة ----------
async function viewQuranHifz(el, id) {
  const full = await api('GET', `/api/quran/students/${id}`);
  const st = full.student;
  const mem = { ...(st.memorized || {}) };
  const mode = 's'; // حالة واحدة: محدّد (محفوظ) أو غير محدّد
  const tree = quranTree();
  const stateOf = (ids) => {
    const v = ids.map((i) => mem[i] || '');
    if (v.every((x) => x === 's')) return 's';
    if (v.every((x) => x === 'w')) return 'w';
    if (v.every((x) => !x)) return '';
    return 'mix';
  };
  const size = (ids) => QD.sizeOf(ids);
  const apply = (ids) => {
    const clear = mode === '' || stateOf(ids) === mode;
    for (const i of ids) clear ? delete mem[i] : (mem[i] = mode);
    render();
  };
  el.innerHTML = `<p><a href="${state.user.role === 'talib' ? '#/account' : `#/quran/student/${id}`}">→ ${state.user.role === 'talib' ? 'حسابي' : esc(st.full_name)}</a></p>
    <div class="card"><h2>📗 تحديد المحفوظ${state.user.role === 'talib' ? '' : ` — ${esc(st.full_name)}`}</h2>
      <p class="muted small">اضغط على ربع كامل أو جزء أو سورة لتحديدها محفوظة، واضغط مرة ثانية لإلغاء التحديد. افتح الربع لترى أجزاءه، والجزء لترى سوره.</p></div>
    <div id="q-tree"></div>
    <div class="q-savebar"><span id="q-sum"></span><button type="button" class="btn" id="q-save">حفظ المحفوظ</button></div>`;
  const icon = (c) => (c === 's' ? '✓' : c === 'w' ? '↻' : c === 'mix' ? '◐' : '○');
  function render() {
    const solid = Object.keys(mem).filter((k) => mem[k] === 's').map(Number);
    $('#q-sum').innerHTML = `المحفوظ: <b>${hizbTxt(size(solid))}</b>`;
    $('#q-tree').innerHTML = tree
      .map((q) => {
        const sq = stateOf(q.ids);
        const memIds = q.ids.filter((i) => mem[i]);
        return `<details class="card q-quarter" data-key="q${q.n}">
          <summary><span class="q-num">${q.n}</span><span class="q-qname"><b>${q.name}</b><small>${hizbTxt(size(memIds))} من ${hizbTxt(size(q.ids))}</small>${bar(size(memIds), size(q.ids))}</span>
            <button type="button" class="q-pick ${sq}" data-ids="${q.ids.join(',')}" title="كل الربع">${icon(sq)}</button></summary>
          ${q.juzs
            .map((j) => {
              const sj = stateOf(j.ids);
              return `<details class="q-juz" data-key="j${q.n}-${j.juz}">
                <summary><span class="q-jname">الجزء ${j.juz} <small class="muted">· الحزب ${j.hizbs.join(' و')}</small></span>
                  <button type="button" class="q-pick ${sj}" data-ids="${j.ids.join(',')}" title="كل الجزء">${icon(sj)}</button></summary>
                <div class="q-suras">${j.suras
                  .map((s) => `<button type="button" class="q-sura ${stateOf(s.ids)}" data-ids="${s.ids.join(',')}">${s.name}${s.range ? ` <small>${s.range}</small>` : ''}</button>`)
                  .join('')}</div></details>`;
            })
            .join('')}</details>`;
      })
      .join('');
    $('#q-tree').querySelectorAll('[data-ids]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        apply(b.dataset.ids.split(',').map(Number));
      })
    );
    rememberOpen($('#q-tree'), 'qOpen');
  }
  render();
  $('#q-save').addEventListener('click', async () => {
    try {
      await api('PUT', `/api/quran/students/${id}/memorized`, { memorized: mem });
      toast('تم حفظ المحفوظ ✓');
      location.hash = state.user.role === 'talib' ? '#/account' : `#/quran/student/${id}`;
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// ---------- السجلّ: الأسابيع الماضية، مجمّعة حسب الشهر، مع حصيلة السنة ----------
const Q_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const hSum = (list, k) => list.reduce((t, w) => t + (w[k] || 0), 0);
const hHizb = (list) => hSum(list, 'solid') + hSum(list, 'weak') + hSum(list, 'other');
function hTotals(list) {
  const m = list.flatMap((w) => w.meetings);
  const present = m.filter((x) => x.attendance === 'present').length;
  const absent = m.filter((x) => x.attendance === 'absent').length;
  const excused = m.filter((x) => x.attendance === 'excused').length;
  return `<div class="h-tot">
    <span><b>${num(hHizb(list))}</b><small>حزب من الورد</small></span>
    <span><b>${hSum(list, 'days')}</b><small>يوم ورد</small></span>
    <span><b>${hSum(list, 'reps')}</b><small>تكرار للمقرر</small></span>
    <span><b>${list.reduce((t, w) => t + w.lessons.length, 0)}</b><small>مقرر جديد</small></span>
    <span><b class="in">${present}</b><small>حضور</small></span>
    <span><b class="${absent ? 'out' : ''}">${absent + excused}</b><small>غياب${excused ? ` (${excused} بعذر)` : ''}</small></span></div>`;
}
function hWeekRow(w) {
  const m = w.meetings[w.meetings.length - 1];
  return `<li class="h-week"><div class="h-week-head"><b>أسبوع ${qShort(w.start)} – ${qShort(qAddDays(w.start, 6))}</b>
      ${w.meetings.map((x) => `<span class="badge ${Q_ATT_CLS[x.attendance]}">${Q_ATT[x.attendance]}</span>`).join(' ')}</div>
    <div class="h-week-body">
      <span>🔁 الورد: ${w.days ? `${hizbTxt(w.solid + w.weak + w.other)} في ${w.days} ${w.days > 2 ? 'أيام' : 'يوم'}` : '<em class="muted">لا شيء</em>'}</span>
      <span>📝 ${w.reps} تكرار${w.lessons.length ? ` · ${w.lessons.map((l) => esc(l.content)).join('، ')}` : ''}</span>
      ${w.label ? `<small class="q-what">${esc(w.label)}</small>` : ''}
      ${m ? `<span>${ratingBadge(m.review_eval, 'المراجعة')} ${ratingBadge(m.hifz_eval, 'الحفظ')} ${ratingBadge(m.ada_eval, 'الأداء')}</span>` : ''}
    </div></li>`;
}

// قائمة الأسابيع: الرجوع مباشرة إلى أي أسبوع (حتى سنة إلى الوراء)
function weekSelect(st, current, day) {
  const cur = qAddDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() - st.week_start + 7) % 7));
  const ago = (n) => (n === 0 ? 'هذا الأسبوع' : n === 1 ? 'الأسبوع الماضي' : n === 2 ? 'قبل أسبوعين' : n <= 10 ? `قبل ${n} أسابيع` : `قبل ${n} أسبوعًا`);
  const opts = [];
  for (let n = 0; n < 53; n++) {
    const w = qAddDays(cur, -7 * n);
    opts.push(`<option value="${w}" ${w === current ? 'selected' : ''}>${ago(n)} · ${qShort(w)} – ${qShort(qAddDays(w, 6))}</option>`);
  }
  return `<select id="q-week-sel" class="q-week-sel" aria-label="اختيار الأسبوع">${opts.join('')}</select>`;
}

// خلاصة الشهر في صفحة الطالب: تقدّمه أسبوعًا بأسبوع طيلة الشهر
const hCache = new Map();
async function monthCard(box, st, month = today().slice(0, 7)) {
  if (!box) return;
  const year = month.slice(0, 4);
  const key = `${st.id}:${year}`;
  if (!hCache.has(key)) hCache.set(key, api('GET', `/api/quran/students/${st.id}/history?year=${year}`));
  let h;
  try {
    h = await hCache.get(key);
  } catch (e) {
    hCache.delete(key);
    box.innerHTML = `<p class="error">${esc(e.message)}</p>`;
    return;
  }
  hCache.delete(key);
  const weeks = h.weeks.filter((w) => w.start.slice(0, 7) === month).reverse();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(d.toISOString().slice(0, 7));
  }
  const maxH = Math.max(1, ...weeks.map((w) => w.solid + w.weak + w.other));
  const maxR = Math.max(60, ...weeks.map((w) => w.reps));
  box.innerHTML = `<div class="section-head"><h3>📆 خلاصة الشهر</h3>
      <select id="q-month-sel" class="q-week-sel" aria-label="اختيار الشهر">${months.map((m) => `<option value="${m}" ${m === month ? 'selected' : ''}>${Q_MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</option>`).join('')}</select></div>
    ${weeks.length ? `${hTotals(weeks)}
      <div class="m-weeks">${weeks
        .map((w) => {
          const hz = w.solid + w.weak + w.other;
          return `<div class="m-week"><b>${qShort(w.start)} – ${qShort(qAddDays(w.start, 6))}</b>
            <span class="m-line"><small>🔁 الورد</small>${bar(hz, maxH, 'ok')}<em>${num(hz)} حزب</em></span>
            <span class="m-line"><small>📝 التكرارات</small>${bar(w.reps, maxR)}<em>${w.reps}</em></span>
            ${w.meetings.map((x) => `<span class="badge ${Q_ATT_CLS[x.attendance]}">${Q_ATT[x.attendance]}</span>`).join(' ')}</div>`;
        })
        .join('')}</div>
`
      : '<p class="muted">لا نشاط في هذا الشهر.</p>'}`;
  $('#q-month-sel').addEventListener('change', (e) => monthCard(box, st, e.target.value));
  enhanceSelects(box);
}

// ---------- سجلّي: بالأسبوع · بالشهر · بالسنة ----------
const REC_MODES = { week: 'بالأسبوع', month: 'بالشهر', year: 'بالسنة' };
async function viewRecords(el, id, mode = '', period = '') {
  const me = state.user.role === 'talib';
  try {
    mode = REC_MODES[mode] ? mode : localStorage.getItem('qRecMode') || 'week';
    localStorage.setItem('qRecMode', mode);
  } catch {
    mode = REC_MODES[mode] ? mode : 'week';
  }
  const t = today();
  const year = mode === 'month' ? (period || t.slice(0, 7)).slice(0, 4) : period || t.slice(0, 4);
  const h = await api('GET', `/api/quran/students/${id}/history?year=${year}`);
  const active = (w) => w.days || w.reps || w.lessons.length || w.meetings.length;
  const yNow = Number(t.slice(0, 4));
  const href = (m, p) => (me ? `#/my-progress?${m}${p ? `=${p}` : ''}` : `#/quran/history/${id}?${m}${p ? `=${p}` : ''}`);
  const yearNav = (y) => `<span class="q-weeknav"><a href="${href(mode, y - 1)}" title="السنة السابقة">→</a><b>${y}</b>${y < yNow ? `<a href="${href(mode, y + 1)}" title="السنة الموالية">←</a>` : '<span></span>'}</span>`;
  let body = '';
  if (mode === 'week') {
    const weeks = h.weeks.filter(active);
    body = `<div class="card"><div class="section-head"><h3>📅 الأسابيع</h3>${yearNav(Number(year))}</div>
      ${weeks.length ? `<ul class="h-weeks">${weeks.map(hWeekRow).join('')}</ul>` : '<p class="muted">لا نشاط في هذه السنة.</p>'}</div>`;
  } else if (mode === 'month') {
    body = '<section class="card" id="q-month"></section>';
  } else {
    const months = [];
    for (let m = 12; m >= 1; m--) {
      const k = `${year}-${String(m).padStart(2, '0')}`;
      const ws = h.weeks.filter((w) => w.start.slice(0, 7) === k);
      if (ws.some(active)) months.push({ k, ws });
    }
    const att = (ws, a) => ws.flatMap((w) => w.meetings).filter((x) => (a === 'absent' ? x.attendance !== 'present' : x.attendance === 'present')).length;
    body = `<div class="card"><div class="section-head"><h3>🗓 حصيلة سنة ${year}</h3>${yearNav(Number(year))}</div>${hTotals(h.weeks)}
      ${months.length ? `<div class="q-table-wrap"><table class="q-table rec-year"><thead><tr><th>الشهر</th><th>🔁 الورد (حزب)</th><th>أيام الورد</th><th>📝 التكرارات</th><th>الحضور</th></tr></thead>
        <tbody>${months.map(({ k, ws }) => `<tr class="clickable" data-month="${k}"><td><b>${Q_MONTHS[Number(k.slice(5)) - 1]}</b></td>
          <td>${num(hHizb(ws))}</td><td>${hSum(ws, 'days')}</td><td>${hSum(ws, 'reps')}</td>
          <td><span class="in">${att(ws, 'present')}</span>${att(ws, 'absent') ? ` · <span class="out">${att(ws, 'absent')} غياب</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">لا نشاط في هذه السنة.</p>'}</div>`;
  }
  el.innerHTML = `${me ? '' : `<p><a href="#/quran/student/${id}">→ ${esc(h.student.full_name)}</a></p>`}
    <div class="page-head"><h2>📜 ${me ? 'سجلّي' : `سجلّ ${esc(h.student.full_name)}`}</h2></div>
    <div class="q-seg rec-seg" role="tablist">${Object.entries(REC_MODES)
      .map(([k, l]) => `<a role="tab" href="${href(k)}" class="${k === mode ? 'on' : ''}">${l}</a>`).join('')}</div>
    ${body}`;
  if (mode === 'month') monthCard($('#q-month'), { id, week_start: h.student.week_start }, period || t.slice(0, 7));
  el.querySelectorAll('tr[data-month]').forEach((tr) => tr.addEventListener('click', () => (location.hash = href('month', tr.dataset.month))));
}

// المسارات (تُضاف لقائمة app.js)
routes.unshift(
  [/^#\/quran(?:\/(students|groups|overview|signups))?$/, (el, tab) => (state.user.role === 'talib' ? viewQuranStudent(el, state.user.id, '', 'home') : viewQuranHome(el, tab || ''))],
  [/^#\/quran\/student\/(\d+)(?:\?week=(\d{4}-\d{2}-\d{2}))?$/, (el, id, week) => viewQuranStudent(el, Number(id), week || '', state.user.role === 'talib' ? 'home' : 'all')],
  [/^#\/home\?week=(\d{4}-\d{2}-\d{2})$/, (el, week) => viewQuranStudent(el, state.user.id, week, 'home')],
  [/^#\/my-progress(?:\?(week|month|year)(?:=([\d-]+))?)?$/, (el, m, p) => viewRecords(el, state.user.id, m || '', p || '')],
  [/^#\/quran\/review\/(\d+)(?:\?date=(\d{4}-\d{2}-\d{2}))?$/, (el, id, d) => viewQuranReview(el, Number(id), d || '')],
  [/^#\/quran\/hifz\/(\d+)$/, (el, id) => viewQuranHifz(el, Number(id))],
  [/^#\/quran\/group\/(\d+)$/, (el, id) => viewQuranGroup(el, Number(id))],
  [/^#\/my-hifz$/, (el) => viewQuranHifz(el, state.user.id)],
  [/^#\/my-review$/, (el) => viewQuranReview(el, state.user.id)],
  [/^#\/my-history$/, (el) => viewRecords(el, state.user.id)],
  [/^#\/quran\/history\/(\d+)(?:\?(week|month|year)(?:=([\d-]+))?)?$/, (el, id, m, p) => viewRecords(el, Number(id), m || '', p || '')]
);
