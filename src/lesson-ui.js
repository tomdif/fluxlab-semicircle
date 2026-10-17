function updateComparison(){
  const raw=state.coils[state.selected],c=compile(raw),p=state.probe.map(x=>x/100);
  $('#compare-name').textContent=`${raw.name} · ${raw.enabled?'selected contribution':'disabled coil, shown separately'} · probe (${state.probe.map(v=>fmt(v,2)).join(', ')}) cm`;
  const a=analyticField(c,p),u=Physics.unitField(c,p,{tolerance:1e-10}),n=u?.map(v=>v*c.current);
  for(let i=0;i<3;i++){const axis='xyz'[i];$(`#a-b${axis}`).textContent=a.b?fmt(a.b[i],6):'—';$(`#n-b${axis}`).textContent=n?fmt(n[i],6):'—';}
  if(!a.b||!n){$('#compare-error').textContent='Comparison unavailable';$('#compare-status').textContent=a.reason;return;}
  const abs=Math.hypot(...a.b.map((v,i)=>v-n[i])),mag=Math.hypot(...n);
  $('#compare-error').textContent=`${abs.toExponential(2)} µT`;
  $('#compare-status').textContent=`Vector difference${mag>1e-12?` · ${(abs/mag*100).toExponential(2)}% relative`:''}. This measures agreement between solvers, not target-region RMS.`;
}
$('#run-verification').onclick=()=>{
  const btn=$('#run-verification'),report=$('#verification-report');btn.disabled=true;btn.textContent='Checking…';report.className='verification-report';report.textContent='Evaluating 100 deterministic points…';
  setTimeout(()=>{try{const r=verificationSuite();report.classList.add(r.passed===r.total?'success':'failure');report.textContent=`${r.passed} / ${r.total} passed · largest vector difference ${r.maxAbsolute.toExponential(3)} µT · largest relative difference ${(r.maxRelative*100).toExponential(3)}%. Tolerance: 10⁻⁷ µT + 10⁻⁷ × |B|. Deterministic seed: 17659.`;}catch(e){report.classList.add('failure');report.textContent=`Check failed: ${e.message}`;}finally{btn.disabled=false;btn.textContent='Run 100-point check';}},30);
};
$('#load-example').onclick=()=>{state=defaults();clearResult();syncInputs();renderCoils();refresh();$('#workbench').scrollIntoView({behavior:'smooth'});toast('Example loaded. Toggle the straight return to compare.');};
$('#download-html').onclick=()=>{download(new Blob(['<!doctype html>\n'+document.documentElement.outerHTML],{type:'text/html;charset=utf-8'}),'FluxLab_Semicircle.html');toast('HTML downloaded. Open it in your browser to use offline.');};
