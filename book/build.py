#!/usr/bin/env python3
"""بناء «المرجع في العربيّة» : النّحو · الصّرف · الرّسم · البلاغة · المطالعة.

    python3 book/build.py            # يبني dist/al-marja.html ثمّ dist/al-marja.pdf
    python3 book/build.py --html     # HTML فقط (للمعاينة السّريعة)

الدّروس مكتوبة في book/lessons/*.txt بصيغةٍ مبسّطة (انظر README.md)،
والإصلاح يُولَّدُ آليًّا من الإجابات المكتوبة داخل كلّ تمرين.
قسمُ المطالعة يُؤخَذُ كما هو من صفحات كتاب «المرجع» الأصليّ (MARJA_PDF).
"""
import glob, html, json, os, random, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, "dist")
sys.path.insert(0, ROOT)
from art import OWL, ICONS, SECTION_ART  # noqa: E402

MARJA_PDF = os.environ.get("MARJA_PDF", os.path.join(ROOT, "source", "al-marja1.pdf"))
READING_PAGES = (5, 113)  # صفحات نصوص المطالعة في الكتاب الأصليّ

SECTIONS = [
    # key, الاسم, اللّون, اللّون الفاتح, وصف الغلاف
    ("nahw", "النّحو", "#1f6fd1", "#e3eefc", "نتعلّمُ كيف تتركّبُ الكلماتُ في الجملة، وما وظيفةُ كلّ كلمة، وكيف نضبطُ أواخرَها."),
    ("sarf", "الصّرف", "#0f9a63", "#ddf5ea", "نتعلّمُ كيف تُبنى الكلمة : صيغُ الفعل، وحروفُه الأصليّة والزّائدة، والصّحيحُ والمعتلّ."),
    ("rasm", "الرّسم", "#ee7d12", "#fdebd8", "نتعلّمُ كيف نكتبُ الهمزةَ كتابةً صحيحة في أوّل الكلمة ووسطها وآخرها."),
    ("balagha", "البلاغة", "#e3177a", "#fde3ef", "نتعلّمُ كيف نُعبّرُ عن المعنى بأجمل طريقة، ونتذوّقُ جمالَ اللّغة في القرآن الكريم والشّعر والنّثر."),
    ("mutalaa", "المطالعة", "#5a2ca0", "#ece4f8", "نصوصٌ مختارةٌ من عيون الأدب العربيّ، يرافقُ كلَّ نصٍّ شرحٌ لكلماته وفوائدُ لغويّةٌ وبلاغيّةٌ وتربويّة، وتمارينُ وإصلاحُها."),
]
SEC = {s[0]: s for s in SECTIONS}
ORDINAL = ["الأوّل", "الثّاني", "الثّالث", "الرّابع", "الخامس"]

READING_TEXTS = [  # (العنوان، المصدر، الصّفحة في الكتاب الأصليّ)
    ("الرُّقاقتان", "مصطفى صادق الرّافعي · وحي القلم", 5),
    ("ليلةُ العيد", "مصطفى لطفي المنفلوطي · النّظرات", 14),
    ("مدينةُ السّعادة", "مصطفى لطفي المنفلوطي · النّظرات", 23),
    ("بدءُ الوحي", "من صحيح البخاريّ", 37),
    ("قصّةُ موسى عليه السّلام", "سورة القصص · الآيات 1-28", 46),
    ("الكأسُ الأولى", "مصطفى لطفي المنفلوطي", 57),
    ("في بني سعد", "أبو الحسن النّدوي · مختارات من أدب العرب", 67),
    ("أينَ يوسف؟", "قصّةُ أمٍّ في أيّام الحرب", 79),
    ("في صفةِ النّبيّ صلّى الله عليه وسلّم", "من منظومة «جُهدُ المُقِلّ»", 86),
    ("الابنُ الحقيقيّ", "حكايةُ القاضي وورد شاه", 95),
    ("السّائحُ والصّائغ", "ابن المقفّع · كليلة ودمنة", 102),
]

LEVELS = {"1": ("l1", "★ سهل"), "2": ("l2", "★★ متوسّط"), "3": ("l3", "★★★ صعب")}
E = html.escape


