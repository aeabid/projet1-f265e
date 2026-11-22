'use strict';
// ركن الفوائد: «من الشيخ» (فوائد لكل المجموعة أو لكل الطلبة) و«ملاحظاتي» (ما يكتبه الطالب لنفسه)

const fmtWhen = (ts) => {
  const d = new Date(ts);
  return `${Q_DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};
// نص منسّق بسيط: «# عنوان»، «## عنوان فرعي»، «- نقطة»، «> اقتباس»، **عريض**، والروابط
function richText(src) {
  const inline = (t) =>
    esc(t)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  const flush = () => {
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    list = null;
  };
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    let m;
    if ((m = /^[-•*]\s+(.*)$/.exec(line))) {
      (list ||= []).push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    flush();
    if (!line) out.push('<div class="rt-gap"></div>');
    else if ((m = /^##\s+(.*)$/.exec(line))) out.push(`<h5 class="rt-h2">${inline(m[1])}</h5>`);
    else if ((m = /^#\s+(.*)$/.exec(line))) out.push(`<h4 class="rt-h1">${inline(m[1])}</h4>`);
    else if ((m = /^>\s?(.*)$/.exec(line))) out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}
// تصغير صورة قبل الرفع (أطول ضلع 1280 بكسل، JPEG)
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => reject(new Error('تعذّرت قراءة الصورة'));
    img.src = URL.createObjectURL(file);
  });
}
const ytBox = (id) => `<button type="button" class="yt" data-yt="${esc(id)}" aria-label="تشغيل الفيديو">
    <img src="https://i.ytimg.com/vi/${esc(id)}/hqdefault.jpg" alt="" loading="lazy"><span class="yt-play">▶</span></button>`;
const benefitCard = (b, admin = false) => `<article class="ben-card">
    <div class="ben-head"><span class="pill">${b.group_name ? `🕌 ${esc(b.group_name)}` : '👥 لكل الطلبة'}</span>
      <small class="muted">${fmtWhen(b.created_at)}${b.by_name ? ` · ${esc(b.by_name)}` : ''}</small></div>
    ${b.title ? `<h3 class="ben-title">${esc(b.title)}</h3>` : ''}
    ${b.body ? `<div class="rich">${richText(b.body)}</div>` : ''}
    ${b.images?.length ? `<div class="ben-imgs n${Math.min(b.images.length, 3)}">${b.images.map((i) => `<img src="/api/quran/benefit-images/${i}" alt="" loading="lazy" data-full="/api/quran/benefit-images/${i}">`).join('')}</div>` : ''}
    ${b.youtube?.length ? `<div class="ben-yts">${b.youtube.map(ytBox).join('')}</div>` : ''}
    ${admin ? `<div class="q-actions"><button type="button" class="btn small ghost" data-ben-edit="${b.id}">تعديل</button>
      <button type="button" class="btn small ghost danger" data-ben-del="${b.id}">حذف</button></div>` : ''}
  </article>`;
// تشغيل يوتيوب داخل البطاقة، وفتح الصورة بالحجم الكامل
function bindBenefitMedia(root) {
  root.querySelectorAll('[data-yt]').forEach((b) =>
    b.addEventListener('click', () => {
      b.outerHTML = `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${b.dataset.yt}?autoplay=1&rel=0" title="YouTube"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    })
  );
  root.querySelectorAll('[data-full]').forEach((img) =>
    img.addEventListener('click', () => {
      const ov = document.createElement('div');
      ov.className = 'img-view';
      ov.innerHTML = `<img src="${img.dataset.full}" alt=""><button type="button" aria-label="إغلاق">✕</button>`;
      ov.addEventListener('click', () => ov.remove());
      document.body.append(ov);
    })
  );
}

