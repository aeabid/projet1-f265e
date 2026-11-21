'use strict';
// ركن الفوائد: «من الشيخ» (فوائد لكل المجموعة أو لكل الطلبة) و«ملاحظاتي» (ما يكتبه الطالب لنفسه)

const fmtWhen = (ts) => {
  const d = new Date(ts);
  return `${Q_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
const benefitCard = (b, admin = false) => `<article class="ben-card">
    <div class="ben-head"><span class="pill">${b.group_name ? `🕌 ${esc(b.group_name)}` : '👥 لكل الطلبة'}</span>
      <small class="muted">${fmtWhen(b.created_at)}${b.by_name ? ` · ${esc(b.by_name)}` : ''}</small></div>
    ${b.title ? `<h4>${esc(b.title)}</h4>` : ''}
    <p class="ben-body">${esc(b.body)}</p>
    ${admin ? `<div class="q-actions"><button type="button" class="btn small ghost" data-ben-edit="${b.id}">تعديل</button>
      <button type="button" class="btn small ghost danger" data-ben-del="${b.id}">حذف</button></div>` : ''}
  </article>`;

// ---------- الطالب ----------
async function viewBenefits(el, tab = '') {
  tab = ['mine', 'polls'].includes(tab) ? tab : 'sheikh';
  el.innerHTML = `<div class="page-head"><h2>💡 الفوائد</h2></div>
    <div class="q-seg rec-seg" role="tablist">
      <a role="tab" href="#/benefits?sheikh" class="${tab === 'sheikh' ? 'on' : ''}">من الشيخ</a>
      <a role="tab" href="#/benefits?mine" class="${tab === 'mine' ? 'on' : ''}">ملاحظاتي</a>
      <a role="tab" href="#/benefits?polls" class="${tab === 'polls' ? 'on' : ''}">📊 الاستبيانات</a></div>
    <div id="ben-page"></div>`;
  const page = $('#ben-page');
  if (tab === 'polls') return studentPolls(page);
  if (tab === 'sheikh') {
    const { benefits } = await api('GET', '/api/quran/benefits');
    page.innerHTML = benefits.length
      ? `<div class="ben-list">${benefits.map((b) => benefitCard(b)).join('')}</div>`
      : '<div class="card empty-state"><span>💡</span><p>لا توجد فوائد بعد. ما يكتبه الشيخ لمجموعتك يظهر هنا.</p></div>';
    return;
  }
  const load = async () => {
    const { notes } = await api('GET', '/api/quran/my-notes');
    page.innerHTML = `<form class="card note-new" id="note-form">
        <label>ملاحظة جديدة<textarea name="body" rows="3" maxlength="5000" placeholder="مثال: الانتباه إلى المدّ في آية… / مواضع المتشابهات بين البقرة وآل عمران…"></textarea></label>
        <button class="btn" type="submit">＋ إضافة</button>
        <p class="muted small">ملاحظاتك خاصة بك، لا يراها غيرك.</p></form>
      ${notes.length ? `<div class="ben-list">${notes
        .map((n) => `<article class="ben-card mine"><div class="ben-head"><small class="muted">${fmtWhen(n.created_at)}${n.updated_at ? ' · عُدّلت' : ''}</small>
            <span class="q-actions"><button type="button" class="link small" data-note-edit="${n.id}">تعديل</button><button type="button" class="link small danger" data-note-del="${n.id}">حذف</button></span></div>
          <p class="ben-body">${esc(n.body)}</p></article>`)
        .join('')}</div>` : '<p class="muted center">لا ملاحظات بعد.</p>'}`;
    $('#note-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await api('POST', '/api/quran/my-notes', formData(e.target));
        toast('تمت الإضافة ✓');
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    page.querySelectorAll('[data-note-edit]').forEach((b) =>
      b.addEventListener('click', () => {
        const n = notes.find((x) => x.id === Number(b.dataset.noteEdit));
        openModal('تعديل الملاحظة', `<label>الملاحظة<textarea name="body" rows="6" maxlength="5000">${esc(n.body)}</textarea></label>`, async (data) => {
          await api('PUT', `/api/quran/my-notes/${n.id}`, data);
          load();
        });
      })
    );
    page.querySelectorAll('[data-note-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirmAction('حذف هذه الملاحظة؟')) return;
        await api('DELETE', `/api/quran/my-notes/${b.dataset.noteDel}`).catch((e) => toast(e.message, true));
        load();
      })
    );
  };
  await load();
}

// ---------- المشرف: كتابة الفوائد ----------
async function benefitsTab(page, groups) {
  const { benefits } = await api('GET', '/api/quran/benefits');
  page.innerHTML = `<div class="card"><div class="section-head"><h3>💡 الفوائد</h3><button type="button" class="btn small" id="ben-add">＋ فائدة جديدة</button></div>
      <p class="muted small">ما تكتبه هنا يظهر للطلبة في ركن «الفوائد ← من الشيخ»: لمجموعة معيّنة أو لكل الطلبة.</p></div>
    ${benefits.length ? `<div class="ben-list">${benefits.map((b) => benefitCard(b, true)).join('')}</div>` : '<div class="card empty-state"><span>💡</span><p>لم تُكتب أي فائدة بعد.</p></div>'}`;
  const form = (b) =>
    openModal(
      b ? 'تعديل الفائدة' : '💡 فائدة جديدة',
      `<label>لمن؟<select name="group_id"><option value="">👥 لكل الطلبة</option>${groups
        .map((g) => `<option value="${g.id}" ${b?.group_id === g.id ? 'selected' : ''}>🕌 ${esc(g.name)}</option>`).join('')}</select></label>
       <label>العنوان (اختياري)<input name="title" maxlength="150" value="${esc(b?.title || '')}"></label>
       <label>الفائدة<textarea name="body" rows="6" required maxlength="5000">${esc(b?.body || '')}</textarea></label>`,
      async (data) => {
        await api(b ? 'PUT' : 'POST', b ? `/api/quran/benefits/${b.id}` : '/api/quran/benefits', data);
        toast('تم الحفظ ✓');
        benefitsTab(page, groups);
      }
    );
  $('#ben-add').addEventListener('click', () => form(null));
  page.querySelectorAll('[data-ben-edit]').forEach((x) => x.addEventListener('click', () => form(benefits.find((b) => b.id === Number(x.dataset.benEdit)))));
  page.querySelectorAll('[data-ben-del]').forEach((x) =>
    x.addEventListener('click', async () => {
      if (!confirmAction('حذف هذه الفائدة؟')) return;
      await api('DELETE', `/api/quran/benefits/${x.dataset.benDel}`).catch((e) => toast(e.message, true));
      benefitsTab(page, groups);
    })
  );
}

routes.unshift([/^#\/benefits(?:\?(sheikh|mine|polls))?$/, (el, tab) => viewBenefits(el, tab || '')]);