# ───────────────────────────── تحليل ملفّات الدّروس ─────────────────────────────
def parse_lesson(path):
    txt = open(path, encoding="utf-8").read()
    parts = re.split(r"^::(?=(?:meta|discover|rule|html|ex|tip)\b)", txt, flags=re.M)
    lesson = {"blocks": [], "file": os.path.basename(path)}
    for part in parts:
        if not part.strip():
            continue
        head, _, body = part.partition("\n")
        head = head.strip()
        kind, _, rest = head.partition(" ")
        if kind == "meta":
            for line in body.splitlines():
                if ":" in line:
                    k, _, v = line.partition(":")
                    lesson[k.strip()] = v.strip()
        else:
            lesson["blocks"].append((kind, rest.strip(), body.rstrip("\n")))
    return lesson


def rich(s):
    """تنسيقات سطريّة : **غامق** ، ==ملوّن== ، __مسطّر__ ، ((تلميح)) ، {{هدف}}."""
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    s = re.sub(r"==(.+?)==", r'<span class="hl">\1</span>', s)
    s = re.sub(r"__(.+?)__", r'<span class="u">\1</span>', s)
    s = re.sub(r"\(\((.+?)\)\)", r'<span class="hint">(\1)</span>', s)
    s = re.sub(r"\{ICON_(\w+)\}", lambda m: ICONS[m.group(1).lower()], s)
    return s


def split_blocks(body):
    """كلّ عنصر HTML يبدأ في أوّل السّطر = كتلة مستقلّة في التّرقيم."""
    chunks = re.split(r"\n(?=<)", "\n" + body.strip())
    return [rich(c.strip()) for c in chunks if c.strip()]


def lines_of(body):
    return [l.strip() for l in body.splitlines() if l.strip() and not l.strip().startswith("#")]


def opts(lines):
    o, rest = {}, []
    for l in lines:
        m = re.match(r"^(bank|cols|head|lines|answer|words|size|note|mode|intro)\s*:\s*(.*)$", l)
        if m:
            o[m.group(1)] = m.group(2)
        else:
            rest.append(l)
    return o, rest


def blank(cls=""):
    return f'<span class="blank {cls}"></span>'


# ───────────────────────────── أنواع التّمارين ─────────────────────────────
def ex_match(lines, o, rnd):
    pairs = [tuple(x.strip() for x in l.split("=>")) for l in lines]
    right = [b for _, b in pairs]
    shuffled = right[:]
    for _ in range(10):
        rnd.shuffle(shuffled)
        if len(shuffled) < 3 or sum(a == b for a, b in zip(shuffled, right)) <= 1:
            break
    a_col = "".join(f'<div class="mi"><span class="mn">{i}</span>{rich(a)}<span class="dot"></span></div>' for i, (a, _) in enumerate(pairs, 1))
    b_col = "".join(f'<div class="mi"><span class="dot"></span>{rich(b)}</div>' for b in shuffled)
    ex = f'<div class="match"><div class="mcol">{a_col}</div><div class="mgap"></div><div class="mcol b">{b_col}</div></div>'
    cor = '<div class="clist">' + "".join(f'<span><b>{i}.</b> {rich(a)} <i class="ar">←</i> <span class="a">{rich(b)}</span></span>' for i, (a, b) in enumerate(pairs, 1)) + "</div>"
    return ex, cor


def ex_classify(lines, o, rnd):
    cols = [c.strip() for c in o["cols"].split("|")]
    groups = {c: [] for c in cols}
    for l in lines:
        c, _, ws = l.partition(":")
        groups[c.strip()] = [w.strip() for w in re.split(r"\s+[-–]\s+|،", ws) if w.strip()]
    allw = [w for c in cols for w in groups[c]]
    rnd.shuffle(allw)
    bank = '<div class="bank">' + "".join(f"<span>{rich(w)}</span>" for w in allw) + "</div>"
    h = max(len(g) for g in groups.values())
    th = "".join(f"<th>{c}</th>" for c in cols)
    td = "".join(f'<td style="height:{max(14, 7.2 * h)}mm"></td>' for _ in cols)
    ex = bank + f'<table class="t cls"><tr>{th}</tr><tr>{td}</tr></table>'
    tdc = "".join('<td class="a">' + " - ".join(rich(w) for w in groups[c]) + "</td>" for c in cols)
    cor = f'<table class="t"><tr>{th}</tr><tr>{tdc}</tr></table>'
    return ex, cor


