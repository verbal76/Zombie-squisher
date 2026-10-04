"""Regenerates derived assets in assets/ from the authoritative Hot Attic Games logo.
Usage: python3 tools/make_assets.py   (requires Pillow)
The company logo is only cropped/resized, never redrawn."""
from PIL import Image, ImageDraw

BG = (13, 8, 5, 255)
src = Image.open('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png').convert('RGBA')
logo = src.crop(src.getbbox())
w = 1024
logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
logo.save('assets/brand/hag-logo.png', optimize=True)

# Fully transparent icon: the Android 12+ system splash shows only the background colour,
# and the branded logo is presented by the in-app splash (src/components/HagSplash.tsx).
Image.new('RGBA', (288, 288), (0, 0, 0, 0)).save('assets/brand/splash-blank.png')


# ---------------------------------------------------------------------------------------------------
# Game icon (procedural; no external art). Composition: a red car ploughing into a green zombie on a
# hazard-yellow badge. Drawn 4x supersampled. Layers are separate so Android can mask/animate them:
#   adaptive-icon-foreground.png  badge + car + zombie inside the 66% safe zone
#   adaptive-icon-monochrome.png  white silhouette for Android 13 themed icons
#   icon.png                      full-bleed legacy/store icon (dark background + the same artwork)
from PIL import ImageFilter
SS = 4
BG_RGB = (26, 18, 12)

