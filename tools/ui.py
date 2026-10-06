#!/usr/bin/env python3
"""Tiny uiautomator helper. Usage: ui.py <dump.xml> find <text-or-content-desc>  -> prints "x y" centre, exit 1 if absent
                                      ui.py <dump.xml> text                      -> prints every non-empty text/desc"""
import re, sys
import xml.etree.ElementTree as ET

def nodes(path):
    try:
        root = ET.parse(path).getroot()
    except Exception:
        return []
    return list(root.iter('node'))

def centre(bounds):
    m = re.match(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds)
    x1, y1, x2, y2 = map(int, m.groups())
    return (x1 + x2) // 2, (y1 + y2) // 2

path, cmd = sys.argv[1], sys.argv[2]
ns = nodes(path)
if cmd == 'find':
    want = sys.argv[3]
    for n in ns:
        if want in (n.get('text'), n.get('content-desc')):
            print(*centre(n.get('bounds')))
            sys.exit(0)
    sys.exit(1)
elif cmd == 'text':
    for n in ns:
        for k in ('text', 'content-desc'):
            v = n.get(k)
            if v:
                print(v)