def ex_tf(lines, o, rnd):
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        st, _, ans = l.partition("=>")
        ans, _, note = ans.partition("|")
        ok = ans.strip() in ("ص", "✓", "صواب")
        items.append(f'<div class="tfi"><span class="qn">{i}</span><span class="tx">{rich(st.strip())}</span><span class="tfb">صواب</span><span class="tfb">خطأ</span></div>')
        mark = '<span class="ok">✓ صواب</span>' if ok else '<span class="ko">✗ خطأ</span>'
        cors.append(f'<div class="cline"><b>{i}.</b> {mark}{(" — " + rich(note.strip())) if note.strip() else ""}</div>')
    return '<div class="tf">' + "".join(items) + "</div>", "".join(cors)


def ex_mcq(lines, o, rnd):
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        def q(m):
            ch = [c.strip() for c in m.group(1).split("|")]
            return '<span class="choice">( ' + " - ".join(c.lstrip("*") for c in ch) + " )</span>"

        def a(m):
            ch = [c.strip() for c in m.group(1).split("|")]
            good = [c[1:] for c in ch if c.startswith("*")]
            return f'<span class="a">{" / ".join(good)}</span>'
        items.append(f'<li>{rich(re.sub(r"{(.+?)}", q, l))}</li>')
        cors.append(f'<div class="cline"><b>{i}.</b> {rich(re.sub(r"{(.+?)}", a, l))}</div>')
    return '<ol class="q">' + "".join(items) + "</ol>", "".join(cors)


def ex_fill(lines, o, rnd):
    bank = ""
    if "bank" in o:
        bank = '<div class="bank">' + "".join(f"<span>{rich(w.strip())}</span>" for w in o["bank"].split(" - ")) + "</div>"
    cls = "two" if o.get("mode") == "two" else ""
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        size = lambda ans: "s" if len(ans) < 7 else ("l" if len(ans) > 16 else "")
        items.append("<li>" + rich(re.sub(r"\[(.+?)\]", lambda m: blank(size(m.group(1))), l)) + "</li>")
        cors.append(f'<div class="cline"><b>{i}.</b> ' + rich(re.sub(r"\(\(.+?\)\)", "", re.sub(r"\[(.+?)\]", r'<span class="a">\1</span>', l))) + "</div>")
    return bank + f'<ol class="q {cls}">' + "".join(items) + "</ol>", "".join(cors)


def ex_order(lines, o, rnd):
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        words = [w.strip() for w in l.split("/")]
        sh = words[:]
        for _ in range(10):
            rnd.shuffle(sh)
            if sh != words:
                break
        tiles = "".join(f'<span class="tile">{rich(w)}</span>' for w in sh)
        end = "" if words[-1].endswith(("؟", ".", "!")) else "."
        items.append(f'<div class="ord"><span class="qn">{i}</span><div class="tiles">{tiles}</div><div class="wline"></div></div>')
        cors.append(f'<div class="cline"><b>{i}.</b> <span class="a">{rich(" ".join(words))}{end}</span></div>')
    return "".join(items), "".join(cors)


def ex_table(lines, o, rnd):
    head = [h.strip() for h in o["head"].split("|")]
    th = "<tr>" + "".join(f"<th>{rich(h)}</th>" for h in head) + "</tr>"
    rows_e, rows_c = [], []
    for l in lines:
        cells = [c.strip() for c in l.split("|")]
        rows_e.append("<tr>" + "".join(("<td></td>" if re.fullmatch(r"\[.*\]", c) else f'<td class="g">{rich(c)}</td>') for c in cells) + "</tr>")
        rows_c.append("<tr>" + "".join((f'<td class="a">{rich(c[1:-1])}</td>' if re.fullmatch(r"\[.*\]", c) else f"<td>{rich(c)}</td>") for c in cells) + "</tr>")
    return f'<table class="t fillt">{th}{"".join(rows_e)}</table>', f'<table class="t">{th}{"".join(rows_c)}</table>'


def ex_fix(lines, o, rnd):
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        w, _, r = l.partition("=>")
        items.append(f"<li>{rich(w.strip())} <i class='ar'>←</i> {blank('l')}</li>")
        cors.append(f'<div class="cline"><b>{i}.</b> <span class="a">{rich(r.strip())}</span></div>')
    return '<ol class="q">' + "".join(items) + "</ol>", "".join(cors)


