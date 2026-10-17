#!/usr/bin/env python3
"""Build a dependency-free HTML document with inline workers, CSS and JavaScript."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parent
src=root/'src'
def read(name):return (src/name).read_text()
def strip_import(s):return re.sub(r'^import .*?;\n','',s,flags=re.M)
def module(name,prefix=''):
    code=strip_import(read(name))
    exports=re.findall(r'^export (?:const|function) (\w+)',code,re.M)
    return '(()=>{\n'+prefix+code.replace('export ','')+'\nreturn {'+','.join(exports)+'};\n})()'
physics='const Physics='+module('physics.js')+';\n'
analytic='const Analytic='+module('analytic.js','const {compile,unitField,distanceToWire,newCoil}=Physics;\n')+';\n'
worker=physics+'const {compileAll,field,metrics,optimize}=Physics;\n'+strip_import(read('worker.js'))
app='const {VERSION,preset,newCoil,compile,compileAll,field,wirePoints,validateDesign}=Physics;\nconst {analyticField,verificationSuite}=Analytic;\n'
app+='const WORKER_TEXT='+json.dumps(worker,ensure_ascii=False)+';\nconst workerURL=URL.createObjectURL(new Blob([WORKER_TEXT],{type:"text/javascript"}));\nfunction createWorker(){return new Worker(workerURL);}\n'
app+=strip_import(read('app.js')).replace("new Worker('./worker.js',{type:'module'})",'createWorker()')+'\n'+read('lesson-ui.js')
js='(()=>{\n"use strict";\n'+physics+analytic+app+'\n})();'
html=read('index.html').replace('<link rel="stylesheet" href="style.css">','<style>'+read('style.css')+'\n'+read('lesson.css')+'</style>')
intro,lesson=read('lesson.html').split('<!-- END_INTRO -->')
intro=intro.replace('<h2>A semicircle.','<h1>A semicircle.').replace('Every point in space.</span></h2>','Every point in space.</span></h1>')
html=re.sub(r'<section class="page-heading">.*?</section>',intro,html,flags=re.S)
html=html.replace('<footer class="page-footer">',lesson+'\n<footer class="page-footer">')
html=html.replace('MAGNETIC DESIGN WORKSPACE','THE SEMICIRCLE / EXPLAINED')
html=html.replace('<script type="module" src="app.js"></script>','<noscript><p class="noscript-note">Enable JavaScript for the explorer and verification. The derivation above remains readable.</p></noscript>\n<script>'+js.replace('</script','<\\/script')+'</script>')
(root/'index.html').write_text(html)
(root/'.nojekyll').write_text('')
print(f'Built index.html: {len(html.encode()):,} bytes; no external runtime dependencies.')
