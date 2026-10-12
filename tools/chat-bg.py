# Genera public/chat-bg.svg: tassello ripetibile di disegnini a tema palestra (stile sfondo WhatsApp).
import random, math
random.seed(7)
T = 400  # lato del tassello
D = {
 'manubrio': '<rect x="-15" y="-2.5" width="30" height="5" rx="2.5"/><rect x="-22" y="-10" width="7" height="20" rx="2.5"/><rect x="15" y="-10" width="7" height="20" rx="2.5"/><rect x="-27" y="-6" width="5" height="12" rx="2"/><rect x="22" y="-6" width="5" height="12" rx="2"/>',
 'bilanciere': '<path d="M-44 0 H44"/><rect x="-36" y="-14" width="6" height="28" rx="2"/><rect x="-29" y="-10" width="5" height="20" rx="2"/><rect x="30" y="-14" width="6" height="28" rx="2"/><rect x="24" y="-10" width="5" height="20" rx="2"/><path d="M-46 -4 V4 M46 -4 V4"/>',
 'kettlebell': '<path d="M-7.2 17 H7.2 A14 14 0 0 0 10 -4.8 C10.5 -12 7 -18 0 -18 C-7 -18 -10.5 -12 -10 -4.8 A14 14 0 0 0 -7.2 17 Z"/><path d="M-5.5 -6.2 C-6 -11 -3.5 -13.5 0 -13.5 C3.5 -13.5 6 -11 5.5 -6.2 Q0 -7.6 -5.5 -6.2 Z"/>',
 'bicipite': '<g transform="scale(.55) translate(-36 -27)" fill="#0b0b0c" stroke-width="3.6"><path d="M0 47 C4 47 9 26 21 26 C32 26 36 37 41 47 L46 56 V61 L0 61"/><g transform="rotate(4 46 52) translate(5 0)"><path d="M32 52 L35 27 L47 27 L50 52 A9 9 0 0 1 32 52"/><path d="M20 17H62"/><rect x="16" y="8" width="7" height="18" rx="2.5"/><rect x="59" y="8" width="7" height="18" rx="2.5"/><rect x="31" y="8" width="20" height="20" rx="7"/><path d="M38.5 13V23M43.5 13V23" stroke-width="2.6"/></g></g>',
 'cronometro': '<circle cx="0" cy="3" r="13"/><path d="M0 3 V-5 M0 3 L5 6 M-3 -14 H3 M0 -14 V-10 M10 -9 L13 -12"/>',
 'battito': '<path d="M-26 0 H-12 L-8 -10 L-2 12 L3 -16 L8 6 L11 0 H26"/>',
 'cuore': '<path d="M0 12 C-16 2 -14 -12 -6 -12 C-2 -12 0 -9 0 -7 C0 -9 2 -12 6 -12 C14 -12 16 2 0 12 Z"/>',
 'fulmine': '<path d="M3 -16 L-8 2 H0 L-3 16 L9 -3 H1 Z"/>',
 'mela': '<path d="M0 -6 C-6 -10 -15 -8 -15 2 C-15 12 -7 18 0 15 C7 18 15 12 15 2 C15 -8 6 -10 0 -6 Z"/><path d="M0 -6 C0 -11 2 -14 5 -15"/>',
 'trofeo': '<path d="M-9 -14 H9 V-4 C9 4 -9 4 -9 -4 Z"/><path d="M-9 -11 C-16 -11 -15 -2 -8 -1 M9 -11 C16 -11 15 -2 8 -1 M0 3 V9 M-7 13 H7 L5 9 H-5 Z"/>',
 'panca': '<path d="M-24 0 H18 M-18 0 V12 M12 0 V12 M18 0 L24 -10 M-26 12 H-10 M4 12 H20"/>',
}
filler = {
 'pallino': '<circle r="3"/>',
 'pallino2': '<circle r="2"/>',
 'croce': '<path d="M-4 0 H4 M0 -4 V4"/>',
 'stella': '<path d="M0 -6 C1 -1 1 -1 6 0 C1 1 1 1 0 6 C-1 1 -1 1 -6 0 C-1 -1 -1 -1 0 -6 Z"/>',
 'anello': '<circle r="4.5"/>',
}
names = list(D)
items = []
cols, rows = 5, 5
cw, rh = T / cols, T / rows
# ogni disegno almeno una volta, poi si riempie la griglia
# due volte ciascuno, più qualche disegno "unico" per riempire la griglia
order = names * 2 + ['kettlebell', 'kettlebell', 'trofeo']
pos = []
for r in range(rows):
    for c in range(cols):
        x = c * cw + cw / 2 + (cw / 2 if r % 2 else 0) + random.uniform(-5, 5)
        y = r * rh + rh / 2 + random.uniform(-4, 4)
        pos.append((x % T, y))