def ex_mark(lines, o, rnd):
    """أضعُ خطًّا تحت / ألوّنُ : الهدف بين {{ }}"""
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        items.append("<li>" + rich(re.sub(r"{{(.+?)}}", r"\1", l)) + "</li>")
        cors.append(f'<div class="cline"><b>{i}.</b> ' + rich(re.sub(r"{{(.+?)}}", r'<span class="a u">\1</span>', l)) + "</div>")
    return '<ol class="q">' + "".join(items) + "</ol>", "".join(cors)


def ex_open(lines, o, rnd):
    n = int(o.get("lines", "2"))
    body = "".join(f"<p>{rich(l)}</p>" for l in lines) + '<div class="wline"></div>' * n
    return body, f'<div class="cline">{rich(o.get("answer", "إنتاجٌ حرّ يتثبّتُ منه المعلّم."))}</div>'


def ex_scramble(lines, o, rnd):
    items, cors = [], []
    for i, l in enumerate(lines, 1):
        word, _, hint = l.partition("|")
        word = word.strip()
        letters = list(re.sub(r"[ً-ْ\s]", "", word))
        sh = letters[:]
        for _ in range(10):
            rnd.shuffle(sh)
            if sh != letters:
                break
        tiles = "".join(f'<span class="lt">{c}</span>' for c in sh)
        items.append(f'<div class="scr"><span class="qn">{i}</span><div class="lts">{tiles}</div><span class="hint">{rich(hint.strip())}</span><i class="ar">←</i>{blank()}</div>')
        cors.append(f'<span><b>{i}.</b> <span class="a">{word}</span></span>')
    return '<div class="scrs">' + "".join(items) + "</div>", '<div class="clist">' + "".join(cors) + "</div>"


AR_LETTERS = "ابتثجحخدذرزسشصضطظعغفقكلمنهوي"


def ex_wordsearch(lines, o, rnd):
    words = [w.strip() for w in o["words"].split("،") if w.strip()]
    plain = [re.sub(r"[ً-ْ\s]", "", w) for w in words]
    n = int(o.get("size", "8"))
    grid = [[None] * n for _ in range(n)]
    where = {}
    for w in sorted(plain, key=len, reverse=True):
        for _ in range(400):
            d = rnd.choice(["h", "v"])
            if d == "h":
                r, c = rnd.randrange(n), rnd.randrange(n - len(w) + 1)
                cells = [(r, c + k) for k in range(len(w))]
            else:
                r, c = rnd.randrange(n - len(w) + 1), rnd.randrange(n)
                cells = [(r + k, c) for k in range(len(w))]
            if all(grid[y][x] in (None, ch) for (y, x), ch in zip(cells, w)):
                for (y, x), ch in zip(cells, w):
                    grid[y][x] = ch
                where[w] = cells
                break
        else:
            raise SystemExit(f"wordsearch: cannot place {w}")
    for y in range(n):
        for x in range(n):
            if grid[y][x] is None:
                grid[y][x] = rnd.choice(AR_LETTERS)
    hit = {cell for cells in where.values() for cell in cells}

    def render(show):
        rows = ""
        for y in range(n):
            rows += "<tr>" + "".join(f'<td class="{"on" if show and (y, x) in hit else ""}">{grid[y][x]}</td>' for x in range(n)) + "</tr>"
        return f'<table class="ws">{rows}</table>'
    wl = '<div class="bank">' + "".join(f"<span>{w}</span>" for w in words) + "</div>"
    note = '<p class="hint">الكلماتُ مكتوبةٌ من اليمين إلى اليسار أو من الأعلى إلى الأسفل.</p>'
    return f'<div class="wsw">{render(False)}<div>{wl}{note}</div></div>', render(True)


def ex_html(lines, o, rnd, body=""):
    ex, _, ans = body.partition("::answer")
    return rich(ex.strip()), rich(ans.strip())


EX_TYPES = {"match": ex_match, "classify": ex_classify, "tf": ex_tf, "mcq": ex_mcq, "fill": ex_fill,
            "order": ex_order, "table": ex_table, "fix": ex_fix, "mark": ex_mark, "open": ex_open,
            "scramble": ex_scramble, "wordsearch": ex_wordsearch}

PART_TITLES = {
    "discover": ("أكتشفُ", "discover"), "rule": ("أفهمُ القاعدة", "rule"), "practice": ("أتدرّبُ", "practice"),
    "challenge": ("أتحدّى نفسي", "challenge"), "correction": ("الإصلاح", "correction"),
}


