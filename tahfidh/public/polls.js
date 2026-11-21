'use strict';
// سبر الآراء والتقييمات: المشرف يعدّ الاستبيان ويرى النتائج، والطالب يجيب

const POLL_TYPES = { single: 'اختيار واحد', multi: 'اختيارات متعددة', rating: 'تقييم بالنجوم (1–5)', text: 'جواب مكتوب' };
const pollAudience = (p) => (p.group_name ? `🕌 ${esc(p.group_name)}` : '👥 لكل الطلبة');

// ---------- المشرف: القائمة ----------
async function pollsTab(page, groups) {
  const { polls } = await api('GET', '/api/quran/polls');
  page.innerHTML = `<div class="card"><div class="section-head"><h3>📊 سبر الآراء والتقييمات</h3><button type="button" class="btn small" id="poll-add">＋ استبيان جديد</button></div>
      <p class="muted small">أسئلة باختيار واحد أو اختيارات متعددة أو تقييم بالنجوم أو جواب مكتوب. يظهر الاستبيان للطلبة في «الفوائد ← الاستبيانات».</p></div>
    ${polls.length ? `<div class="ben-list">${polls
      .map((p) => `<article class="ben-card poll-card ${p.closed ? 'closed' : ''}">
        <div class="ben-head"><span class="pill">${pollAudience(p)}</span>
          <span class="badge ${p.closed ? 'general' : 'good'}">${p.closed ? 'مغلق' : 'مفتوح'}</span></div>
        <h4>${esc(p.title)}</h4>
        <p class="muted small">${p.questions.length} ${p.questions.length > 2 ? 'أسئلة' : 'سؤال'} · أجاب <b>${p.answers}</b> من ${p.audience}${p.anonymous ? ' · بدون أسماء' : ''}</p>
        ${bar(p.answers, p.audience || 1, 'ok')}
        <div class="q-actions"><a class="btn small" href="#/quran/poll/${p.id}">📈 النتائج</a>
          <button type="button" class="btn small ghost" data-poll-edit="${p.id}">تعديل</button>
          <button type="button" class="btn small ghost" data-poll-close="${p.id}" data-closed="${p.closed ? 1 : 0}">${p.closed ? 'إعادة فتح' : 'إغلاق'}</button>
          <button type="button" class="btn small ghost danger" data-poll-del="${p.id}">حذف</button></div></article>`)
      .join('')}</div>` : '<div class="card empty-state"><span>📊</span><p>لا استبيانات بعد.</p></div>'}`;
  const reload = () => pollsTab(page, groups);
  $('#poll-add').addEventListener('click', () => pollForm(null, groups, reload));
  page.querySelectorAll('[data-poll-edit]').forEach((b) => b.addEventListener('click', () => pollForm(polls.find((p) => p.id === Number(b.dataset.pollEdit)), groups, reload)));
  page.querySelectorAll('[data-poll-close]').forEach((b) =>
    b.addEventListener('click', async () => {
      await api('PUT', `/api/quran/polls/${b.dataset.pollClose}/closed`, { closed: b.dataset.closed !== '1' }).catch((e) => toast(e.message, true));
      reload();
    })
  );
  page.querySelectorAll('[data-poll-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!confirmAction('حذف هذا الاستبيان وكل أجوبته؟')) return;
      await api('DELETE', `/api/quran/polls/${b.dataset.pollDel}`).catch((e) => toast(e.message, true));
      reload();
    })
  );
}

