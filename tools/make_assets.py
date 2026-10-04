"""Regenerates derived assets in assets/ from the authoritative Hot Attic Games logo.
Usage: python3 tools/make_assets.py   (requires Pillow)
The company logo is only cropped/resized, never redrawn."""
from PIL import Image, ImageDraw

BG = (13, 8, 5, 255)
src = Image.open('Hot_Attic_Games_Master_Logo_ALPHA_FINAL.png').convert('RGBA')
logo = src.crop(src.getbbox())
w = 1024
logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
logo.save('assets/hag-logo.png', optimize=True)

# Fully transparent icon: the Android 12+ system splash shows only the background colour,
# and the branded logo is presented by the in-app splash (src/components/HagSplash.js).
Image.new('RGBA', (288, 288), (0, 0, 0, 0)).save('assets/splash-blank.png')

def car_icon(size, pad):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = (size - 2 * pad) / 100
    X = lambda v: pad + v * u
    # zombie (green) under the car
    d.ellipse([X(58), X(8), X(98), X(48)], fill=(126, 200, 80, 255), outline=(40, 80, 30, 255), width=max(2, int(u)))
    for ex in (68, 82):
        d.ellipse([X(ex), X(22), X(ex + 6), X(28)], fill=(20, 20, 20, 255))
    # car
    d.rounded_rectangle([X(4), X(40), X(74), X(92)], radius=X(10) - X(0), fill=(217, 83, 79, 255), outline=(90, 20, 20, 255), width=max(2, int(u)))
    d.rounded_rectangle([X(34), X(48), X(60), X(84)], radius=X(5) - X(0), fill=(30, 40, 60, 255))
    for wy in (36, 86):
        for wx in (10, 52):
            d.rounded_rectangle([X(wx), X(wy), X(wx + 16), X(wy + 10)], radius=X(3) - X(0), fill=(20, 20, 20, 255))
    return im

icon = Image.new('RGBA', (1024, 1024), (30, 50, 30, 255))
icon.alpha_composite(car_icon(1024, 140))
icon.convert('RGB').save('assets/icon.png', optimize=True)
car_icon(1024, 300).save('assets/adaptive-icon-foreground.png', optimize=True)