def part_title(key, extra=""):
    t, ic = PART_TITLES[key]
    return f'<h2 class="pt pt-{ic}"><span class="pti">{ICONS[ic]}</span>{t}{extra}</h2>'


# ───────────────────────────── تجميع الدّرس ─────────────────────────────
def render_lesson(L):
    sec = SEC[L["section"]]
    seed = f'{L["section"]}{L["num"]}'
    flow, cors = [], []
    flow.append(f'<div class="lhead"><div class="lnum">{sec[1]} {L["num"]}</div><h1>{L["title"]}</h1>'
                + (f'<div class="lsub">{L["sub"]}</div>' if L.get("sub") else "") + "</div>")
    exn = 0
    started_practice = started_challenge = False
    for kind, rest, body in L["blocks"]:
        if kind in ("discover", "rule"):
            flow.append(part_title(kind) + "<!--keep-->")
            flow.extend(split_blocks(body))
        elif kind == "html":
            flow.extend(split_blocks(body))
        elif kind == "ex":
            m = re.match(r"(\w+)\s+([123*])\s*\|\s*(.*)", rest)
            if not m:
                raise SystemExit(f'{L["file"]}: bad ex header: {rest}')
            typ, lvl, instr = m.groups()
            is_ch = lvl == "*"
            if is_ch and not started_challenge:
                flow.append(part_title("challenge") + "<!--keep-->")
                started_challenge = True
            elif not is_ch and not started_practice:
                flow.append(part_title("practice") + "<!--keep-->")
                started_practice = True
            exn += 1
            rnd = random.Random(f"{seed}-{exn}")
            o, lines = opts(lines_of(body))
            if typ == "html":
                ex, cor = ex_html(lines, o, rnd, body)
            else:
                ex, cor = EX_TYPES[typ](lines, o, rnd)
            intro = f'<p class="intro">{rich(o["intro"])}</p>' if "intro" in o else ""
            lv = '<span class="lvl l4">✦ تحدٍّ</span>' if is_ch else f'<span class="lvl {LEVELS[lvl][0]}">{LEVELS[lvl][1]}</span>'
            flow.append(f'<div class="ex ex-{typ}"><div class="exh"><span class="exn">{exn}</span><span class="ext">{rich(instr)}</span>{lv}</div>'
                        f'<div class="exb">{intro}{ex}</div></div>')
            cors.append(f'<div class="cor"><div class="corh"><span class="exn">{exn}</span>{rich(instr)}</div><div class="corb">{cor}</div></div>')
        elif kind == "tip":
            flow.append(f'<div class="tip"><div class="owlmini">{OWL}</div><div><b>{rest or "نصيحةُ فيدو"}</b><p>{rich(body.strip())}</p></div></div>')
    if cors:
        flow.append('<!--pagebreak-->' + part_title("correction", f' <span class="ptx">تمارين الدّرس : {L["title"]}</span>'))
        flow.extend(cors)
    return flow


def lesson_cover(L, idx):
    sec = SEC[L["section"]]
    goals = "".join(f"<li>{rich(g.strip())}</li>" for g in L.get("goals", "").split(";") if g.strip())
    parts = "".join(f'<span class="chip"><i>{ICONS[k]}</i>{t}</span>' for k, (t, _) in [(k, PART_TITLES[k]) for k in ("discover", "rule", "practice", "challenge", "correction")])
    return f'''<div class="cover-page lcover" style="--c:{sec[2]}" data-sec="{sec[0]}" id="L-{sec[0]}-{L["num"]}">
  <div class="deco d1"></div><div class="deco d2"></div>
  <div class="cv-in">
    <span class="cv-pill">{sec[1]} {L["num"]}</span>
    <h1>{L["title"]}</h1>
    <div class="cv-sub">{L.get("sub", "")}</div>
    <div class="cv-goals"><div class="cv-owl">{OWL}</div><div class="bubble"><b>في هذا الدّرس سأتعلّم :</b><ul>{goals}</ul></div></div>
    <div class="chips">{parts}</div>
  </div>
  <div class="cv-foot"><img src="assets/logo-white.png" alt=""><span>مركز فيد التّعليمي</span></div>
</div>'''