def tdist(a, b):
    dx = min(abs(a[0] - b[0]), T - abs(a[0] - b[0])); dy = min(abs(a[1] - b[1]), T - abs(a[1] - b[1]))
    return math.hypot(dx, dy)

# oggetti che si somigliano contano come uguali: non devono stare vicini (anche tra tasselli ripetuti)
GRUPPI = [{'manubrio', 'bilanciere'}, {'battito', 'cuore'}]
def simili(a, b):
    return a == b or any(a in g and b in g for g in GRUPPI)

def costo(o):
    # penalità che cresce quando due oggetti simili sono vicini
    tot = 0
    for i in range(len(o)):
        for j in range(i + 1, len(o)):
            if simili(o[i], o[j]):
                d = tdist(pos[i], pos[j])
                if d < 220:
                    tot += (220 - d) ** 2 * (4 if o[i] == o[j] else 3)
    return tot

# ricerca a scambi ripartendo più volte da un ordine casuale, si tiene il migliore
migliore, best = None, float('inf')
for _ in range(8):
    o = order[:]
    random.shuffle(o)
    c0 = costo(o)
    for _ in range(5000):
        i, j = random.sample(range(len(o)), 2)
        o[i], o[j] = o[j], o[i]
        c = costo(o)
        if c <= c0:
            c0 = c
        else:
            o[i], o[j] = o[j], o[i]
    if c0 < best:
        migliore, best = o, c0
order = migliore

items = [(n, x, y, random.uniform(-30, 30), random.uniform(.85, 1.05)) for n, (x, y) in zip(order, pos)]

def dist(ax, ay, bx, by):
    # distanza sul tassello che si ripete (anche oltre i bordi)
    dx = min(abs(ax - bx), T - abs(ax - bx)); dy = min(abs(ay - by), T - abs(ay - by))
    return math.hypot(dx, dy)

# riempitivi solo negli spazi liberi
fills = []
tries = 0
while len(fills) < 32 and tries < 20000:
    tries += 1
    x, y = random.uniform(0, T), random.uniform(0, T)
    if any(dist(x, y, ix, iy) < 27 for _, ix, iy, _, _ in items):
        continue
    if any(dist(x, y, fx, fy) < 22 for _, fx, fy in fills):
        continue
    fills.append((random.choice(list(filler)), x, y))

def place(shape, x, y, rot=0, s=1):
    # ripete il disegno ai bordi del tassello così il motivo si unisce senza tagli
    out = []
    for dx in (-T, 0, T):
        for dy in (-T, 0, T):
            px, py = x + dx, y + dy
            if -40 < px < T + 40 and -40 < py < T + 40:
                out.append(f'<g transform="translate({px:.1f} {py:.1f}) rotate({rot:.0f}) scale({s:.2f})">{shape}</g>')
    return out

body = []
for n, x, y, rot, s in items:
    body += place(D[n], x, y, rot, s)
for n, x, y in fills:
    body += place(filler[n], x, y)
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{T}" height="{T}" viewBox="0 0 {T} {T}">
<g fill="none" stroke="#fff" stroke-opacity=".085" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
{chr(10).join(body)}
</g>
</svg>
'''
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'public', 'chat-bg.svg'), 'w').write(svg)
print(len(svg), 'byte')
