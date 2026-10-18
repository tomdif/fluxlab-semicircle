(() => {
'use strict';
const $=id=>document.getElementById(id), D=STUDY, E=EQUILIBRIUM;
const colors={baseline:'#eac68d',displaced:'#e38e7c',corrected:'#80d9bc'}, palette=['#80d9bc','#eac68d','#78b9de','#cba9db','#df9787','#92b3aa'];
const fmt=(x,n=1)=>Number(x).toFixed(n), micro=x=>fmt(x*1e6)+' µT';
let selectedCase=0, correction=1, rotation=28;
const ordered=D.cases.map(c=>c.improvement_pct).sort((a,b)=>a-b);
$('headlineRms').textContent=fmt(D.cases[0].before_rms_T*1e6,0)+' → '+fmt(D.cases[0].after_rms_T*1e6,0)+' µT';
$('headlineGain').textContent=fmt(D.cases[0].improvement_pct)+'%';
$('medianGain').textContent=fmt((ordered[5]+ordered[6])/2)+'% median reduction';
$('caseSelect').innerHTML=D.cases.map((c,i)=>`<option value="${i}">Case ${i+1} · seed ${c.seed}</option>`).join('');
function txt(x,y,t,anchor='start',fill='#93a6b0',size=11){return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" font-family="system-ui,sans-serif" font-size="${size}">${t}</text>`;}
function path(points,color,width=1.5){return `<path d="${points.map((p,i)=>(i?'L':'M')+p.map(x=>fmt(x,3)).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}"/>`;}
function plotFrame(xmin,xmax,ymin,ymax,xlabel,ylabel){
 const x=v=>62+(v-xmin)/(xmax-xmin)*466,y=v=>324-(v-ymin)/(ymax-ymin)*280;let s='';
 for(let i=0;i<5;i++){let a=xmin+(xmax-xmin)*i/4,b=ymin+(ymax-ymin)*i/4;s+=`<path d="M${x(a)},44V324 M62,${y(b)}H528" stroke="#293843" stroke-width=".7"/>`+txt(x(a),345,fmt(a,2),'middle')+txt(51,y(b)+4,fmt(b,2),'end');}
 s+=txt(295,373,xlabel,'middle')+txt(63,20,ylabel);
 return {x,y,s};
}
function sectionFrame(xs,ys){
 let xmin=Math.min(...xs)-.015,xmax=Math.max(...xs)+.015,ymin=Math.min(...ys)-.015,ymax=Math.max(...ys)+.015;
 const ratio=466/280,dx=xmax-xmin,dy=ymax-ymin;
 if(dx/dy<ratio){const pad=(dy*ratio-dx)/2;xmin-=pad;xmax+=pad;}else{const pad=(dx/ratio-dy)/2;ymin-=pad;ymax+=pad;}
 return plotFrame(xmin,xmax,ymin,ymax,'R / m','Z / m');
}
function updateCorrection(){
 const c=D.cases[selectedCase],q=c.rms_squared_coefficients_T2;
 const error=a=>Math.sqrt(Math.max(0,q[0]+q[1]*a+q[2]*a*a));
 const value=error(correction),gain=100*(1-value/c.before_rms_T);
 $('fractionLabel').textContent=fmt(correction*100,0)+'%';$('liveRms').textContent=micro(value);
 $('liveGain').textContent=fmt(gain)+'% reduction relative to displaced coils';
 $('maxCurrent').textContent=fmt(Math.max(...c.correction_fraction.map(Math.abs))*100*correction,3)+'%';
 $('noiseRms').textContent=micro(c.noisy_after_rms_T);
 let pts=[];const ymin=Math.min(c.after_rms_T,c.before_rms_T)*.9,ymax=Math.max(c.after_rms_T,c.before_rms_T)*1.05;
 const x=a=>38+a*326,y=b=>113-(b-ymin)/(ymax-ymin)*95;
 for(let i=0;i<=100;i++)pts.push([x(i/100),y(error(i/100))]);
 $('responseChart').innerHTML=`<path d="M38,10V113H364" stroke="#3c4c56" fill="none"/>`+path(pts,colors.corrected,2)+`<circle cx="${x(correction)}" cy="${y(value)}" r="4" fill="#eac68d"/>`+txt(38,135,'0%')+txt(364,135,'100%','end')+txt(201,149,'Applied current correction','middle',undefined,9)+txt(33,18,fmt(ymax*1e6,0),'end',undefined,9)+txt(33,113,fmt(ymin*1e6,0),'end',undefined,9);
 $('responseChart').setAttribute('aria-label',`Case ${selectedCase+1}: ${micro(value)} at ${fmt(correction*100,0)} percent correction`);
}
$('caseSelect').addEventListener('change',e=>{selectedCase=Number(e.target.value);updateCorrection();});
$('fraction').addEventListener('input',e=>{correction=Number(e.target.value)/100;updateCorrection();});
const maxError=Math.max(...D.cases.map(c=>c.before_rms_T));
$('caseBars').innerHTML=D.cases.map((c,i)=>`<div class="case-bar"><button data-case="${i}" aria-label="Explore case ${i+1}, ${micro(c.before_rms_T)} before and ${micro(c.after_rms_T)} after">CASE ${String(i+1).padStart(2,'0')}<strong>−${fmt(c.improvement_pct)}%</strong><div class="bar coral" style="width:${c.before_rms_T/maxError*100}%"></div><div class="bar green" style="width:${c.after_rms_T/maxError*100}%"></div>${fmt(c.before_rms_T*1e6,0)} → ${fmt(c.after_rms_T*1e6,0)} µT</button></div>`).join('');
$('caseBars').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;selectedCase=Number(b.dataset.case);$('caseSelect').value=selectedCase;updateCorrection();$('caseSelect').focus();});
function drawGeometry(){
 const canvas=$('geometry'),rect=canvas.getBoundingClientRect();if(!rect.width)return;
 const ratio=Math.min(devicePixelRatio||1,2);canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;
 const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);const w=rect.width,h=rect.height,a=rotation*Math.PI/180;
 const raw=p=>[p[0]*Math.cos(a)-p[1]*Math.sin(a),(p[0]*Math.sin(a)+p[1]*Math.cos(a))*.45-p[2]*.89];
 const bounds=D.geometry.coils.flat().map(raw),xx=bounds.map(p=>p[0]),yy=bounds.map(p=>p[1]);
 const xmin=Math.min(...xx),xmax=Math.max(...xx),ymin=Math.min(...yy),ymax=Math.max(...yy),s=Math.min((w-40)/(xmax-xmin),(h-48)/(ymax-ymin));
 const project=p=>{const q=raw(p);return [w/2+(q[0]-(xmin+xmax)/2)*s,(h-12)/2+(q[1]-(ymin+ymax)/2)*s];};
 ctx.strokeStyle='#263d46';ctx.lineWidth=.6;
 for(let v=-1.5;v<=1.51;v+=.3){for(const pts of [[[-1.5,v,-.48],[1.5,v,-.48]],[[v,-1.5,-.48],[v,1.5,-.48]]]){ctx.beginPath();pts.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.stroke();}}
 function line(pts,color,width,closed){ctx.beginPath();pts.forEach((p,i)=>{const q=project(p);i?ctx.lineTo(...q):ctx.moveTo(...q);});if(closed)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 D.geometry.coils.forEach((coil,i)=>line(coil,i%4===0?'#b2efd8':'#65ad9a',1.4,true));
 D.traces.baseline.particles.preview.forEach(p=>line(p.map(x=>x.slice(1)), '#eac68d90',.7,false));
 ctx.fillStyle='#93a6b0';ctx.font='10px system-ui';ctx.fillText('R ≈ 1 m · original published scale',12,h-5);
}
$('rotation').addEventListener('input',e=>{rotation=Number(e.target.value);drawGeometry();});
new ResizeObserver(drawGeometry).observe($('geometry'));
function drawTraces(){
 const key=$('traceSelect').value,trace=D.traces[key];
 const all=Object.values(D.traces).flatMap(t=>t.poincare.flat()),xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);
 const f=sectionFrame(xs,ys);
 let s=f.s;
 trace.poincare.forEach((p,k)=>{s+=p.map(v=>`<circle cx="${f.x(v[0])}" cy="${f.y(v[1])}" r="2.2" fill="${palette[k]}"/>`).join('');});
 $('poincare').innerHTML=s;
 const ymax=Math.max(...Object.values(D.traces).flatMap(t=>t.particles.records.map(p=>p.max_axis_distance_m)))*1.08,g=plotFrame(1,24,0,ymax,'Particle index','Maximum axis distance / m');
 s=g.s;trace.particles.records.forEach((p,i)=>{s+=`<path d="M${g.x(i+1)},${g.y(0)}V${g.y(p.max_axis_distance_m)}" stroke="${colors[key]}" stroke-width="8"/>`;if(p.observation_envelope_exit)s+=txt(g.x(i+1),g.y(p.max_axis_distance_m)-8,'×','middle','#e38e7c',16);});
 $('particleChart').innerHTML=s;
 $('orbitSummary').textContent=`${trace.particles.envelope_exits} of 24 trajectories exited the observation envelope. Maximum relative energy drift: ${trace.particles.max_relative_energy_error.toExponential(2)}.`;
}
$('traceSelect').addEventListener('change',drawTraces);
$('pressureSelect').innerHTML=E.cases.map((p,i)=>`<option value="${i}">${p.central_pressure_Pa.toLocaleString()} Pa</option>`).join('');
$('pressureSelect').value=String(E.cases.length-1);
function drawPressure(){
 const q=E.cases[Number($('pressureSelect').value)],xs=E.cases.flatMap(c=>c.R_m),ys=E.cases.flatMap(c=>c.Z_m),f=sectionFrame(xs,ys);
 let s=f.s;
 for(let k=0;k<5;k++){const pts=q.R_m.slice(k*100,k*100+100).map((r,i)=>[f.x(r),f.y(q.Z_m[k*100+i])]);if(k===0)s+=`<circle cx="${pts[0][0]}" cy="${pts[0][1]}" r="3" fill="#eac68d"/>`;else{s+=path([...pts,pts[0]],k===4?'#eac68d':'#80d9bc',k===4?2:1);}}
 $('pressureChart').innerHTML=s;$('beta').textContent=fmt(q.volume_average_beta*100,4)+'%';$('force').textContent=fmt(q.volume_average_force_residual_N_m3,1)+' N/m³';
 $('equilibriumStatus').textContent=q.optimizer_success?'Converged':'Incomplete';
 const relative=q.volume_average_pressure_gradient_N_m3>0?`${fmt(100*q.volume_average_force_residual_N_m3/q.volume_average_pressure_gradient_N_m3,2)}% of the mean pressure-gradient magnitude.`:'Vacuum reference: pressure gradient is zero.';
 $('equilibriumDetail').textContent=`Spectral resolution L = M = N = ${q.resolution.L}. Force residual evaluated on a denser quadrature grid. ${relative} Solver convergence does not certify stability.`;
}
$('pressureSelect').addEventListener('change',drawPressure);
const v=D.validation,checks=v.particle_tolerance_checks;
const rows=[['Independent NumPy field / relative RMS',v.independent_numpy_relative_rms.toExponential(2)],['256 → 512 quadrature points / relative RMS',v.doubled_quadrature_relative_rms.toExponential(2)],['Superposition / relative RMS',v.superposition_relative_rms.toExponential(2)],['Integration tolerance check','10⁻⁹ → 10⁻¹⁰, 6 starts × 2 fields'],['Survivor endpoint difference / maximum',fmt(Math.max(...Object.values(checks).map(x=>x.max_survivor_final_position_difference_m))*1e9,1)+' nm'],['Exit classifications on checked trajectories','All agree'],['Exit-time difference / maximum',fmt(checks.baseline.max_exit_time_difference_s*1e6,3)+' µs'],['Training / held-out sample count','384 / 768'],['Correction constraints','±2% on each of 16 currents']];
$('validation').innerHTML=rows.map(([a,b])=>`<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
const tabs=[...document.querySelectorAll('[role=tab]')];
function downloadJSON(data,name){const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('studyDownload').addEventListener('click',e=>{e.preventDefault();downloadJSON(D,'FluxLab-study.json');});
$('pressureDownload').addEventListener('click',e=>{e.preventDefault();downloadJSON(E,'FluxLab-pressure.json');});
function chooseTab(tab){tabs.forEach(b=>{const active=b===tab;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;$(b.getAttribute('aria-controls')).hidden=!active;});if(tab.id==='tab-correction')drawGeometry();}
tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>chooseTab(tab));tab.addEventListener('keydown',e=>{let n;if(e.key==='ArrowRight')n=(i+1)%tabs.length;if(e.key==='ArrowLeft')n=(i+tabs.length-1)%tabs.length;if(e.key==='Home')n=0;if(e.key==='End')n=tabs.length-1;if(n!==undefined){e.preventDefault();chooseTab(tabs[n]);tabs[n].focus();}});});
$('downloadHtml').addEventListener('click',()=>{const clone=document.documentElement.cloneNode(true);clone.querySelectorAll('[role=tab]').forEach((b,i)=>{b.setAttribute('aria-selected',i===0);b.tabIndex=i===0?0:-1;});clone.querySelectorAll('[role=tabpanel]').forEach((p,i)=>p.hidden=i!==0);const blob=new Blob(['<!doctype html>\n'+clone.outerHTML],{type:'text/html'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='FluxLab-Confinement-Research.html';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});
updateCorrection();drawGeometry();drawTraces();drawPressure();
})();