def section_cover(key, i, extra=""):
    s = SEC[key]
    return f'''<div class="cover-page scover" style="--c:{s[2]}" data-sec="{key}" id="S-{key}">
  <div class="deco d1"></div><div class="deco d2"></div>
  <div class="cv-in">
    <span class="cv-pill">القسم {ORDINAL[i]}</span>
    <h1 class="huge">{s[1]}</h1>
    <div class="cv-sub">{s[4]}</div>
    <div class="cv-art">{SECTION_ART[key]}</div>
    {extra}
  </div>
  <div class="cv-foot"><img src="assets/logo-white.png" alt=""><span>مركز فيد التّعليمي</span></div>
</div>'''


def book_cover():
    pills = "".join(f'<span class="secpill" style="--c:{s[2]}">{s[1]}</span>' for s in SECTIONS)
    return f'''<div class="cover-page bcover" style="--c:#5a2ca0" data-sec="front">
  <div class="deco d1"></div><div class="deco d2"></div>
  <div class="bc-logo"><img src="assets/logo-white.png" alt=""><span>مركز فيد التّعليمي</span></div>
  <div class="cv-in">
    <span class="cv-pill">المرجع في العربيّة</span>
    <h1 class="huge">النّحو والصّرف<br>والرّسم والبلاغة<br><span>والمطالعة</span></h1>
    <div class="cv-sub">دروسٌ مبسّطة · خرائطُ ذهنيّة · تمارينُ متدرّجة ومتنوّعة · الإصلاح<br>من المبتدئ إلى المتمكّن</div>
    <div class="pills">{pills}</div>
    <div class="bc-owl">{OWL}</div>
  </div>
</div>'''


def back_cover():
    return '''<div class="cover-page bcover back" style="--c:#5a2ca0" data-sec="back">
  <div class="deco d1"></div><div class="deco d2"></div>
  <div class="cv-in">
    <span class="cv-pill">المرجع في العربيّة</span>
    <p class="cv-sub" style="font-size:15pt;max-width:140mm">كتابٌ يرافقُ المتعلّمَ خطوةً بخطوة : من الكلمة إلى الجملة، ومن القاعدة إلى التّمرين، ومن النّصّ إلى تذوّقه.</p>
    <img class="back-logo" src="assets/logo-white.png" alt="">
    <div class="cv-sub" style="margin-top:4mm"><b>مركز فيد التّعليمي</b><br>feed.tn</div>
  </div>
</div>'''


def how_to_page():
    legend = [("discover", "أكتشفُ", "أمثلةٌ ألاحظُها لأفهمَ وحدي"), ("rule", "أفهمُ القاعدة", "الدّرسُ في خرائطَ وجداولَ واضحة"),
              ("practice", "أتدرّبُ", "تمارينُ متنوّعةٌ من السّهل إلى الصّعب"), ("challenge", "أتحدّى نفسي", "تمرينٌ أصعبُ أو إنتاجٌ كتابيّ"),
              ("correction", "الإصلاح", "أتثبّتُ من إجاباتي وأفهمُ أخطائي"), ("remember", "أتذكّرُ", "خلاصةٌ أحفظُها")]
    lg = "".join(f'<div class="lg"><span class="pti">{ICONS[k]}</span><div><b>{t}</b><small>{d}</small></div></div>' for k, t, d in legend)
    types = ["أربطُ بسهم", "أرتّبُ الكلمات", "أُصنّفُ في الخانات", "صوابٌ أم خطأ", "أختارُ الإجابة", "أملأُ الفراغ", "أُصلحُ الخطأ", "أبحثُ عن الكلمات", "أرتّبُ الحروف", "أُكملُ الجدول", "أُنتجُ"]
    secs = "".join(f'<div class="sc" style="--c:{s[2]};--cl:{s[3]}"><b>القسم {ORDINAL[i]}</b><span>{s[1]}</span></div>' for i, s in enumerate(SECTIONS))
    return f'''<div class="intro-wrap">
<h1 class="pagetitle">كيف تستخدمُ كتابَك؟</h1>
<div class="hello"><div class="owlbig">{OWL}</div><div><b class="big">مرحبًا، أنا «فيدو»!</b><p>سأرافقُكَ في صفحات هذا الكتاب : أُذكّرُك بفائدة، وأتحدّاك بسؤال، وأهمسُ لكَ بنصيحةٍ تُعينُك على الفهم. تعرّفْ أوّلًا على أجزاء كلّ درس.</p></div></div>
<h2 class="bar">أجزاءُ كلّ درس</h2>
<div class="legend">{lg}</div>
<h2 class="bar">مستوياتُ التّمارين</h2>
<div class="levels"><span class="lvl l1">★ سهل</span><span class="lvl l2">★★ متوسّط</span><span class="lvl l3">★★★ صعب</span><span class="lvl l4">✦ تحدٍّ</span></div>
<p class="center small">تتنوّعُ التّمارين حتّى لا تملَّ : {" · ".join(types)}.</p>
<h2 class="bar">أقسامُ الكتاب بألوانها</h2>
<div class="secs">{secs}</div>
</div>'''