// ---------- المشرف: إعداد الاستبيان ----------
function pollForm(p, groups, onDone) {
  const qRow = (q = { q: '', type: 'single', options: ['', ''] }) => `<div class="poll-q">
      <div class="poll-q-head"><b class="poll-q-n"></b><button type="button" class="link small danger" data-q-del>حذف السؤال</button></div>
      <input class="pq-text" placeholder="نص السؤال" maxlength="300" value="${esc(q.q)}">
      <select class="pq-type">${Object.entries(POLL_TYPES).map(([k, l]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <textarea class="pq-opts" rows="3" placeholder="اختيار في كل سطر" ${q.type === 'single' || q.type === 'multi' ? '' : 'hidden'}>${esc((q.options || []).join('\n'))}</textarea>
    </div>`;
  openModal(
    p ? 'تعديل الاستبيان' : '📊 استبيان جديد',
    `<label>العنوان<input name="title" required maxlength="150" value="${esc(p?.title || '')}" placeholder="مثال: تقييم الحلقة لشهر نوفمبر"></label>
     <label>وصف (اختياري)<textarea name="description" rows="2" maxlength="1000">${esc(p?.description || '')}</textarea></label>
     <div class="row"><label>لمن؟<select name="group_id"><option value="">👥 لكل الطلبة</option>${groups
       .map((g) => `<option value="${g.id}" ${p?.group_id === g.id ? 'selected' : ''}>🕌 ${esc(g.name)}</option>`).join('')}</select></label>
       <label class="check poll-anon"><input type="checkbox" name="anonymous" ${p?.anonymous ? 'checked' : ''}> بدون أسماء</label></div>
     ${p?.answers ? '<p class="muted small">⚠️ أجاب بعض الطلبة: تغيير الأسئلة قد يُربك نتائجها.</p>' : ''}
     <div id="poll-qs">${(p?.questions?.length ? p.questions : [undefined]).map((q) => qRow(q)).join('')}</div>
     <button type="button" class="btn small ghost" id="poll-q-add">＋ سؤال</button>`,
    async (data) => {
      const questions = [...document.querySelectorAll('#poll-qs .poll-q')].map((r) => ({
        q: r.querySelector('.pq-text').value,
        type: r.querySelector('.pq-type').value,
        options: r.querySelector('.pq-opts').value.split('\n').map((x) => x.trim()).filter(Boolean),
      }));
      await api(p ? 'PUT' : 'POST', p ? `/api/quran/polls/${p.id}` : '/api/quran/polls', { ...data, questions });
      toast('تم الحفظ ✓');
      onDone();
    }
  );
  const box = $('#poll-qs');
  const renumber = () => box.querySelectorAll('.poll-q-n').forEach((b, i) => (b.textContent = `السؤال ${i + 1}`));
  renumber();
  $('#poll-q-add').addEventListener('click', () => {
    box.insertAdjacentHTML('beforeend', qRow());
    enhanceSelects(box);
    renumber();
  });
  box.addEventListener('click', (e) => {
    if (!e.target.closest('[data-q-del]')) return;
    if (box.children.length > 1) e.target.closest('.poll-q').remove();
    renumber();
  });
  box.addEventListener('change', (e) => {
    if (!e.target.classList.contains('pq-type')) return;
    e.target.closest('.poll-q').querySelector('.pq-opts').hidden = !['single', 'multi'].includes(e.target.value);
  });
}