// ---------- الطالب ----------
async function viewBenefits(el, tab = '') {
  tab = tab === 'mine' ? 'mine' : 'sheikh';
  el.innerHTML = `<div class="page-head"><h2>💡 الفوائد</h2></div>
    <div class="q-seg rec-seg" role="tablist">
      <a role="tab" href="#/benefits?sheikh" class="${tab === 'sheikh' ? 'on' : ''}">من الشيخ</a>
      <a role="tab" href="#/benefits?mine" class="${tab === 'mine' ? 'on' : ''}">ملاحظاتي</a>
      <span></span></div>
    <div id="ben-page"></div>`;
  el.querySelector('.rec-seg').style.gridTemplateColumns = '1fr 1fr';
  el.querySelector('.rec-seg span').remove();
  const page = $('#ben-page');
  if (tab === 'sheikh') {
    const { benefits } = await api('GET', '/api/quran/benefits');
    page.innerHTML = benefits.length
      ? `<div class="ben-list">${benefits.map((b) => benefitCard(b)).join('')}</div>`
      : '<div class="card empty-state"><span>💡</span><p>لا توجد فوائد بعد. ما يكتبه الشيخ لمجموعتك يظهر هنا.</p></div>';
    bindBenefitMedia(page);
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
  const TOOLS = [['# ', 'عنوان'], ['## ', 'عنوان فرعي'], ['- ', '• نقطة'], ['> ', '❝ اقتباس'], ['**', 'عريض']];
  const form = (b) => {
    let keep = [...(b?.images || [])];
    let fresh = [];
    openModal(
      b ? 'تعديل الفائدة' : '💡 فائدة جديدة',
      `<label>لمن؟<select name="group_id"><option value="">👥 لكل الطلبة</option>${groups
        .map((g) => `<option value="${g.id}" ${b?.group_id === g.id ? 'selected' : ''}>🕌 ${esc(g.name)}</option>`).join('')}</select></label>
       <label>العنوان<input name="title" maxlength="150" value="${esc(b?.title || '')}" placeholder="مثال: من آداب حامل القرآن"></label>
       <label>النص</label>
       <div class="rt-tools">${TOOLS.map(([m, l]) => `<button type="button" data-md="${esc(m)}">${l}</button>`).join('')}</div>
       <textarea name="body" id="ben-body" rows="7" maxlength="8000" placeholder="# عنوان&#10;نص الفائدة…&#10;- نقطة&#10;- نقطة">${esc(b?.body || '')}</textarea>
       <label>🖼 صور (6 على الأكثر)</label>
       <div class="ben-pics" id="ben-pics"></div>
       <label class="btn small ghost file-btn">＋ إضافة صور<input type="file" id="ben-files" accept="image/*" multiple hidden></label>
       <label>▶ روابط يوتيوب (رابط في كل سطر)<textarea name="youtube" rows="2" dir="ltr" placeholder="https://youtu.be/...">${(b?.youtube || []).map((id) => `https://youtu.be/${id}`).join('\n')}</textarea></label>
       <details class="rt-help"><summary>كيف أكتب عنوانًا أو نقاطًا؟</summary>
         <p><code># عنوان</code> · <code>## عنوان فرعي</code> · <code>- نقطة</code> · <code>&gt; اقتباس</code> · <code>**عريض**</code></p></details>`,
      async (data) => {
        const youtube = String(data.youtube || '').split(/\s+/).filter(Boolean);
        await api(b ? 'PUT' : 'POST', b ? `/api/quran/benefits/${b.id}` : '/api/quran/benefits', {
          group_id: data.group_id, title: data.title, body: data.body, youtube, images: fresh, keep_images: keep,
        });
        toast('تم الحفظ ✓');
        benefitsTab(page, groups);
      }
    );
    const pics = $('#ben-pics');
    const drawPics = () => {
      pics.innerHTML =
        keep.map((i) => `<span class="ben-pic"><img src="/api/quran/benefit-images/${i}" alt=""><button type="button" data-rm-old="${i}">✕</button></span>`).join('') +
        fresh.map((d, k) => `<span class="ben-pic"><img src="${d}" alt=""><button type="button" data-rm-new="${k}">✕</button></span>`).join('');
      pics.querySelectorAll('[data-rm-old]').forEach((x) => x.addEventListener('click', () => ((keep = keep.filter((i) => i !== Number(x.dataset.rmOld))), drawPics())));
      pics.querySelectorAll('[data-rm-new]').forEach((x) => x.addEventListener('click', () => (fresh.splice(Number(x.dataset.rmNew), 1), drawPics())));
    };
    drawPics();
    $('#ben-files').addEventListener('change', async (e) => {
      for (const f of [...e.target.files]) {
        if (keep.length + fresh.length >= 6) {
          toast('6 صور على الأكثر', true);
          break;
        }
        try {
          fresh.push(await shrinkImage(f));
        } catch (err) {
          toast(err.message, true);
        }
      }
      e.target.value = '';
      drawPics();
    });
    // أزرار التنسيق: تضيف العلامة في بداية السطر (أو حول النص المحدّد للعريض)
    const ta = $('#ben-body');
    $('#modal-form .rt-tools').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-md]');
      if (!btn) return;
      const m = btn.dataset.md;
      const { selectionStart: a, selectionEnd: z, value: v } = ta;
      if (m === '**') {
        const sel = v.slice(a, z) || 'نص عريض';
        ta.value = v.slice(0, a) + `**${sel}**` + v.slice(z);
      } else {
        const ls = v.lastIndexOf('\n', a - 1) + 1;
        ta.value = v.slice(0, ls) + m + v.slice(ls);
      }
      ta.focus();
    });
  };
  $('#ben-add').addEventListener('click', () => form(null));
  bindBenefitMedia(page);
  page.querySelectorAll('[data-ben-edit]').forEach((x) => x.addEventListener('click', () => form(benefits.find((b) => b.id === Number(x.dataset.benEdit)))));
  page.querySelectorAll('[data-ben-del]').forEach((x) =>
    x.addEventListener('click', async () => {
      if (!confirmAction('حذف هذه الفائدة؟')) return;
      await api('DELETE', `/api/quran/benefits/${x.dataset.benDel}`).catch((e) => toast(e.message, true));
      benefitsTab(page, groups);
    })
  );
}

routes.unshift([/^#\/benefits(?:\?(sheikh|mine))?$/, (el, tab) => viewBenefits(el, tab || '')]);
