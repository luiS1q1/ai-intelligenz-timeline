#!/usr/bin/env python3
"""Aktualisiert data.js mit den aktuellen Artificial Analysis Intelligence-Index-Werten.
Aufruf:  python3 refresh_data.py
Lädt die AA-Seiten frisch, parst alle Modelle + Scores, matcht sie auf die Einträge
in data.js und schreibt data.js neu. Modelle, die AA auf dem aktuellen Index nicht
mehr führt, werden über eine isotone (monotone) Kalibrierungskurve aus den exakt
getroffenen Modellen auf die neue Skala umgerechnet (Markierung ≈, src=fo)."""
import re, json, bisect, datetime, urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0 Safari/537.36"}
BASE = "https://artificialanalysis.ai"
DETAIL = "/models/gpt-4o"  # jede Detailseite liefert die volle Modell-Tabelle mit Scores

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode("utf-8", "replace")

def parse(html):
    s = html.replace("\\", "")
    rec_re = re.compile(r'\{"slug":"([a-z0-9\-]+)","name":"([^"]+)","deprecated":(true|false),"releaseDate":"([^"]*)","creator":\{"slug":"([a-z0-9\-]+)"')
    recs = {m.group(1): (m.group(2), m.group(3) == "true", m.group(4), m.group(5)) for m in rec_re.finditer(s)}
    scores = {}
    i = -1
    while (i := s.find('"intelligenceIndex":', i + 1)) > -1:
        j = s.rfind('"slug":"', 0, i)
        if j > -1 and i - j < 600:
            slug = s[j+8:s.find('"', j+8)]
            mm = re.search(r'"intelligenceIndex":([\d.\-]+),"intelligenceIndexIsEstimated":(true|false)', s[i-1:i+90])
            if mm and slug not in scores:
                scores[slug] = {"score": float(mm.group(1)), "est": mm.group(2) == "true"}
    return recs, scores

def slugify(n):
    n = re.sub(r'\(.*?\)', '', n).strip()
    n = n.lower().replace('.', '-').replace('–', '-').replace(' ', '-')
    return re.sub(r'-+', '-', n)

def ts(d):
    return datetime.date.fromisoformat(d).toordinal() if d else 0

def pava(pairs):
    xs = [x for x, _ in pairs]; ys = [y for _, y in pairs]
    blocks = [[y, 1] for y in ys]; i = 0
    while i < len(blocks) - 1:
        if blocks[i][0] > blocks[i+1][0]:
            blocks[i][0] = (blocks[i][0]*blocks[i][1] + blocks[i+1][0]*blocks[i+1][1]) / (blocks[i][1] + blocks[i+1][1])
            blocks[i][1] += blocks[i+1][1]; del blocks[i+1]
            if i > 0: i -= 1
        else: i += 1
    vals = []
    for y, n in blocks: vals += [y] * n
    return list(zip(xs, vals))

OVERRIDES = {
    "ChatGPT (GPT-3.5)": "gpt-3-5-turbo",
    "DeepSeek R1": "deepseek-r1-0120",
    "DeepSeek R1-0528": "deepseek-r1",
    "QwQ-32B-Preview": "qwq-32b",
    "Muse Spark 1.0": "muse-spark",
}

def main():
    recs, aa = parse(fetch(BASE + DETAIL))
    print("AA-Modelle geladen:", len(aa))
    src = open("data.js", encoding="utf-8").read()
    models = json.loads(re.search(r'const MODELS=(\[.*\]);?\s*$', src, re.S).group(1))
    matches = {}
    for m in models:
        sl = OVERRIDES.get(m["n"]) or slugify(m["n"])
        if sl in aa:
            matches[m["n"]] = (sl, aa[sl]["score"], aa[sl]["est"], m["s"]); continue
        cands = []
        for k in aa:
            if k.startswith(sl + "-") or sl.startswith(k):
                r = recs.get(k)
                if r and r[2]:
                    dd = abs(ts(r[2]) - ts(m["d"]))
                    if dd <= 180: cands.append((dd, -aa[k]["score"], k))
        if cands:
            _, _, k = min(cands)
            matches[m["n"]] = (k, aa[k]["score"], aa[k]["est"], m["s"])
    curve = pava(sorted((old, v) for _, (_, v, _, old) in matches.items()))
    cx = [x for x, _ in curve]; cy = [y for _, y in curve]
    def mapped(old):
        i = bisect.bisect_left(cx, old)
        if i == 0: return cy[0] * (old / cx[0]) if cx[0] else cy[0]
        if i >= len(cx): return cy[-1] + (old - cx[-1]) * (cy[-1] - cy[-2]) / max(cx[-1] - cx[-2], 1e-9)
        return cy[i-1] + (cy[i]-cy[i-1]) * (old-cx[i-1]) / max(cx[i]-cx[i-1], 1e-9)
    new, chg = [], 0
    for m in models:
        if m["n"] in matches:
            k, v, e, old = matches[m["n"]]
            m2 = dict(m); m2["s"] = round(v, 1); m2["est"] = bool(e); m2["src"] = "aa"
        else:
            old = m["s"]
            m2 = dict(m); m2["s"] = round(max(1, mapped(old)), 1); m2["est"] = True; m2["src"] = "fo"
        if abs(m2["s"] - old) >= 0.5: chg += 1
        print(f"  {m2['n']:30} {old:6} -> {m2['s']:6}  {'AA-gemessen' if (m2['src']=='aa' and not m2['est']) else ('AA-hochgerechnet' if m2['src']=='aa' else 'Fo-kalibriert')}")
    mx = max(m2["s"] for m2 in new)
    out = "const COMPANIES=" + re.search(r'const COMPANIES=(\[.*?\]);', src, re.S).group(1) + ";\nconst MODELS=" + json.dumps(new, ensure_ascii=False) + ";\n"
    open("data.js", "w", encoding="utf-8").write(out)
    print(f"\n{chg} Werte geändert, neuer Max-Score {mx} (MAXSCORE in app.js prüfen: {int(mx)+2})")

if __name__ == "__main__":
    main()
