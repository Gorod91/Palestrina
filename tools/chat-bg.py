# Genera public/chat-bg.svg: tassello ripetibile di disegnini a tema palestra (stile sfondo WhatsApp).
import random, math
random.seed(7)
T = 400  # lato del tassello
D = {
 'manubrio': '<rect x="-15" y="-2.5" width="30" height="5" rx="2.5"/><rect x="-22" y="-10" width="7" height="20" rx="2.5"/><rect x="15" y="-10" width="7" height="20" rx="2.5"/><rect x="-27" y="-6" width="5" height="12" rx="2"/><rect x="22" y="-6" width="5" height="12" rx="2"/>',
 'bilanciere': '<path d="M-44 0 H44"/><rect x="-36" y="-14" width="6" height="28" rx="2"/><rect x="-29" y="-10" width="5" height="20" rx="2"/><rect x="30" y="-14" width="6" height="28" rx="2"/><rect x="24" y="-10" width="5" height="20" rx="2"/><path d="M-46 -4 V4 M46 -4 V4"/>',
 'kettlebell': '<path d="M-9 -6 C-10 -20 10 -20 9 -6"/><path d="M-14 0 C-18 10 -12 18 0 18 C12 18 18 10 14 0 C11 -6 -11 -6 -14 0 Z"/><path d="M-5 6 H5"/>',
 'bicipite': '<g transform="scale(.62) translate(-28 -31)"><path d="M4 57 H40 C45 57 48 54 47 50 L44.5 28 C50.5 26 54 21 53.5 15 C53 8 47 4 40 4.5 C33 5 28.5 9.5 28.5 15.5 C28.5 21.5 31.5 25.5 35.5 27.5 L36 38 C30 27 13 28 10 44 C7 44 5 44 4 46 Z" stroke-width="3.2"/><path d="M29.5 11 H35.5 M29.5 16 H35.5 M30.5 21 H36 M34.5 25.5 C38.5 23 43.5 22.5 48.5 23.5 M18 40 C21 38 25 38 28 40" stroke-width="3.2"/></g>',
 'cronometro': '<circle cx="0" cy="3" r="13"/><path d="M0 3 V-5 M0 3 L5 6 M-3 -14 H3 M0 -14 V-10 M10 -9 L13 -12"/>',
 'borraccia': '<rect x="-7" y="-10" width="14" height="26" rx="4"/><path d="M-4 -10 V-15 H4 V-10 M-7 -1 H7 M-7 7 H7"/>',
 'disco': '<circle r="15"/><circle r="9"/><circle r="2.5"/><path d="M-4 -12 H4"/>',
 'scarpa': '<path d="M-20 6 C-20 -4 -14 -6 -10 -6 L-4 -2 C2 2 10 2 16 4 C21 5 22 9 20 11 H-20 Z"/><path d="M-20 11 V8 M-8 -3 L-6 -6 M-4 -1 L-2 -4 M0 1 L2 -2"/>',
 'battito': '<path d="M-26 0 H-12 L-8 -10 L-2 12 L3 -16 L8 6 L11 0 H26"/>',
 'corda': '<rect x="-24" y="-16" width="6" height="12" rx="3"/><rect x="18" y="-16" width="6" height="12" rx="3"/><path d="M-21 -4 C-22 22 22 22 21 -4"/>',
 'medaglia': '<path d="M-8 -18 L-3 -4 M8 -18 L3 -4 M-8 -18 H-2 L0 -12 L2 -18 H8"/><circle cx="0" cy="6" r="10"/><path d="M0 1 L1.6 4.6 L5.5 5 L2.6 7.6 L3.4 11.4 L0 9.4 L-3.4 11.4 L-2.6 7.6 L-5.5 5 L-1.6 4.6 Z"/>',
 'shaker': '<path d="M-9 -8 H9 L7 18 H-7 Z"/><path d="M-10 -8 H10 V-12 H-10 Z M-4 -12 V-16 H4 V-12 M-8 2 H8"/>',
 'cuore': '<path d="M0 12 C-16 2 -14 -12 -6 -12 C-2 -12 0 -9 0 -7 C0 -9 2 -12 6 -12 C14 -12 16 2 0 12 Z"/>',
 'fulmine': '<path d="M3 -16 L-8 2 H0 L-3 16 L9 -3 H1 Z"/>',
 'mela': '<path d="M0 -6 C-6 -10 -15 -8 -15 2 C-15 12 -7 18 0 15 C7 18 15 12 15 2 C15 -8 6 -10 0 -6 Z"/><path d="M0 -6 C0 -11 2 -14 5 -15"/>',
 'asciugamano': '<rect x="-14" y="-12" width="28" height="24" rx="3"/><path d="M-14 -4 H14 M-14 4 H14 M-8 12 V15 M0 12 V15 M8 12 V15"/>',
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
cols, rows = 5, 6
cw, rh = T / cols, T / rows
# ogni disegno almeno una volta, poi si riempie la griglia
order = names + random.sample(names, cols * rows - len(names))
random.shuffle(order)
k = 0
for r in range(rows):
    for c in range(cols):
        x = c * cw + cw / 2 + (cw / 2 if r % 2 else 0) + random.uniform(-5, 5)
        y = r * rh + rh / 2 + random.uniform(-4, 4)
        items.append((order[k], x % T, y, random.uniform(-30, 30), random.uniform(.85, 1.05)))
        k += 1

def dist(ax, ay, bx, by):
    # distanza sul tassello che si ripete (anche oltre i bordi)
    dx = min(abs(ax - bx), T - abs(ax - bx)); dy = min(abs(ay - by), T - abs(ay - by))
    return math.hypot(dx, dy)

# riempitivi solo negli spazi liberi
fills = []
tries = 0
while len(fills) < 70 and tries < 20000:
    tries += 1
    x, y = random.uniform(0, T), random.uniform(0, T)
    if any(dist(x, y, ix, iy) < 27 for _, ix, iy, _, _ in items):
        continue
    if any(dist(x, y, fx, fy) < 14 for _, fx, fy in fills):
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
