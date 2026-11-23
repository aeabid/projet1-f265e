#!/usr/bin/env python3
"""بناء كتاب النّحو والصّرف للمبتدئين.

الاستعمال:
    python3 book/build.py          # يبني book/dist/kitab-nahw-sarf.html و .pdf

كلّ درس موجود في book/lessons/NN.html (ملخّص ثمّ تمارين ثمّ إصلاح).
لتغيير اسم المعلّم أو المستوى أو السّنة: عدّل القيم في CONFIG أسفله.
"""
import json, os, re, subprocess, sys, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")

CONFIG = {
    "teacher": "علاء عبيد",
    "subject": "العربيّة",
    "year": "2027/2026",
    "book": "كتاب النّحو والصّرف",
    "level": "للمبتدئين",
}

# ترتيب الدّروس (حسب ترتيب المعلّم)
LESSONS = [
    ("الاسم والفعل والحرف", "علامات الاسم . علامات الفعل . الحرف وأنواعه"),
    ("النّكرة والمعرفة", "اسم الإشارة . الضّمائر . اسم العلم . المعرّف بالألف واللّام"),
    ("الجملة الاسميّة والجملة الفعليّة", "المبتدأ والخبر . الفعل والفاعل والمفعول به"),
    ("الوظائف", "كيف أجد المتمّمات بالسّؤال : المفعول به . المفعول فيه . المفعول لأجله . الحال"),
    ("المركّبات", "النّعتيّ . الإضافيّ . البدليّ . العطفيّ . المركّب بالجرّ"),
    ("أنواع الأسماء من حيث العدد", "المفرد . المثنّى . الجمع وأنواعه . الأسماء الخمسة"),
    ("إعراب الأسماء", "المرفوع والمنصوب والمجرور . علامات الإعراب الأصليّة والفرعيّة"),
    ("صيغ الفعل", "الماضي . المضارع . الأمر"),
    ("المجرّد والمزيد", "المجرّد . المزيد بحرف وبحرفين وبثلاثة أحرف"),
    ("الصّحيح والمعتلّ", "السّالم . المهموز . المضاعف . المثال . الأجوف . النّاقص"),
    ("إعراب الأفعال", "المبنيّ والمعرب . المضارع المرفوع والمنصوب والمجزوم"),
    ("المبنيّ للمعلوم والمبنيّ للمجهول", "تحويل الفعل . نائب الفاعل"),
    ("اللّازم والمتعدّي", "الفعل الّذي يكتفي بفاعله والفعل الّذي يطلب مفعولًا به"),
    ("رسم الهمزة", "همزة الوصل وهمزة القطع . الهمزة المتوسّطة . الهمزة المتطرّفة"),
]

PARTS = {1: "الجزء الأوّل : النّحو", 8: "الجزء الثّاني : الصّرف والفعل", 14: "الجزء الثّالث : الإملاء"}

AR_DIGITS = str.maketrans("0123456789", "0123456789")


def header(n, title):
    c = CONFIG
    return f"""<div class="hdr">
  <div><b>المعلّم : {c['teacher']}</b></div>
  <div class="c"><b>{c['book']} {c['level']}</b><span>الدّرس {n} : {title}</span></div>
  <div class="c"><b>المادّة : {c['subject']}</b><b>{c['year']}</b></div>
  <div><img src="assets/logo.png" alt="feed"></div>
</div>"""


def lesson_cover(n, title, sub):
    return f"""<section class="cover">
  <div class="deco a"></div><div class="deco b"></div>
  <div class="logo-card"><img src="assets/logo.png" alt="feed"></div>
  <span class="pill">الدّرس {n}</span>
  <h1>{title}</h1>
  <div class="sub">{sub}<br>ملخّص الدّرس . تمارين متدرّجة . الإصلاح</div>
  <span style="color:var(--p);font-size:2pt">ZZLESSON{n}</span>
</section>"""


def book_cover():
    c = CONFIG
    return f"""<section class="bookcover">
  <div class="deco a"></div><div class="deco b"></div>
  <div class="logo-card"><img src="assets/logo.png" alt="feed"></div>
  <h1>{c['book']}<br>{c['level']}</h1>
  <div class="tag">14 درسًا . ملخّصات . تمارين متدرّجة . إصلاح</div>
  <div class="meta">المعلّم : <b>{c['teacher']}</b><br>المادّة : <b>{c['subject']}</b> — السّنة الدّراسيّة <b>{c['year']}</b></div>
</section>"""