def draw_art(size, mono=False, badge=True):
    """Returns an RGBA layer (size x size) with the artwork centred in the Android safe zone."""
    W = size * SS
    im = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = W / 2
    R = W * 0.33                                    # badge radius: safe zone is a 66% circle
    ink = (255, 255, 255, 255) if mono else None
    def col(rgb, a=255): return ink if mono else (*rgb, a)

    if badge and not mono:
        d.ellipse([c - R, c - R, c + R, c + R], fill=col((255, 196, 0)), outline=col((20, 14, 8)), width=int(W * 0.014))
        # hazard stripes clipped to the badge
        stripes = Image.new('RGBA', (W, W), (0, 0, 0, 0)); sd = ImageDraw.Draw(stripes)
        step = int(W * 0.075)
        for k in range(-W, W * 2, step * 2):
            sd.polygon([(k, W), (k + step, W), (k + step + W, 0), (k + W, 0)], fill=(20, 14, 8, 255))
        mask = Image.new('L', (W, W), 0); ImageDraw.Draw(mask).ellipse([c - R, c - R, c + R, c + R], fill=255)
        stripes.putalpha(Image.composite(stripes.getchannel('A'), Image.new('L', (W, W), 0), mask))
        im.alpha_composite(stripes)
        # dark inner disc so the artwork reads over the stripes
        r2 = R * 0.84
        d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=col((38, 28, 20)))

    u = R / 100.0 * 1.14                             # 1 unit ~ 1% of the badge radius; artwork fills the badge

    # --- zombie head (top-right), partially under the car
    zx, zy, zr = c + 24 * u, c - 24 * u, 34 * u
    d.ellipse([zx - zr, zy - zr, zx + zr, zy + zr], fill=col((124, 200, 70)), outline=col((30, 70, 25)), width=int(3.2 * u))
    for ex in (-12, 12):
        d.ellipse([zx + ex * u - 7 * u, zy - 9 * u - 7 * u, zx + ex * u + 7 * u, zy - 9 * u + 7 * u], fill=col((250, 250, 220)) if not mono else (0, 0, 0, 0))
        d.ellipse([zx + ex * u - 3.5 * u, zy - 9 * u - 3.5 * u, zx + ex * u + 3.5 * u, zy - 9 * u + 3.5 * u], fill=col((20, 20, 20)) if not mono else (0, 0, 0, 0))
    for sx in (-1, 1):                                                                                    # angry brows
        d.line([(zx + sx * 24 * u, zy - 22 * u), (zx + sx * 4 * u, zy - 15 * u)], fill=col((20, 40, 15)) if not mono else (0, 0, 0, 0), width=int(4.2 * u))
    d.rectangle([zx - 15 * u, zy + 9 * u, zx + 15 * u, zy + 20 * u], fill=col((40, 10, 10)) if not mono else (0, 0, 0, 0))
    for tx in (-10, -3, 4, 11):
        d.polygon([(zx + tx * u, zy + 9 * u), (zx + (tx + 5) * u, zy + 9 * u), (zx + (tx + 2.5) * u, zy + 15 * u)], fill=col((240, 240, 220)) if not mono else (0, 0, 0, 0))
    # grabbing hands
    for hx, hy in ((zx - 36 * u, zy + 24 * u), (zx + 40 * u, zy + 28 * u)):
        d.ellipse([hx - 9 * u, hy - 9 * u, hx + 9 * u, hy + 9 * u], fill=col((124, 200, 70)), outline=col((30, 70, 25)), width=int(2.4 * u))

    # --- blood splat under the car
    if not mono:
        for (bx, by, br) in ((-8, 30, 14), (6, 38, 10), (-26, 24, 8), (18, 28, 9)):
            d.ellipse([c + (bx - br) * u, c + (by - br) * u, c + (bx + br) * u, c + (by + br) * u], fill=(150, 20, 20, 235))

    # --- car, top-down, drawn on its own layer then rotated -25 degrees (driving up and to the right)
    L = Image.new('RGBA', (W, W), (0, 0, 0, 0)); cd = ImageDraw.Draw(L)
    cw, ch = 50 * u, 84 * u
    x1, y1, x2, y2 = c - cw / 2, c - ch / 2 + 12 * u, c + cw / 2, c + ch / 2 + 12 * u
    cd.rounded_rectangle([x1, y1, x2, y2], radius=14 * u, fill=col((217, 70, 55)), outline=col((70, 14, 10)), width=int(3.2 * u))
    if not mono:
        cd.rectangle([c - 4 * u, y1 + 3 * u, c + 4 * u, y2 - 3 * u], fill=(250, 245, 235, 255))                    # racing stripe
    cd.rounded_rectangle([c - 19 * u, y1 + 24 * u, c + 19 * u, y1 + 42 * u], radius=6 * u, fill=col((30, 48, 78)) if not mono else (0, 0, 0, 0))  # windscreen
    cd.rounded_rectangle([c - 17 * u, y2 - 30 * u, c + 17 * u, y2 - 16 * u], radius=5 * u, fill=col((30, 48, 78)) if not mono else (0, 0, 0, 0))  # rear window
    for wx in (x1 - 4 * u, x2 - 4 * u):
        for wy in (y1 + 10 * u, y2 - 30 * u):
            cd.rounded_rectangle([wx, wy, wx + 8 * u, wy + 20 * u], radius=3 * u, fill=col((16, 16, 16)))
    for hx in (c - 17 * u, c + 17 * u):                                                                              # headlights
        cd.ellipse([hx - 6 * u, y1 + 2 * u, hx + 6 * u, y1 + 12 * u], fill=col((255, 244, 170)))
    L = L.rotate(-25, resample=Image.BICUBIC, center=(c, c))
    # soft shadow for depth (not on the monochrome layer)
    if not mono:
        sh = L.filter(ImageFilter.GaussianBlur(W * 0.012)); sh = Image.merge('RGBA', (Image.new('L', (W, W), 0),) * 3 + (sh.getchannel('A').point(lambda v: int(v * 0.55)),))
        im.alpha_composite(sh, (int(W * 0.008), int(W * 0.012)))
    im.alpha_composite(L)
    return im.resize((size, size), Image.LANCZOS)

art = draw_art(1024)
art.save('assets/brand/adaptive-icon-foreground.png', optimize=True)
draw_art(1024, mono=True).save('assets/brand/adaptive-icon-monochrome.png', optimize=True)
full = Image.new('RGBA', (1024, 1024), (*BG_RGB, 255))
# legacy / store icon: same artwork, slightly larger since there is no mask to respect
big = draw_art(1024).resize((1180, 1180), Image.LANCZOS)
full.alpha_composite(big, (-78, -78))
full.convert('RGB').save('assets/brand/icon.png', optimize=True)
