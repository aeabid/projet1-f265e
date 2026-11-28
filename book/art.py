"""رسومات SVG للكتاب : البومة «فيدو» وأيقونات الأقسام والأجزاء."""

OWL = """<svg viewBox="0 0 200 222" xmlns="http://www.w3.org/2000/svg" class="owl">
<ellipse cx="100" cy="210" rx="62" ry="8" fill="#d9dce8"/>
<path d="M58 50 L42 26" stroke="#3d1a8a" stroke-width="15" stroke-linecap="round"/>
<path d="M142 50 L158 26" stroke="#3d1a8a" stroke-width="15" stroke-linecap="round"/>
<ellipse cx="100" cy="122" rx="74" ry="88" fill="#7a4bb8"/>
<ellipse cx="100" cy="146" rx="50" ry="56" fill="#efe7fa"/>
<circle cx="72" cy="86" r="27" fill="#fff"/><circle cx="128" cy="86" r="27" fill="#fff"/>
<circle cx="75" cy="90" r="12.5" fill="#2b2340"/><circle cx="125" cy="90" r="12.5" fill="#2b2340"/>
<circle cx="80" cy="84" r="4.5" fill="#fff"/><circle cx="130" cy="84" r="4.5" fill="#fff"/>
<path d="M100 106 L111 118 L100 131 L89 118 Z" fill="#f9b233"/>
<path d="M76 146 q9 7 18 0 M106 146 q9 7 18 0 M91 160 q9 7 18 0" stroke="#c7b0ea" stroke-width="4" fill="none" stroke-linecap="round"/>
<path d="M100 10 L148 30 L100 50 L52 30 Z" fill="#2b2340"/>
<path d="M138 33 L138 58" stroke="#f9b233" stroke-width="4" stroke-linecap="round"/><circle cx="138" cy="61" r="5.5" fill="#f9b233"/>
<path d="M38 168 Q70 152 98 165 L98 204 Q70 192 38 206 Z" fill="#e6197a"/>
<path d="M102 165 Q130 152 162 168 L162 206 Q130 192 102 204 Z" fill="#f9b233"/>
<ellipse cx="40" cy="186" rx="13" ry="17" fill="#3d1a8a"/><ellipse cx="160" cy="186" rx="13" ry="17" fill="#3d1a8a"/>
</svg>"""

# أيقونات صغيرة لأجزاء الدّرس (24×24)
ICONS = {
    "discover": '<svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M14.5 14.5 L20 20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    "rule": '<svg viewBox="0 0 24 24"><path d="M12 3a6.5 6.5 0 0 0-4 11.6V17h8v-2.4A6.5 6.5 0 0 0 12 3z" fill="currentColor"/><rect x="8.5" y="18.5" width="7" height="2.5" rx="1.2" fill="currentColor"/></svg>',
    "practice": '<svg viewBox="0 0 24 24"><path d="M4 20l1-5L15.5 4.5a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L9 19z" fill="currentColor"/></svg>',
    "challenge": '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.5l1.3-6.6L2.5 9.3l6.6-.8z" fill="currentColor"/></svg>',
    "correction": '<svg viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    "remember": '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z" fill="currentColor"/></svg>',
    "book": '<svg viewBox="0 0 24 24"><path d="M2 5c3-1.5 6.5-1.5 9.5.5V20c-3-2-6.5-2-9.5-.5zM22 5c-3-1.5-6.5-1.5-9.5.5V20c3-2 6.5-2 9.5-.5z" fill="currentColor"/></svg>',
}