def toc(pages):
    items = []
    for i, (t, d) in enumerate(LESSONS, 1):
        if i in PARTS:
            items.append(f'<div class="part">{PARTS[i]}</div>')
        pg = f"ص {pages[i]}" if pages and i in pages else ""
        items.append(f'<div class="it"><div class="num">{i}</div><div><div class="tt">{t}</div><div class="ds">{d}</div></div><div class="pg">{pg}</div></div>')
    return f"""<table class="lesson"><thead><tr><td>{header('—', 'الفهرس').replace('الدّرس — : ', '')}</td></tr></thead><tbody><tr><td>
<h2 class="ttl">الفهرس</h2>
<p style="margin:0 0 1mm">يتضمّن كلّ درسٍ : <b>ملخّصًا</b> للقاعدة، ثمّ <b>تمارين متدرّجة</b> من السّهل إلى الصّعب، ثمّ <b>الإصلاح</b>.</p>
<div class="flow">
  <div><b>1. الملخّص</b>أفهمُ القاعدةَ والمنهجيّة</div><span>←</span>
  <div><b>2. التّمارين</b>من السّهل إلى الصّعب</div><span>←</span>
  <div><b>3. الإصلاح</b>أتثبّتُ وأُصلحُ أخطائي</div>
</div>
<div class="levels"><span class="lvl l1">★ سهل</span><span class="lvl l2">★★ متوسّط</span><span class="lvl l3">★★★ صعب</span></div>
<div class="toc">{''.join(items)}</div>
<div class="note tip" style="margin-top:4mm">أقرأُ الملخّصَ جيّدًا قبل أن أبدأَ التّمارين، وأُنجزُها بالتّرتيب، ثمّ أعودُ إلى الإصلاح لأتثبّتَ من إجاباتي وأفهمَ أخطائي.</div>
</td></tr></tbody><tfoot><tr><td></td></tr></tfoot></table>"""


def build_html(pages=None):
    parts = [book_cover(), toc(pages)]
    for i, (t, d) in enumerate(LESSONS, 1):
        path = os.path.join(ROOT, "lessons", f"{i:02d}.html")
        body = open(path, encoding="utf-8").read() if os.path.exists(path) else "<p>قيد الإعداد</p>"
        parts.append(lesson_cover(i, t, d))
        parts.append(f'<table class="lesson"><thead><tr><td>{header(i, t)}</td></tr></thead><tbody><tr><td>\n{body}\n</td></tr></tbody></table>')
    return f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{CONFIG['book']} {CONFIG['level']}</title>
<link rel="stylesheet" href="assets/book.css">
</head><body><div class="page-wrap">
{''.join(parts)}
</div></body></html>"""


def render_pdf(html_path, pdf_path):
    js = f"""
const {{chromium}} = require('playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://{html_path}', {{waitUntil: 'networkidle'}});
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({{path: '{pdf_path}', preferCSSPageSize: true, printBackground: true}});
  await b.close();
}})();"""
    subprocess.run(["node", "-e", js], check=True)


def find_pages(pdf_path):
    out = subprocess.run(["pdftotext", pdf_path, "-"], capture_output=True, text=True).stdout
    pages = {}
    for pno, txt in enumerate(out.split("\f"), 1):
        txt = re.sub("[\u200e\u200f\u202a-\u202e]", "", txt)
        for m in re.finditer(r"ZZLESSON(\d+)", txt):
            pages[int(m.group(1))] = pno
    return pages


def main():
    os.makedirs(DIST, exist_ok=True)
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(DIST, "assets"), dirs_exist_ok=True)
    html_path = os.path.join(DIST, "kitab-nahw-sarf.html")
    pdf_path = os.path.join(DIST, "kitab-nahw-sarf.pdf")
    open(html_path, "w", encoding="utf-8").write(build_html())
    if "--html-only" in sys.argv:
        return
    render_pdf(html_path, pdf_path)
    pages = find_pages(pdf_path)
    open(html_path, "w", encoding="utf-8").write(build_html(pages))
    render_pdf(html_path, pdf_path)
    print("pages:", json.dumps(pages))


if __name__ == "__main__":
    main()
