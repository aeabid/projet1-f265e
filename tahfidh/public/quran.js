'use strict';
// حلقة التحفيظ: المشرفون (الشيخ والإدارة) يتابعون الطلبة، والطالب يحدّد محفوظه ويختار ما يراجعه ويعدّ قراءات درسه
// البيانات: quran-data.js (globalThis.QURAN)

const QD = globalThis.QURAN;
const Q_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const Q_RATING = { excellent: 'ممتاز', good: 'جيد', average: 'متوسط', weak: 'ضعيف' };
const Q_ATT = { present: 'حاضر', absent: 'غائب', excused: 'غائب بعذر' };
const Q_ATT_CLS = { present: 'good', absent: 'weak', excused: 'average' };
const Q_LEVELS = ['مبتدئ', 'متوسط', 'متقدم', 'حافظ'];
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
const athmanSelect = `<select name="athman"><option value="0.5">نصف ثمن</option><option value="1" selected>ثمن</option><option value="2">ثمنان</option><option value="3">3 أثمان</option><option value="4">ربع حزب</option></select>`;
const segLabel = (ids) => QD.rangeLabel([...ids].sort((a, b) => a - b).map((i) => QD.segments[i]));

// مدة الدرس: حتى اليوم الذي يسبق اللقاء الموالي (بداية الأسبوع)
function lessonPace(lesson, day, weekStart) {
  const back = (new Date(`${lesson.assigned_on}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
  const end = qAddDays(lesson.assigned_on, 6 - back);
  const daysLeft = Math.max(1, Math.round((Date.parse(end) - Date.parse(day)) / 864e5) + 1);
  const remaining = Math.max(0, lesson.target - lesson.total);
  return { remaining, perDay: Math.ceil(remaining / daysLeft), daysLeft };
}

// تقدّم المراجعة (نفس حساب الخادم): المحفوظ الجيد مرة في الأسبوع، وما يحتاج مراجعة weak_reps مرة
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
    ${p.solid_total ? `<div class="q-prog-row"><span><span class="q-dot s"></span>المحفوظ الجيد <small>(مرة في الأسبوع)</small></span>
      ${bar(p.solid_done, p.solid_total, 'ok')}<b>${num(p.solid_done)} / ${num(p.solid_total)} حزب</b></div>` : ''}
    ${p.weak_total ? `<div class="q-prog-row"><span><span class="q-dot w"></span>يحتاج مراجعة <small>(${p.weak_reps > 1 ? `${p.weak_reps} مرات` : 'مرة'} في الأسبوع)</small></span>
      ${bar(p.weak_done, p.weak_total, 'warn')}<b>${num(p.weak_done)} / ${num(p.weak_total)} حزب</b></div>` : ''}
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
  const reached = active.filter((s) => s.lesson && s.lesson.total >= s.lesson.target).length;
  tab = tab || sessionStorage.getItem('qTab') || 'students';
  sessionStorage.setItem('qTab', tab);
  el.innerHTML = `
    ${heroBanner({ sub: 'تابع مراجعة الطلبة وحفظهم أسبوعًا بأسبوع.', art: '📖',
      actions: '<button type="button" class="btn" id="q-add-st">＋ طالب جديد</button><button type="button" class="btn ghost" id="q-add-g">＋ مجموعة</button>' })}
    <div class="kpis">
      <div class="kpi"><b>${active.length}</b><span>طالب</span></div>
      <div class="kpi"><b>${d.groups.length}</b><span>مجموعة</span></div>
      <div class="kpi"><b>${avg}%</b><span>معدّل إنجاز المراجعة هذا الأسبوع</span></div>
      <div class="kpi"><b class="in">${reached}</b><span>بلغ هدف قراءة الدرس</span></div>
    </div>
    <div class="board-tabs" role="tablist">
      <a href="#/quran/students" class="${tab === 'students' ? 'on' : ''}"><span>👥</span>الطلبة</a>
      <a href="#/quran/groups" class="${tab === 'groups' ? 'on' : ''}"><span>🕌</span>المجموعات</a>
    </div>
    <div id="q-page"></div>`;
  $('#q-add-st').addEventListener('click', () => quranStudentForm(null, d, () => viewQuranHome(el, 'students')));
  $('#q-add-g').addEventListener('click', () => quranGroupForm(null, () => viewQuranHome(el, 'groups')));
  const page = $('#q-page');
  if (tab === 'groups') return quranGroupsTab(page, d, el);
  return quranStudentsTab(page, d);
}

function quranStudentCard(s) {
  const l = s.lesson;
  const r = s.review || {};
  return `<a class="card q-st ${s.active ? '' : 'q-off'}" href="#/quran/student/${s.id}">
    <div class="q-st-head">${avatar({ full_name: s.full_name }, 'md')}<div>
      <h3>${esc(s.full_name)}</h3>
      <span class="muted small">${[s.group_name && `🕌 ${esc(s.group_name)}`, s.level && esc(s.level), s.age && `${s.age} سنة`].filter(Boolean).join(' · ')}</span>
    </div>${s.active ? '' : '<span class="badge general">متوقف</span>'}</div>
    <div class="q-st-mem"><span class="q-dot s"></span>${hizbTxt(s.solid_hizb)} <span class="q-dot w"></span>${hizbTxt(s.weak_hizb)}</div>
    ${s.active ? `<div class="q-st-line"><span>المراجعة</span>${bar(r.percent || 0, 100)}<b>${r.percent ?? 0}%</b></div>
    <div class="q-st-line"><span>اليوم</span><em class="small ${s.reviewed_today ? 'in' : 'muted'}">${s.reviewed_today ? `راجع ${hizbTxt(s.reviewed_today)}` : 'لم يسجّل مراجعة بعد'}</em></div>
    <div class="q-st-line"><span>الدرس</span>${l ? `${bar(l.total, l.target, l.total >= l.target ? 'ok' : '')}<b>${l.total}/${l.target}</b>` : '<em class="muted small">لا درس</em>'}</div>` : ''}
    ${s.last_meeting ? `<div class="muted small">آخر لقاء: ${fmtDate(s.last_meeting.date)} <span class="badge ${Q_ATT_CLS[s.last_meeting.attendance]}">${Q_ATT[s.last_meeting.attendance]}</span></div>` : ''}
  </a>`;
}

function quranStudentsTab(page, d) {
  if (!d.students.length) {
    page.innerHTML = '<div class="card empty-state"><span>📖</span><p>لا يوجد طلبة بعد. أضف مجموعة ثم طالبًا جديدًا.</p></div>';
    return;
  }
  page.innerHTML = `<div class="q-filters">
      <input type="search" id="q-search" placeholder="بحث بالاسم…">
      <select id="q-group"><option value="">كل المجموعات</option>${d.groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}<option value="none">بلا مجموعة</option></select>
      <select id="q-sort"><option value="name">ترتيب بالاسم</option><option value="review">الأقل مراجعة أولًا</option><option value="hifz">الأكثر حفظًا أولًا</option></select>
    </div><div class="cards" id="q-list"></div>`;
  const render = () => {
    const s = $('#q-search').value.trim();
    const g = $('#q-group').value;
    const sort = $('#q-sort').value;
    let list = d.students.filter((x) => (!s || x.full_name.includes(s)) && (!g || (g === 'none' ? !x.group_id : String(x.group_id) === g)));
    if (sort === 'review') list = [...list].sort((a, b) => (a.review?.percent ?? 101) - (b.review?.percent ?? 101));
    if (sort === 'hifz') list = [...list].sort((a, b) => b.solid_hizb + b.weak_hizb - (a.solid_hizb + a.weak_hizb));
    $('#q-list').innerHTML = list.map(quranStudentCard).join('') || '<p class="muted">لا نتائج.</p>';
  };
  ['input', 'change'].forEach((ev) => page.addEventListener(ev, render));
  render();
}

function quranGroupsTab(page, d, root) {
  page.innerHTML = d.groups.length
    ? `<div class="cards">${d.groups
        .map(
          (g) => `<div class="card q-group">
        <div class="section-head"><h3>🕌 ${esc(g.name)}</h3>${g.level ? `<span class="pill">${esc(g.level)}</span>` : ''}</div>
        <p class="muted small">يوم اللقاء: <b>${Q_DAYS[g.meet_day]}</b> · ${g.students} طالب</p>
        ${g.notes ? `<p class="small">${esc(g.notes)}</p>` : ''}
        <div class="q-actions"><a class="btn small" href="#/quran/group/${g.id}">📋 حصة اللقاء</a>
          <button type="button" class="btn small ghost" data-edit="${g.id}">تعديل</button>
          <button type="button" class="btn small ghost danger" data-del="${g.id}">حذف</button></div>
      </div>`
        )
        .join('')}</div>`
    : '<div class="card empty-state"><span>🕌</span><p>لا توجد مجموعات. أنشئ مجموعة لكل مستوى (مبتدئ، متوسط، متقدم…).</p></div>';
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
     <div class="row"><label>المستوى<input name="level" list="q-levels" value="${esc(g?.level || '')}"></label>
       <label>يوم اللقاء (بداية الأسبوع)${daySelect('meet_day', g?.meet_day ?? 6)}</label></div>
     <datalist id="q-levels">${Q_LEVELS.map((l) => `<option value="${l}">`).join('')}</datalist>
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
     <div class="row"><label>العمر<input name="age" type="number" min="3" max="99" value="${s?.age ?? ''}"></label>
       <label>المستوى<input name="level" list="q-levels" value="${esc(s?.level || '')}"></label></div>
     <datalist id="q-levels">${Q_LEVELS.map((l) => `<option value="${l}">`).join('')}</datalist>
     <label>المجموعة<select name="group_id"><option value="">— بلا مجموعة —</option>${d.groups
       .map((g) => `<option value="${g.id}" data-day="${g.meet_day}" ${s?.group_id === g.id ? 'selected' : ''}>${esc(g.name)} (${Q_DAYS[g.meet_day]})</option>`)
       .join('')}</select></label>
     <fieldset class="q-fs"><legend>نسق المراجعة</legend>
       <label>بداية الأسبوع (عادة يوم اللقاء مع الشيخ)${daySelect('week_start', s?.week_start ?? 6)}</label>
       <p class="muted small">المحفوظ الجيد يُراجَع كله مرة واحدة في الأسبوع. الطالب يختار كل يوم ما يراجعه.</p>
       <label>ما يحتاج مراجعة: يُكرَّر في الأسبوع<select name="weak_reps">${[1, 2, 3, 4, 5, 6, 7]
         .map((n) => `<option value="${n}" ${(s?.weak_reps ?? 1) === n ? 'selected' : ''}>${n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : `${n} مرات`}</option>`).join('')}</select></label>
       <label>عدد قراءات الدرس الجديد في الأسبوع<input name="lesson_target" type="number" min="1" max="1000" value="${s?.lesson_target ?? 70}"></label>
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
    if (day !== undefined) $('#modal-form select[name=week_start]').value = day;
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
      <p class="muted small">سجّل الحضور، ثم اضغط «تقييم» لكل طالب حاضر: تقييم المراجعة، تسميع الدرس، الملاحظة والدرس الجديد.</p>
      ${members.length ? `<ul class="q-att">${members
        .map((s) => `<li><span class="q-att-name">${avatar({ full_name: s.full_name }, 'sm')} <a href="#/quran/student/${s.id}">${esc(s.full_name)}</a>
            <small class="muted">المراجعة ${s.review?.percent ?? 0}%${s.lesson ? ` · الدرس ${s.lesson.total}/${s.lesson.target}` : ''}</small></span>
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
     <fieldset class="q-fs"><legend>تسميع الدرس</legend>
       ${full.lessons.length ? `<label>الدرس<select name="lesson_id"><option value="">—</option>${full.lessons
         .map((l) => `<option value="${l.id}" ${(m.lesson_id || prev?.id) === l.id ? 'selected' : ''}>${esc(l.content)} · ${fmtDate(l.assigned_on)} (${l.total}/${l.target})</option>`).join('')}</select></label>` : '<p class="muted small">لا درس سابق.</p>'}
       <div class="row">${ratingSelect('hifz_eval', 'الحفظ', m.hifz_eval)}${ratingSelect('ada_eval', 'الأداء', m.ada_eval)}</div>
       ${ratingSelect('tajweed_eval', 'التجويد والأحكام', m.tajweed_eval)}</fieldset>
     <label>ملاحظة يراها الطالب<textarea name="note" rows="2">${esc(m.note || '')}</textarea></label>
     <fieldset class="q-fs"><legend>📝 الدرس الجديد (اللوح)</legend>
       <label class="check"><input type="checkbox" name="new_lesson" ${m.id ? '' : 'checked'}> إملاء درس جديد لهذا الأسبوع</label>
       <label>المقطع<input name="content" placeholder="مثال: الملك 1–14" maxlength="300"></label>
       <div class="row"><label>عدد الأثمان${athmanSelect}</label>
         <label>عدد القراءات<input name="target" type="number" min="1" value="${st.lesson_target}"></label></div></fieldset>`,
    async (data) => {
      const { new_lesson, content, athman, target, ...meeting } = data;
      if (new_lesson && !String(content || '').trim()) throw new Error('اكتب مقطع الدرس الجديد، أو أزل علامة «إملاء درس جديد»');
      await api('POST', `/api/quran/students/${st.id}/meetings`, meeting);
      if (new_lesson) await api('POST', `/api/quran/students/${st.id}/lessons`, { content, athman: Number(athman), target, assigned_on: meeting.date });
      onDone();
    }
  );
}

function quranLessonForm(st, onDone) {
  openModal(
    '📝 درس جديد',
    `<label>المقطع<input name="content" required placeholder="مثال: الملك 1–14" maxlength="300"></label>
     <div class="row"><label>عدد الأثمان${athmanSelect}</label>
       <label>عدد القراءات<input name="target" type="number" min="1" value="${st.lesson_target}"></label></div>
     <label>بداية الأسبوع<input type="date" name="assigned_on" value="${today()}"></label>`,
    async (data) => {
      await api('POST', `/api/quran/students/${st.id}/lessons`, { ...data, athman: Number(data.athman) });
      toast('تم ✓');
      onDone();
    }
  );
}

// ---------- العدّاد بملء الشاشة: الضغط في أي مكان = قراءة واحدة ----------
function openCounter(lesson, todayCount, onClose) {
  let total = lesson.total;
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
    $('#qc-hint', ov).textContent = total >= lesson.target ? `🎉 وصلت للهدف! قرأت الدرس ${total} مرة` : 'اضغط في أي مكان من الشاشة بعد كل قراءة';
    $('#qc-foot', ov).textContent = `اليوم: ${todayN} قراءة · الباقي ${Math.max(0, lesson.target - total)}`;
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

// ---------- صفحة الطالب ----------
async function viewQuranStudent(el, id, week = '') {
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
  el.innerHTML = `
    ${me ? heroBanner({ sub: `${st.group_name ? `🕌 ${esc(st.group_name)} · ` : ''}أسبوعك يبدأ يوم <b>${Q_DAYS[st.week_start]}</b> (يوم اللقاء).`, art: '📖' })
      : `<p><a href="#/quran/students">→ الطلبة</a></p>
      <div class="card q-head">${avatar({ full_name: st.full_name }, 'md')}<div><h2>${esc(st.full_name)}</h2>
        <span class="muted small">${[st.group_name && `🕌 ${esc(st.group_name)}`, st.level && esc(st.level), st.age && `${st.age} سنة`, `الأسبوع يبدأ ${Q_DAYS[st.week_start]}`].filter(Boolean).join(' · ')}</span></div>
        <div class="q-actions"><button type="button" class="btn small" id="q-meet">✍️ اللقاء والتقييم</button><button type="button" class="btn small ghost" id="q-lesson">📝 درس جديد</button><button type="button" class="btn small ghost" id="q-edit">تعديل</button></div></div>`}

    <section class="card q-lesson">
      <div class="section-head"><h3>📝 الدرس الجديد</h3>${lesson ? `<span class="pill">${athmanTxt(lesson.athman)}</span>` : ''}</div>
      ${lesson ? `<p class="q-lesson-txt">${esc(lesson.content)}</p>
        <button type="button" class="q-tap ${lesson.total >= lesson.target ? 'ok' : ''}" id="q-open-counter" ${me || staff ? '' : 'disabled'}>
          <span class="q-ring" style="--p:${pct(lesson.total, lesson.target)}"><b>${lesson.total}</b><small>من ${lesson.target}</small></span>
          <span class="q-tap-txt">${lesson.total >= lesson.target ? `🎉 وصلت للهدف! قرأت الدرس <b>${lesson.total}</b> مرة.`
            : `<b>اضغط هنا لفتح العدّاد</b><small>اليوم: ${todayReps} قراءة · المطلوب اليوم حوالي ${Math.max(0, pace.perDay - todayReps)} أخرى</small>
               <small>الباقي ${pace.remaining} في ${pace.daysLeft} ${pace.daysLeft > 1 ? 'أيام' : 'يوم'}</small>`}</span></button>
        ${me || staff ? '<button type="button" class="link small" id="q-set">✏️ كتابة العدد مباشرة</button>' : ''}`
        : `<p class="muted">لا يوجد درس حاليًا. ${staff ? 'اضغط «درس جديد» أو «اللقاء والتقييم».' : 'الشيخ يملي الدرس في اللقاء.'}</p>`}
    </section>

    <section class="card">
      <div class="section-head"><h3>🔁 المراجعة ${thisWeek ? 'هذا الأسبوع' : `أسبوع ${qShort(full.week_start)}`}</h3>${progress.percent !== null ? `<span class="pill">${progress.percent}%</span>` : ''}</div>
      ${progressBlock(progress)}
      ${thisWeek && (me || staff) && (st.solid_hizb || st.weak_hizb) ? `
        <div class="q-today-rev">${todayRow?.ids.length
          ? `<p>✅ <b>اليوم راجعت:</b> ${esc(todayRow.label)} <span class="muted small">(${hizbTxt(todayRow.solid + todayRow.weak + todayRow.other)})</span></p>`
          : '<p class="muted">لم تسجّل مراجعة اليوم بعد.</p>'}
          <a class="btn block" href="#/quran/review/${st.id}">${todayRow?.ids.length ? '✏️ تعديل مراجعة اليوم' : '＋ سجّل ما راجعته اليوم'}</a></div>
        ${left.length ? `<details class="q-left"><summary>ما بقي هذا الأسبوع (${hizbTxt(QD.sizeOf(left))})</summary>
          ${progress.solid_left.length ? `<p><span class="q-dot s"></span>${esc(segLabel(progress.solid_left))}</p>` : ''}
          ${progress.weak_left.length ? `<p><span class="q-dot w"></span>${esc(segLabel(progress.weak_left))}</p>` : ''}</details>`
          : progress.percent === 100 ? '<p class="q-goal">🎉 راجعت كل محفوظك هذا الأسبوع، بارك الله فيك.</p>' : ''}` : ''}
    </section>

    <section class="card">
      <div class="section-head"><h3>📅 جدول الأسبوع</h3><span class="q-weeknav"><a href="#/quran/student/${st.id}?week=${prevWeek}" title="الأسبوع السابق">→</a>
        <b>${qShort(full.week_start)} – ${qShort(qAddDays(full.week_start, 6))}</b>
        ${nextWeek <= day ? `<a href="#/quran/student/${st.id}?week=${nextWeek}" title="الأسبوع الموالي">←</a>` : '<span></span>'}</span></div>
      <div class="q-table-wrap"><table class="q-table">
        <thead><tr><th>اليوم</th><th><span class="q-dot s"></span>محفوظ جيد</th><th><span class="q-dot w"></span>يحتاج مراجعة</th><th>📝 قراءات الدرس</th></tr></thead>
        <tbody>${full.week
          .map((w) => {
            const future = w.date > day;
            const click = !future && (me || staff);
            return `<tr class="${w.date === day ? 'today' : ''} ${future ? 'future' : ''} ${click ? 'clickable' : ''}" ${click ? `data-day="${w.date}"` : ''}>
              <td><b>${qDay(w.date)}</b> <small class="muted">${qShort(w.date)}</small>${w.ids.length ? `<small class="q-what">${esc(w.label)}</small>` : ''}</td>
              <td>${w.solid ? num(w.solid) : future ? '' : '—'}</td><td>${w.weak ? num(w.weak) : future ? '' : '—'}</td><td>${w.reps || (future ? '' : '—')}</td></tr>`;
          })
          .join('')}</tbody>
        <tfoot><tr><th>المجموع</th><th>${num(sum('solid'))}</th><th>${num(sum('weak'))}</th><th>${sum('reps')}</th></tr></tfoot>
      </table></div>
      <details class="q-help"><summary>كيف يُعمَّر هذا الجدول؟</summary>
        <ul>
          <li>كل سطر يوم من أيام الأسبوع، والأسبوع يبدأ يوم اللقاء مع الشيخ (${Q_DAYS[st.week_start]}).</li>
          <li><b>محفوظ جيد / يحتاج مراجعة:</b> كمية ما راجعه الطالب ذلك اليوم بالأحزاب، حسب ما سجّله هو في «سجّل ما راجعته اليوم». تحت اسم اليوم تظهر السور التي راجعها.</li>
          <li><b>قراءات الدرس:</b> عدد المرات التي قرأ فيها الدرس الجديد ذلك اليوم، من العدّاد.</li>
          <li>اضغط على يوم سابق لتسجيل أو تعديل مراجعته.</li>
          <li>الهدف في آخر الأسبوع: مراجعة كل المحفوظ الجيد مرة، وما يحتاج مراجعة ${st.weak_reps > 1 ? `${st.weak_reps} مرات` : 'مرة'}، وقراءة الدرس ${lesson?.target || st.lesson_target} مرة.</li>
        </ul></details>
    </section>

    <section class="card">
      <div class="section-head"><h3>📗 المحفوظ</h3>${me || staff ? `<a class="btn small" href="#/quran/hifz/${st.id}">${me ? 'تحديد محفوظي' : 'تحديد المحفوظ'}</a>` : ''}</div>
      <div class="q-mem-sum"><div><span class="q-dot s"></span><b>${hizbTxt(st.solid_hizb)}</b><small>محفوظ جيد · يُراجَع كله مرة في الأسبوع</small></div>
        <div><span class="q-dot w"></span><b>${hizbTxt(st.weak_hizb)}</b><small>يحتاج مراجعة · ${st.weak_reps > 1 ? `${st.weak_reps} مرات` : 'مرة'} في الأسبوع</small></div>
        <div><span class="q-dot"></span><b>${hizbTxt(st.solid_hizb + st.weak_hizb)}</b><small>من 60 حزبًا</small></div></div>
      ${bar(st.solid_hizb + st.weak_hizb, 60)}
    </section>

    <section class="card">
      <h3>🗒 اللقاءات وملاحظات الشيخ</h3>
      ${full.meetings.length ? `<ul class="notes">${full.meetings
        .map((m) => `<li class="note"><div class="note-head"><b>${fmtDate(m.date)}</b> <span class="badge ${Q_ATT_CLS[m.attendance]}">${Q_ATT[m.attendance]}</span>
            ${ratingBadge(m.review_eval, 'المراجعة')} ${ratingBadge(m.hifz_eval, 'الحفظ')} ${ratingBadge(m.ada_eval, 'الأداء')} ${ratingBadge(m.tajweed_eval, 'التجويد')}
            ${staff ? `<button type="button" class="link small danger" data-del-meet="${m.id}">حذف</button>` : ''}</div>
          ${m.lesson_content ? `<p class="muted small">الدرس المسمَّع: ${esc(m.lesson_content)}</p>` : ''}
          ${m.note ? `<p>${esc(m.note)}</p>` : ''}</li>`)
        .join('')}</ul>` : '<p class="muted">لا لقاءات مسجّلة بعد.</p>'}
    </section>

    ${full.lessons.length > 1 || staff ? `<section class="card"><h3>📚 الدروس السابقة</h3>
      ${full.lessons.length ? `<ul class="levels">${full.lessons
        .map((l) => `<li><span>${fmtDate(l.assigned_on)} — <b>${esc(l.content)}</b></span><span>${l.total}/${l.target} ${l.total >= l.target ? '✅' : ''}
          ${staff ? `<button type="button" class="link small danger" data-del-lesson="${l.id}">حذف</button>` : ''}</span></li>`)
        .join('')}</ul>` : '<p class="muted">لا دروس.</p>'}</section>` : ''}`;

  const reload = () => viewQuranStudent(el, id, week);
  $('#q-open-counter')?.addEventListener('click', () => openCounter(lesson, todayReps, reload));
  el.querySelectorAll('tr[data-day]').forEach((tr) => tr.addEventListener('click', () => (location.hash = `#/quran/review/${st.id}?date=${tr.dataset.day}`)));
  $('#q-set')?.addEventListener('click', () =>
    openModal(
      '✏️ عدد القراءات',
      `<label>اليوم<input type="date" name="date" value="${day}" min="${lesson.assigned_on}" max="${day}"></label>
       <label>عدد القراءات في ذلك اليوم<input type="number" name="count" min="0" value="${todayReps}" required></label>
       <p class="muted small">المجموع الحالي: ${lesson.total} من ${lesson.target}.</p>`,
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
    el.querySelectorAll('[data-del-lesson]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذا الدرس وعدّاد قراءاته؟')) return;
        await api('DELETE', `/api/quran/lessons/${b.dataset.delLesson}`).catch((e) => toast(e.message, true));
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
  // ما رُوجع في بقية أيام الأسبوع
  const others = new Map();
  for (const w of full.week) if (w.date !== day) for (const i of w.ids) others.set(i, (others.get(i) || 0) + 1);
  const reps = st.weak_reps || 1;
  const tree = quranTree((sid) => mem[sid]);
  const need = (i) => (others.get(i) || 0) < (mem[i] === 'w' ? reps : 1);
  const stateOf = (ids) => (ids.every((i) => selected.has(i)) ? 'on' : ids.some((i) => selected.has(i)) ? 'mix' : '');
  const kind = (ids) => (ids.every((i) => mem[i] === 's') ? 'ks' : ids.every((i) => mem[i] === 'w') ? 'kw' : 'ksw');
  el.innerHTML = `<p><a href="#/quran/student/${id}">→ ${state.user.role === 'talib' ? 'متابعتي' : esc(st.full_name)}</a></p>
    <div class="card"><div class="section-head"><h2>🔁 ما راجعته</h2>
      <label class="q-date"><input type="date" id="qr-date" value="${day}" max="${day0}"></label></div>
      <p class="muted small">اختر بنفسك ما راجعته ${day === day0 ? 'اليوم' : `يوم ${qDay(day)}`}: اضغط على ربع أو جزء كامل أو على سورة. المهم أن تراجع كل محفوظك قبل آخر الأسبوع.</p>
      <p class="q-legend small"><span class="q-chip-demo s">محفوظ جيد</span> <span class="q-chip-demo w">يحتاج مراجعة</span>
        <span class="q-chip-demo on">راجعته</span> <span class="q-chip-demo need">• لم يُراجَع بعد هذا الأسبوع</span></p>
      <div id="qr-prog"></div></div>
    <div id="q-tree"></div>
    <div class="q-savebar"><span id="q-sum"></span><button type="button" class="btn" id="q-save">حفظ</button></div>`;
  $('#qr-date').addEventListener('change', (e) => (location.hash = `#/quran/review/${id}?date=${e.target.value}`));
  const pick = (cls) => `<button type="button" class="q-pick ${cls}" title="الكل">${cls === 'on' ? '✓' : cls === 'mix' ? '◐' : '○'}</button>`;
  function render() {
    const counts = new Map(others);
    for (const i of selected) counts.set(i, (counts.get(i) || 0) + 1);
    $('#qr-prog').innerHTML = progressBlock(reviewProgress(mem, reps, counts));
    $('#q-sum').innerHTML = selected.size ? `${qDay(day) === qDay(day0) && day === day0 ? 'اليوم' : qDay(day)}: <b>${hizbTxt(QD.sizeOf([...selected]))}</b>` : '<span class="muted">لم تختر شيئًا بعد</span>';
    $('#q-tree').innerHTML = tree
      .map((q) => `<details class="card q-quarter" data-key="r${q.n}">
          <summary><span class="q-num">${q.n}</span><span class="q-qname"><b>${q.name}</b><small>محفوظ: ${hizbTxt(QD.sizeOf(q.ids))}${q.ids.some(need) ? ' · بقي منه' : ' · ✓ رُوجع'}</small></span>
            <span data-ids="${q.ids.join(',')}">${pick(stateOf(q.ids))}</span></summary>
          ${q.juzs
            .map((j) => `<details class="q-juz" data-key="r${q.n}-${j.juz}">
                <summary><span class="q-jname">الجزء ${j.juz} <small class="muted">· ${hizbTxt(QD.sizeOf(j.ids))}</small>${j.ids.some(need) ? ' <span class="q-need">•</span>' : ''}</span>
                  <span data-ids="${j.ids.join(',')}">${pick(stateOf(j.ids))}</span></summary>
                <div class="q-suras">${j.suras
                  .map((s) => {
                    const n = Math.min(...s.ids.map((i) => others.get(i) || 0));
                    return `<button type="button" class="q-sura ${kind(s.ids)} ${stateOf(s.ids) === 'on' ? 'picked' : stateOf(s.ids) === 'mix' ? 'half' : ''} ${s.ids.some(need) ? 'need' : ''}" data-ids="${s.ids.join(',')}">${s.name}${s.range ? ` <small>${s.range}</small>` : ''}${n ? ` <em>×${n}</em>` : ''}</button>`;
                  })
                  .join('')}</div></details>`)
            .join('')}</details>`)
      .join('');
    $('#q-tree').querySelectorAll('[data-ids]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ids = b.dataset.ids.split(',').map(Number);
        const all = ids.every((i) => selected.has(i));
        for (const i of ids) all ? selected.delete(i) : selected.add(i);
        render();
      })
    );
    rememberOpen($('#q-tree'), 'qOpenR');
  }
  render();
  $('#q-save').addEventListener('click', async () => {
    try {
      const r = await api('PUT', `/api/quran/students/${id}/review`, { date: day, ids: [...selected] });
      toast(r.progress.percent === 100 ? '🎉 أتممت مراجعة كل محفوظك هذا الأسبوع' : 'تم الحفظ، بارك الله فيك ✓');
      location.hash = `#/quran/student/${id}`;
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
  let mode = 's';
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
  el.innerHTML = `<p><a href="#/quran/student/${id}">→ ${state.user.role === 'talib' ? 'متابعتي' : esc(st.full_name)}</a></p>
    <div class="card"><h2>📗 تحديد المحفوظ${state.user.role === 'talib' ? '' : ` — ${esc(st.full_name)}`}</h2>
      <p class="muted small">اختر الحالة، ثم اضغط على ربع كامل أو جزء أو سورة. الضغط مرة ثانية يلغي التحديد. افتح الربع لترى أجزاءه، والجزء لترى سوره.</p>
      <div class="q-modes" role="radiogroup">
        <button type="button" class="q-mode s on" data-mode="s">✓ محفوظ جيد<small>أقرؤه من حفظي</small></button>
        <button type="button" class="q-mode w" data-mode="w">↻ يحتاج مراجعة<small>لازمه تثبيت</small></button>
        <button type="button" class="q-mode c" data-mode="">✕ مسح<small>غير محفوظ</small></button>
      </div></div>
    <div id="q-tree"></div>
    <div class="q-savebar"><span id="q-sum"></span><button type="button" class="btn" id="q-save">حفظ المحفوظ</button></div>`;
  el.querySelectorAll('.q-mode').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode;
      el.querySelectorAll('.q-mode').forEach((x) => x.classList.toggle('on', x === b));
    })
  );
  const icon = (c) => (c === 's' ? '✓' : c === 'w' ? '↻' : c === 'mix' ? '◐' : '○');
  function render() {
    const solid = Object.keys(mem).filter((k) => mem[k] === 's').map(Number);
    const weak = Object.keys(mem).filter((k) => mem[k] === 'w').map(Number);
    $('#q-sum').innerHTML = `<span class="q-dot s"></span> ${hizbTxt(size(solid))} <span class="q-dot w"></span> ${hizbTxt(size(weak))}`;
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
      location.hash = `#/quran/student/${id}`;
    } catch (e) {
      toast(e.message, true);
    }
  });
}

// المسارات (تُضاف لقائمة app.js)
routes.unshift(
  [/^#\/quran(?:\/(students|groups))?$/, (el, tab) => (state.user.role === 'talib' ? viewQuranStudent(el, state.user.id) : viewQuranHome(el, tab || ''))],
  [/^#\/quran\/student\/(\d+)(?:\?week=(\d{4}-\d{2}-\d{2}))?$/, (el, id, week) => viewQuranStudent(el, Number(id), week || '')],
  [/^#\/quran\/review\/(\d+)(?:\?date=(\d{4}-\d{2}-\d{2}))?$/, (el, id, d) => viewQuranReview(el, Number(id), d || '')],
  [/^#\/quran\/hifz\/(\d+)$/, (el, id) => viewQuranHifz(el, Number(id))],
  [/^#\/quran\/group\/(\d+)$/, (el, id) => viewQuranGroup(el, Number(id))],
  [/^#\/my-hifz$/, (el) => viewQuranHifz(el, state.user.id)],
  [/^#\/my-review$/, (el) => viewQuranReview(el, state.user.id)]
);