# رسومات الأغلفة الكبيرة لكلّ قسم
SECTION_ART = {
    "nahw": """<svg viewBox="0 0 320 240" class="art">
<ellipse cx="160" cy="222" rx="130" ry="10" fill="rgba(0,0,0,.12)"/>
<g font-family="Tajawal" font-weight="900" text-anchor="middle">
<rect x="40" y="130" width="110" height="86" rx="16" fill="#f9b233"/><rect x="40" y="130" width="110" height="20" rx="10" fill="#ffd36b"/><text x="95" y="196" font-size="38" fill="#5a2ca0">اسم</text>
<rect x="170" y="130" width="110" height="86" rx="16" fill="#e6197a"/><rect x="170" y="130" width="110" height="20" rx="10" fill="#ff5aa6"/><text x="225" y="196" font-size="38" fill="#fff">فعل</text>
<rect x="105" y="36" width="110" height="86" rx="16" fill="#fff"/><rect x="105" y="36" width="110" height="20" rx="10" fill="#efe7fa"/><text x="160" y="102" font-size="38" fill="#1f6fd1">حرف</text>
</g>
<path d="M290 40 l6 14 14 6-14 6-6 14-6-14-14-6 14-6z M30 60 l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#ffd36b"/>
</svg>""",
    "sarf": """<svg viewBox="0 0 320 240" class="art">
<ellipse cx="160" cy="224" rx="120" ry="9" fill="rgba(0,0,0,.12)"/>
<path d="M150 210 C150 170 152 140 160 110 C168 140 170 170 170 210 Z" fill="#8a5a2b"/>
<path d="M160 205 C130 215 110 222 92 222 M160 205 C190 215 210 222 228 222" stroke="#8a5a2b" stroke-width="8" fill="none" stroke-linecap="round"/>
<circle cx="160" cy="80" r="62" fill="#3fcf8e"/><circle cx="110" cy="105" r="42" fill="#2fb37a"/><circle cx="210" cy="105" r="42" fill="#2fb37a"/>
<g font-family="Tajawal" font-weight="900" text-anchor="middle" font-size="34">
<circle cx="160" cy="62" r="24" fill="#fff"/><text x="160" y="74" fill="#0e7a4f">ع</text>
<circle cx="108" cy="104" r="24" fill="#fff"/><text x="108" y="116" fill="#0e7a4f">ل</text>
<circle cx="212" cy="104" r="24" fill="#fff"/><text x="212" y="116" fill="#0e7a4f">ف</text>
</g>
<path d="M285 40 l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="#ffd36b"/>
</svg>""",
    "rasm": """<svg viewBox="0 0 320 240" class="art">
<ellipse cx="160" cy="224" rx="125" ry="9" fill="rgba(0,0,0,.12)"/>
<rect x="50" y="40" width="200" height="176" rx="14" fill="#fff"/>
<path d="M70 90 H230 M70 130 H230 M70 170 H230" stroke="#cfd8ea" stroke-width="3"/>
<text x="150" y="160" font-family="Tajawal" font-weight="900" font-size="96" fill="#f08a1a" text-anchor="middle">ء</text>
<g transform="rotate(35 250 120)"><rect x="236" y="20" width="28" height="150" rx="6" fill="#ffd36b"/><rect x="236" y="20" width="28" height="22" rx="6" fill="#e6197a"/><path d="M236 170 L264 170 L250 200 Z" fill="#f5d2a8"/><path d="M245 189 L255 189 L250 200 Z" fill="#2b2340"/></g>
<path d="M40 30 l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#ffd36b"/>
</svg>""",
    "balagha": """<svg viewBox="0 0 320 240" class="art">
<path d="M220 20 C150 40 105 105 95 200 C130 150 170 120 215 108 C190 104 172 100 160 92 C195 88 222 74 238 52 C215 56 198 54 186 48 C206 40 216 32 220 20 Z" fill="#fff"/>
<path d="M220 22 C170 70 130 130 95 200" stroke="#f9b233" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M92 196 L80 222" stroke="#2b2340" stroke-width="5" stroke-linecap="round"/>
<path d="M60 70 l6 14 14 6-14 6-6 14-6-14-14-6 14-6z M262 150 l5 11 11 5-11 5-5 11-5-11-11-5 11-5z" fill="#ffd36b"/>
<circle cx="250" cy="200" r="5" fill="#fff"/><circle cx="48" cy="160" r="4" fill="#fff"/>
</svg>""",
    "mutalaa": """<svg viewBox="0 0 320 240" class="art">
<ellipse cx="160" cy="222" rx="130" ry="9" fill="rgba(0,0,0,.14)"/>
<path d="M30 70 Q95 40 158 64 L158 212 Q95 188 30 214 Z" fill="#fff"/>
<path d="M290 70 Q225 40 162 64 L162 212 Q225 188 290 214 Z" fill="#f4efff"/>
<path d="M50 92 Q95 74 140 88 M50 116 Q95 98 140 112 M50 140 Q95 122 140 136 M50 164 Q95 146 140 160 M180 88 Q225 74 270 92 M180 112 Q225 98 270 116 M180 136 Q225 122 270 140 M180 160 Q225 146 270 164" stroke="#2b2340" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M265 20 l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" fill="#ffd36b"/>
</svg>""",
}