def toc_html(lessons):
    out = ['<h1 class="pagetitle">الفهرس</h1>']
    for i, s in enumerate(SECTIONS):
        out.append("<!--split-->")
        out.append(f'<div class="toc-sec" style="--c:{s[2]};--cl:{s[3]}"><div class="toc-h"><span class="pti">{ICONS["book"]}</span>القسم {ORDINAL[i]} : {s[1]}<span class="pg" data-ref="S-{s[0]}"></span></div><div class="toc-g">')
        if s[0] == "mutalaa":
            for n, (t, src, p) in enumerate(READING_TEXTS, 1):
                out.append(f'<div class="toc-i"><span class="n">{n}</span><div><b>{t}</b><small>{src}</small></div><span class="pg" data-marja="{p}"></span></div>')
        else:
            for L in [l for l in lessons if l["section"] == s[0]]:
                out.append(f'<div class="toc-i"><span class="n">{L["num"]}</span><div><b>{L["title"]}</b><small>{L.get("sub", "")}</small></div><span class="pg" data-ref="L-{s[0]}-{L["num"]}"></span></div>')
        out.append("</div></div>")
    return [b for b in "".join(out).split("<!--split-->") if b.strip()]


def build_html(lessons):
    chapters = []  # (data-sec, tab, running, html blocks) or cover
    chapters.append(("cover", book_cover()))
    chapters.append(("flow", {"sec": "front", "tab": "المرجع", "num": "", "run": "كيف تستخدمُ كتابَك؟", "blocks": [how_to_page()]}))
    chapters.append(("flow", {"sec": "front", "tab": "الفهرس", "num": "", "run": "الفهرس", "blocks": toc_html(lessons)}))
    for i, s in enumerate(SECTIONS):
        chapters.append(("cover", section_cover(s[0], i)))
        for L in [l for l in lessons if l["section"] == s[0]]:
            chapters.append(("cover", lesson_cover(L, i)))
            chapters.append(("flow", {"sec": s[0], "tab": s[1], "num": L["num"], "run": f'{s[1]} · {L["title"]}', "blocks": render_lesson(L)}))
    chapters.append(("cover", back_cover()))

    body = []
    for kind, c in chapters:
        if kind == "cover":
            body.append(c)
        else:
            blocks = "".join(f'<div class="blk">{b}</div>' for b in c["blocks"])
            body.append(f'<section class="chapter" data-sec="{c["sec"]}" data-tab="{E(c["tab"])}" data-num="{c["num"]}" data-run="{E(c["run"])}">{blocks}</section>')
    import base64
    uri = {k: "data:image/png;base64," + base64.b64encode(open(os.path.join(ROOT, "assets", f"{k}.png"), "rb").read()).decode() for k in ("deco1", "deco2")}
    mask_css = "".join(f'.deco.{d}{{-webkit-mask-image:url({uri[k]})!important;mask-image:url({uri[k]})!important}}' for d, k in (("d1", "deco1"), ("d2", "deco2")))
    sec_css = mask_css + "".join(f'[data-sec="{k}"]{{--c:{c};--cl:{cl}}}' for k, _, c, cl, _ in SECTIONS)
    return f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>المرجع في العربيّة</title>