// ---------- المشرف: النتائج ----------
async function viewPollResults(el, id) {
  const { poll: p, results, respondents } = await api('GET', `/api/quran/polls/${id}/results`);
  const stars = (n) => '★'.repeat(Math.round(n || 0)) + '☆'.repeat(5 - Math.round(n || 0));
  el.innerHTML = `<p><a href="#/quran/polls">→ سبر الآراء</a></p>
    <div class="card"><div class="ben-head"><span class="pill">${pollAudience(p)}</span><span class="badge ${p.closed ? 'general' : 'good'}">${p.closed ? 'مغلق' : 'مفتوح'}</span></div>
      <h2>${esc(p.title)}</h2>${p.description ? `<p class="ben-body muted">${esc(p.description)}</p>` : ''}
      <div class="h-tot"><span><b>${p.answers}</b><small>أجابوا</small></span><span><b>${p.audience}</b><small>معنيّون</small></span>
        <span><b>${p.audience ? Math.round((p.answers / p.audience) * 100) : 0}%</b><small>نسبة المشاركة</small></span></div></div>
    ${results
      .map((r, i) => `<div class="card poll-res"><p class="muted small">السؤال ${i + 1} · ${POLL_TYPES[r.type]} · ${r.answered} جواب</p><h3>${esc(r.q)}</h3>
        ${r.options ? r.options.map((o) => `<div class="poll-bar"><span>${esc(o.label)}</span>${bar(o.count, r.answered || 1, 'ok')}<b>${o.count} <small>(${r.answered ? Math.round((o.count / r.answered) * 100) : 0}%)</small></b></div>`).join('') : ''}
        ${r.type === 'rating' ? `<p class="poll-avg"><span class="stars">${stars(r.average)}</span> <b>${r.average ?? '—'}</b> / 5</p>
          ${r.stars.map((c, k) => `<div class="poll-bar"><span>${'★'.repeat(k + 1)}</span>${bar(c, r.answered || 1)}<b>${c}</b></div>`).reverse().join('')}` : ''}
        ${r.texts ? (r.texts.length ? `<ul class="notes">${r.texts.map((t) => `<li class="note"><p>${esc(t.text)}</p>${t.who ? `<small class="muted">${esc(t.who)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="muted">لا أجوبة.</p>') : ''}
      </div>`)
      .join('')}
    ${respondents?.length ? `<div class="card"><h3>من أجاب</h3><p>${respondents.map(esc).join('، ')}</p></div>` : ''}`;
}

// ---------- الطالب ----------
async function studentPolls(page) {
  const { polls } = await api('GET', '/api/quran/polls');
  if (!polls.length) {
    page.innerHTML = '<div class="card empty-state"><span>📊</span><p>لا استبيانات حاليًا.</p></div>';
    return;
  }
  page.innerHTML = `<div class="ben-list">${polls
    .map((p) => {
      const mine = p.my_answers || [];
      const q = (x, i) => {
        const a = mine[i];
        const name = `p${p.id}q${i}`;
        const dis = p.closed ? 'disabled' : '';
        let input = '';
        if (x.type === 'single') input = x.options.map((o, k) => `<label class="poll-opt"><input type="radio" name="${name}" value="${k}" ${a === k ? 'checked' : ''} ${dis}> ${esc(o)}</label>`).join('');
        else if (x.type === 'multi') input = x.options.map((o, k) => `<label class="poll-opt"><input type="checkbox" name="${name}" value="${k}" ${Array.isArray(a) && a.includes(k) ? 'checked' : ''} ${dis}> ${esc(o)}</label>`).join('');
        else if (x.type === 'rating') input = `<div class="poll-stars" data-name="${name}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="${a >= n ? 'on' : ''}" data-v="${n}" ${dis} aria-label="${n}">★</button>`).join('')}<input type="hidden" name="${name}" value="${a || ''}"></div>`;
        else input = `<textarea name="${name}" rows="2" maxlength="1000" ${dis}>${esc(a || '')}</textarea>`;
        return `<div class="poll-qa"><b>${i + 1}. ${esc(x.q)}</b>${x.type === 'multi' ? '<small class="muted"> (يمكن اختيار أكثر من واحد)</small>' : ''}<div>${input}</div></div>`;
      };
      return `<article class="ben-card poll-card ${p.closed ? 'closed' : ''}">
        <div class="ben-head"><span class="badge ${p.my_answers ? 'good' : p.closed ? 'general' : 'average'}">${p.my_answers ? '✓ أجبت' : p.closed ? 'مغلق' : 'بانتظار جوابك'}</span>
          ${p.anonymous ? '<small class="muted">🔒 بدون أسماء</small>' : ''}</div>
        <h4>${esc(p.title)}</h4>${p.description ? `<p class="ben-body muted small">${esc(p.description)}</p>` : ''}
        <form data-poll="${p.id}">${p.questions.map(q).join('')}
          ${p.closed ? '' : `<button class="btn" type="submit">${p.my_answers ? 'تعديل جوابي' : 'إرسال'}</button>`}</form></article>`;
    })
    .join('')}</div>`;
  page.querySelectorAll('.poll-stars').forEach((s) =>
    s.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      s.querySelector('input').value = b.dataset.v;
      s.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= Number(b.dataset.v)));
    })
  );
  page.querySelectorAll('form[data-poll]').forEach((f) =>
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const p = polls.find((x) => x.id === Number(f.dataset.poll));
      const answers = p.questions.map((x, i) => {
        const name = `p${p.id}q${i}`;
        if (x.type === 'single') { const c = f.querySelector(`input[name="${name}"]:checked`); return c ? Number(c.value) : null; }
        if (x.type === 'multi') return [...f.querySelectorAll(`input[name="${name}"]:checked`)].map((c) => Number(c.value));
        if (x.type === 'rating') return Number(f.querySelector(`input[name="${name}"]`).value) || null;
        return f.querySelector(`[name="${name}"]`).value.trim() || null;
      });
      try {
        await api('PUT', `/api/quran/polls/${p.id}/answer`, { answers });
        toast('شكرًا، تم إرسال جوابك ✓');
        studentPolls(page);
      } catch (err) {
        toast(err.message, true);
      }
    })
  );
}

routes.unshift([/^#\/quran\/poll\/(\d+)$/, (el, id) => viewPollResults(el, Number(id))]);
