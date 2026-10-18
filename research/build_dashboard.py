#!/usr/bin/env python3
"""Embed measured outputs in a portable, dependency-free HTML dashboard."""
from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]/'fusion'
study=json.loads((root/'results.json').read_text())
equilibrium=json.loads((root/'equilibrium.json').read_text())
study['display_export_note']='Plot coordinates rounded to 7 decimal places or 8 significant digits. Scalar metrics and Fourier coefficients retain full precision. Full output is in fusion/results.json in the repository.'
assert len(study['cases'])==12 and len(study['traces'])==3
assert len(equilibrium['cases'])==3
# Rounding only plot coordinates keeps the browser payload manageable; numeric
# metrics, seeds, Fourier coefficients and solver settings retain full precision.
for coil in study['geometry']['coils']:
    for point in coil:
        point[:]=[round(x,7) for x in point]
for trace in study['traces'].values():
    for line in trace['poincare']:
        for point in line: point[:]=[round(x,7) for x in point]
    for path in trace['particles']['preview']:
        for point in path: point[:]=[float(f'{x:.8g}') for x in point]
data='const STUDY='+json.dumps(study,separators=(',',':'))+';\nconst EQUILIBRIUM='+json.dumps(equilibrium,separators=(',',':'))+';'
html=(root/'template.html').read_text().replace('/* STYLE */',(root/'style.css').read_text()).replace('/* DATA */',data.replace('</script','<\\/script')).replace('/* APP */',(root/'app.js').read_text().replace('</script','<\\/script'))
(root/'index.html').write_text(html)
print(f'Built {len(html.encode()):,} bytes, all runtime data embedded.')