<link rel="stylesheet" href="assets/fonts.css"><link rel="stylesheet" href="assets/book.css">
<style>{sec_css}</style></head><body>
<div id="src">{"".join(body)}</div><div id="book"></div>
<script>window.READING_START = {READING_PAGES[0]};</script>
<script src="assets/paginate.js"></script>
</body></html>'''


# ───────────────────────────── الطّباعة والدّمج ─────────────────────────────
def run_node(js):
    subprocess.run(["node", "-e", js], check=True)


def render_pdf(html_path, pdf_path):
    run_node(f"""
const {{chromium}} = require('playwright');
(async () => {{
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('console', m => console.log('[page]', m.text()));
  await p.goto('file://{html_path}', {{waitUntil: 'networkidle'}});
  await p.waitForFunction(() => window.__done === true, null, {{timeout: 600000}});
  const info = await p.evaluate(() => window.__info);
  require('fs').writeFileSync('{pdf_path}.json', JSON.stringify(info));
  await p.pdf({{path: '{pdf_path}', preferCSSPageSize: true, printBackground: true}});
  await b.close();
}})();""")
    return json.load(open(pdf_path + ".json"))


def number_overlay(numbers, out_pdf):
    """صفحات شفّافة فيها أرقامٌ جديدة تُطبَعُ فوق أرقام صفحات المطالعة الأصليّة."""
    pages = "".join(
        f'<div class="pg">{"<span>" + str(n) + "</span>" if n else ""}</div>' for n in numbers)
    doc = f'''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/fonts.css">
<style>@page{{size:594.96pt 841.92pt;margin:0}}body{{margin:0}}
.pg{{width:594.96pt;height:841.92pt;position:relative;page-break-after:always;overflow:hidden}}
.pg span{{position:absolute;left:272pt;width:51pt;top:796pt;height:20pt;background:#fff;text-align:center;
font:800 10.5pt/20pt Tajawal;color:#3b1680}}</style></head><body>{pages}</body></html>'''
    p = os.path.join(DIST, "_numbers.html")
    open(p, "w", encoding="utf-8").write(doc)
    run_node(f"""
const {{chromium}} = require('playwright');
(async () => {{ const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://{p}', {{waitUntil: 'networkidle'}}); await p.evaluate(() => document.fonts.ready);
  await p.pdf({{path: '{out_pdf}', preferCSSPageSize: true, printBackground: false, omitBackground: true}}); await b.close(); }})();""")
    os.remove(p)


def merge(main_pdf, info, out_pdf):
    from pypdf import PdfReader, PdfWriter
    import pdfplumber
    main = PdfReader(main_pdf)
    w = PdfWriter()
    n_main = len(main.pages)
    for i in range(n_main - 1):  # كلّ الصّفحات ما عدا الغلاف الخلفيّ
        w.add_page(main.pages[i])
    if os.path.exists(MARJA_PDF):
        a, b = READING_PAGES
        start = info["readingCover"] + 1  # رقم أوّل صفحة مطالعة في الكتاب الجديد
        marja = PdfReader(MARJA_PDF)
        has_num = []
        with pdfplumber.open(MARJA_PDF) as pl:
            for p in range(a, b + 1):
                pg = pl.pages[p - 1]
                has_num.append(any(c["text"].isdigit() and c["top"] > 795 and 285 < c["x0"] < 310 for c in pg.chars))
        nums = [start + k if has_num[k] else 0 for k in range(b - a + 1)]
        ov_path = os.path.join(DIST, "_numbers.pdf")
        number_overlay(nums, ov_path)
        ov = PdfReader(ov_path)
        for k, p in enumerate(range(a, b + 1)):
            page = marja.pages[p - 1]
            if nums[k]:
                page.merge_page(ov.pages[k])
            w.add_page(page)
        os.remove(ov_path)
    else:
        print("!! لم يُعثَر على كتاب المرجع الأصليّ :", MARJA_PDF, "— قسم المطالعة سيكون فارغًا")
    w.add_page(main.pages[n_main - 1])
    w.compress_identical_objects()
    with open(out_pdf, "wb") as f:
        w.write(f)


def main():
    os.makedirs(DIST, exist_ok=True)
    lessons = [parse_lesson(p) for p in sorted(glob.glob(os.path.join(ROOT, "lessons", "*.txt")))]
    order = {s[0]: i for i, s in enumerate(SECTIONS)}
    lessons.sort(key=lambda L: (order[L["section"]], int(L["num"])))
    html_path = os.path.join(ROOT, "al-marja.html")
    open(html_path, "w", encoding="utf-8").write(build_html(lessons))
    print("lessons:", len(lessons))
    if "--html" in sys.argv:
        return
    tmp = os.path.join(DIST, "_main.pdf")
    info = render_pdf(html_path, tmp)
    print("pages (main):", info["pages"], "reading cover:", info["readingCover"], "overflows:", info["overflow"])
    out = os.path.join(DIST, "al-marja.pdf")
    merge(tmp, info, out)
    os.remove(tmp)
    os.remove(tmp + ".json")
    print("written", out)


if __name__ == "__main__":
    main()
