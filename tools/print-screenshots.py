#!/usr/bin/env python3
"""Prints small JPEG renditions of key smoke screenshots (base64) into the CI log so they can be
inspected without downloading artifacts, plus simple colour statistics."""
import base64, glob, io, os, sys
from PIL import Image
d = sys.argv[1]
files = sorted(glob.glob(os.path.join(d, '*.png')))
pick = [f for f in files if any(k in f for k in ('launch-01', 'launch-03', 'launch-05', 'launch-08', 'launch-12', 'play-01', 'play-02', 'play-03', 'about', 'resumed'))]
for f in files:
    im = Image.open(f).convert('RGB').resize((96, 54))
    px = list(im.getdata()); n = len(px)
    orange = sum(1 for r, g, b in px if r > 180 and 60 < g < 190 and b < 90) / n
    dark = sum(1 for r, g, b in px if r + g + b < 60) / n
    print(f"STATS {os.path.basename(f):22s} orange={orange:.2f} dark={dark:.2f}")
for f in pick:
    im = Image.open(f).convert('RGB'); im.thumbnail((420, 420))
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=45)
    print(f"SHOT_BEGIN {os.path.basename(f)}"); print(base64.b64encode(buf.getvalue()).decode()); print("SHOT_END")