# أيقونات صغيرة للخرائط الذّهنيّة (خطّ بسيط، 24×24)
_S = 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
MAPICONS = {
    "person": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="7" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/></svg>',
    "cat": f'<svg viewBox="0 0 24 24" {_S}><path d="M5 20v-9l-1-6 4 3h8l4-3-1 6v9z"/><path d="M9 13h.01M15 13h.01M10 16h4"/></svg>',
    "leaf": f'<svg viewBox="0 0 24 24" {_S}><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19l8-8"/></svg>',
    "box": f'<svg viewBox="0 0 24 24" {_S}><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>',
    "home": f'<svg viewBox="0 0 24 24" {_S}><path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-5h4v5"/></svg>',
    "clock": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    "bolt": f'<svg viewBox="0 0 24 24" {_S}><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    "link": f'<svg viewBox="0 0 24 24" {_S}><path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1"/><path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/></svg>',
    "question": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>',
    "eye": f'<svg viewBox="0 0 24 24" {_S}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    "star": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 3l2.7 5.6 6.1.8-4.4 4.2 1.1 6.1L12 16.8 6.5 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>',
    "pen": f'<svg viewBox="0 0 24 24" {_S}><path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M14 6l4 4"/></svg>',
    "book": f'<svg viewBox="0 0 24 24" {_S}><path d="M3 5c3-1 6-1 9 1v14c-3-2-6-2-9-1zM21 5c-3-1-6-1-9 1v14c3-2 6-2 9-1z"/></svg>',
    "pointer": f'<svg viewBox="0 0 24 24" {_S}><path d="M4 12h12M12 6l6 6-6 6"/></svg>',
    "plus": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 5v14M5 12h14"/></svg>',
    "check": f'<svg viewBox="0 0 24 24" {_S}><path d="M4 12l5 5L20 6"/></svg>',
    "cross": f'<svg viewBox="0 0 24 24" {_S}><path d="M6 6l12 12M18 6L6 18"/></svg>',
    "music": f'<svg viewBox="0 0 24 24" {_S}><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
    "mirror": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 3v18"/><path d="M9 7L4 12l5 5M15 7l5 5-5 5"/></svg>',
    "heart": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/></svg>',
    "sun": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>',
    "moon": f'<svg viewBox="0 0 24 24" {_S}><path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z"/></svg>',
    "tree": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="9" r="6"/><path d="M12 15v6M9 21h6"/></svg>',
    "hand": f'<svg viewBox="0 0 24 24" {_S}><path d="M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-3 7-6 7s-5-2-6-4l-2-4a1.5 1.5 0 0 1 2.5-1.5L8 13"/></svg>',
    "group": f'<svg viewBox="0 0 24 24" {_S}><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2 20c.5-4 3-6 6-6s5.5 2 6 6M14 14c3 0 6 2 7 6"/></svg>',
    "two": f'<svg viewBox="0 0 24 24" {_S}><circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4"/></svg>',
    "one": f'<svg viewBox="0 0 24 24" {_S}><circle cx="12" cy="12" r="5"/></svg>',
    "up": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 20V5M6 11l6-6 6 6"/></svg>',
    "down": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 4v15M6 13l6 6 6-6"/></svg>',
    "flat": f'<svg viewBox="0 0 24 24" {_S}><path d="M4 12h16"/><path d="M8 8l-4 4 4 4"/></svg>',
    "root": f'<svg viewBox="0 0 24 24" {_S}><path d="M12 3v9M12 12c-3 2-5 5-6 9M12 12c3 2 5 5 6 9M12 12v9"/></svg>',
    "feather": f'<svg viewBox="0 0 24 24" {_S}><path d="M20 4C12 4 6 10 5 19l7-7M20 4c0 8-6 13-13 13"/></svg>',
    "chain": f'<svg viewBox="0 0 24 24" {_S}><rect x="2" y="9" width="9" height="6" rx="3"/><rect x="13" y="9" width="9" height="6" rx="3"/><path d="M9 12h6"/></svg>',
    "flag": f'<svg viewBox="0 0 24 24" {_S}><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    "tag": f'<svg viewBox="0 0 24 24" {_S}><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/></svg>',
}
