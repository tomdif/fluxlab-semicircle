import {VERSION,preset,newCoil,compile,compileAll,field,wirePoints,validateDesign} from './physics.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const fmt=(x,d=2)=>x===null||!Number.isFinite(x)?'—':Math.abs(x)<.0005?'0.00':Math.abs(x)>=1e5?x.toExponential(2):x.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const defaults=()=>({coils:preset('dloop').map(c=>({...c,closed:false,name:'Semicircular arc'})),preset:'dloop',selected:0,probe:[0,0,5],target:[0,0,100],width:2,maxCurrent:10,bias:0,view:'map',plane:'yz',slice:0,extent:10,component:'mag',arrows:true});
let state=defaults(),map=null,profile=[],metrics=null,undo=null,mapWorker=null,computeWorker=new Worker('./worker.js',{type:'module'}),computeId=0,mapId=0,metricId=0,profileId=0,optId=0,refreshTimer,toastTimer;
let camera={yaw:-.65,pitch:.5},drag=null,canvasRect=null,plot=null;
try{const saved=JSON.parse(localStorage.getItem('fluxlab.semicircle.v1'));if(saved)state=cleanState(validateDesign(saved));}catch{}
function cleanState(s){
  const d=defaults();const n=(v,lo,hi,f)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,lo,hi):f;
  const vec=(v,lo,hi,f)=>Array.isArray(v)&&v.length===3?v.map((x,i)=>n(x,lo,hi,f[i])):f;
  return {...d,coils:s.coils.map((c,i)=>newCoil(i,{...c,id:`coil-${i}-${Math.random().toString(36).slice(2,7)}`,name:String(c.name??`Coil ${i+1}`).slice(0,40),color:['#f6ac69','#52d6c7','#b59af8','#f183a1','#7fb6ff','#e3dc85'][i]})),selected:0,preset:['uniform','gradient','shaper','dloop'].includes(s.preset)?s.preset:'custom',probe:vec(s.probe,-100,100,d.probe),target:vec(s.target,-100000,100000,d.target),width:n(s.width,0,30,2),maxCurrent:n(s.maxCurrent,.01,100,10),bias:n(s.bias,0,100,0),extent:n(s.extent,5,50,16),plane:['xy','xz','yz'].includes(s.plane)?s.plane:'yz',slice:n(s.slice,-100,100,0),component:['mag','0','1','2'].includes(s.component)?s.component:'mag',view:['map','geometry','profile'].includes(s.view)?s.view:'map',arrows:s.arrows!==false};
}
function save(){try{localStorage.setItem('fluxlab.semicircle.v1',JSON.stringify(state));$('#saved').innerHTML='<i></i> Saved on this device';}catch{$('#saved').textContent='Session only';}}
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.classList.toggle('error',error);t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,4500);}
function clearResult(){undo=null;optId=++computeId;$('#optimizer-result').hidden=true;$('#optimize-btn').disabled=false;$('#optimize-btn').innerHTML='<span>✧</span> Find currents <span>→</span>';}
function syncInputs(){
  $('#preset').value=state.preset;$('#plane').value=state.plane;$('#slice').value=state.slice;$('#extent').value=state.extent;$('#extent-value').textContent=`±${state.extent} cm`;$('#component').value=state.component;$('#region-width').value=state.width;$('#max-current').value=state.maxCurrent;$('#bias').value=state.bias;$('#bias-value').textContent=`${state.bias}%`;
  $$('[data-probe]').forEach(e=>e.value=state.probe[+e.dataset.probe]);$$('[data-target]').forEach(e=>e.value=state.target[+e.dataset.target]);
  $('#arrows-btn').classList.toggle('active',state.arrows);$('#arrows-btn').setAttribute('aria-pressed',state.arrows);$('#sample-count').textContent=state.width===0?'1 sample point':'27 sample points';
  updateViewUI();updateInsight();
}
function renderCoils(){
  $('#coil-list').innerHTML=state.coils.map((c,i)=>`<div class="coil-item ${state.selected===i?'selected':''} ${c.enabled?'':'disabled'}" data-coil="${i}"><input type="checkbox" class="coil-enabled" data-enable="${i}" ${c.enabled?'checked':''} aria-label="Enable ${escape(c.name)}"><span class="coil-dot" style="background:${c.color}"></span><button class="coil-select" data-select="${i}" aria-pressed="${state.selected===i}"><strong>${escape(c.name)}</strong><small>${c.type==='circle'?'Circular':c.closed?'Semicircle + return':'Arc only'} · ${c.turns} turns</small></button><span class="current-read">${fmt(c.current,2)} A</span></div>`).join('');
  $('#add-coil').disabled=state.coils.length>=6;renderEditor();
}
function renderEditor(){
  const c=state.coils[state.selected],compiled=compile(c),range=Math.max(state.maxCurrent,Math.abs(c.current),10);
  $('#coil-editor').innerHTML=`<div class="editor-title"><span class="coil-dot" style="background:${c.color}"></span><input id="coil-name" value="${escape(c.name)}" maxlength="40" aria-label="Coil name"><button class="remove-coil" id="remove-coil" aria-label="Delete selected coil" title="Delete selected coil" ${state.coils.length===1?'disabled':''}>×</button></div>
  <div class="form-row"><label>Shape<select id="coil-type"><option value="circle" ${c.type==='circle'?'selected':''}>Circle</option><option value="semi" ${c.type==='semi'?'selected':''}>Semicircle</option></select></label><label>Plane<select id="coil-plane"><option value="xy" ${c.plane==='xy'?'selected':''}>XY · normal Z</option><option value="xz" ${c.plane==='xz'?'selected':''}>XZ · normal Y</option><option value="yz" ${c.plane==='yz'?'selected':''}>YZ · normal X</option></select></label></div>
  <div class="form-row"><label>Radius<div class="unit-input"><input data-coil-prop="radius" aria-label="Coil radius" type="number" value="${c.radius}" min=".5" max="100" step=".5"><span>cm</span></div></label><label>Turns<div class="unit-input"><input data-coil-prop="turns" aria-label="Coil turns" type="number" value="${c.turns}" min="1" max="1000" step="1"><span>N</span></div></label></div>
  <div class="current-label"><label for="coil-current">Current</label><div class="unit-input"><input id="coil-current" data-coil-prop="current" type="number" value="${+c.current.toFixed(6)}" min="-100" max="100" step=".1"><span>A</span></div></div><input id="current-slider" aria-label="Coil current slider" type="range" min="${-range}" max="${range}" value="${c.current}" step=".01"><div class="range-labels"><span>−${range} A</span><span>0</span><span>+${range} A</span></div>
  <div class="center-label">POSITION <span style="float:right">cm</span></div><div class="coordinate-inputs">${['X','Y','Z'].map((a,i)=>`<label><span>${a}</span><input data-center="${i}" aria-label="Coil center ${a}" type="number" min="-100" max="100" step=".5" value="${c.center[i]}"></label>`).join('')}</div>
  <div class="form-row" style="margin-top:14px"><label>Wire diameter<div class="unit-input"><input data-coil-prop="wire" aria-label="Wire diameter" type="number" min=".05" max="10" value="${c.wire}" step=".1"><span>mm</span></div></label><label>In-plane rotation<div class="unit-input"><input data-coil-prop="rotation" aria-label="Coil rotation" type="number" min="-360" max="360" value="${c.rotation}" step="15"><span>°</span></div></label></div>
  ${c.type==='semi'?`<label class="return-control"><input id="coil-closed" type="checkbox" ${c.closed?'checked':''}><span>Include straight return${!c.closed?'<small>Arc-only view: partial circuit contribution.</small>':''}</span></label>`:''}<p class="coil-detail">${fmt(compiled.length,2)} m copper · ${fmt(compiled.resistance*1000,1)} mΩ<br>Positive current follows the plane’s right-hand rule.</p>`;
}
function coilChanged(){state.preset='custom';$('#preset').value='custom';clearResult();save();renderCoils();updateInsight();scheduleRefresh();}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(),120);}
function refresh(){save();requestMetrics();requestMap();if(state.view==='profile')requestProfile();if(state.view==='geometry')draw();}
function requestMetrics(){metricId=++computeId;computeWorker.postMessage({kind:'metrics',id:metricId,coils:state.coils,probe:state.probe,target:state.target,width:state.width});}
function requestMap(){
  mapId++;if(mapWorker)mapWorker.terminate();mapWorker=new Worker('./worker.js',{type:'module'});
  if(state.view==='map'){$('#canvas-loading').hidden=false;$('#render-status').innerHTML='<i></i> Updating';}
  const thisId=mapId;
  mapWorker.onmessage=e=>{if(e.data.id!==mapId)return;if(e.data.error){toast(e.data.error,true);$('#canvas-loading').hidden=true;return;}map=e.data;$('#canvas-loading').hidden=true;$('#render-status').innerHTML='<i></i> Live';if(state.view==='map')draw();};
  mapWorker.onerror=()=>{if(thisId===mapId){toast('The field map could not be calculated. Try a smaller assembly.',true);$('#canvas-loading').hidden=true;}};
  mapWorker.postMessage({kind:'map',id:mapId,coils:state.coils,plane:state.plane,slice:state.slice,extent:state.extent,n:101});
}
function requestProfile(){profileId=++computeId;computeWorker.postMessage({kind:'profile',id:profileId,coils:state.coils,probe:state.probe,extent:state.extent});}
computeWorker.onmessage=e=>{
  const d=e.data;
  if(d.error){if(d.kind==='optimize'){$('#optimize-btn').disabled=false;$('#optimize-btn').innerHTML='<span>✧</span> Find currents <span>→</span>';}toast(d.error,true);return;}
  if(d.kind==='metrics'&&d.id===metricId){metrics=d.result;renderMetrics();if(state.view!=='profile')draw();}
  if(d.kind==='profile'&&d.id===profileId){profile=d.data;if(state.view==='profile')draw();}
  if(d.kind==='optimize'&&d.id===optId){
    $('#optimize-btn').disabled=false;$('#optimize-btn').innerHTML='<span>✧</span> Find currents <span>→</span>';
    undo=state.coils.map(c=>({id:c.id,current:c.current}));
    d.result.currents.forEach(r=>{const c=state.coils.find(x=>x.id===r.id);if(c)c.current=r.current;});
    state.preset='custom';$('#preset').value='custom';renderCoils();refresh();showResult(d.result);
  }
};
function renderMetrics(){
  if(!metrics)return;updateComparison();const m=metrics,cs=compileAll(state.coils);
  $('#metric-field').textContent=fmt(m.magnitude);$('#metric-error').textContent=fmt(m.rms);$('#metric-power').textContent=fmt(m.power,3);$('#metric-coils').textContent=String(cs.length).padStart(2,'0');$('#metric-turns').textContent=`${cs.reduce((s,c)=>s+c.turns,0)} total turns`;
  $('#metric-length').textContent=cs.some(c=>c.type==='semi'&&!c.closed)?'Includes partial circuit contributions':`${fmt(cs.reduce((s,c)=>s+c.length,0),1)} m of copper winding`;
  $('#metric-samples').textContent=m.valid!==m.total?`${m.valid}/${m.total} valid samples · wire intersection`:`${m.total} samples · max error ${fmt(m.maxerr)} µT`;
  $('#metric-vector').textContent=m.b?`Bx ${fmt(m.b[0],1)}  /  By ${fmt(m.b[1],1)}  /  Bz ${fmt(m.b[2],1)}`:'Probe intersects a modeled wire';
  ['x','y','z'].forEach((k,i)=>$(`#probe-b${k}`).textContent=m.b?fmt(m.b[i]):'—');
}
function showResult(r){
  const residual=r.after.rms>Math.max(.5,Math.hypot(...state.target)*.01),warning=!r.converged||residual||r.atLimit;
  const worsened=r.after.rms>r.before.rms+Math.max(1e-6,r.before.rms*1e-6);
  const tradeoff=worsened?(r.initialFeasible===false?'Current limits enforced':r.beta>0?'Heating tradeoff applied':'Fit needs review'):null;
  const title=tradeoff||(!r.converged?'Iteration limit reached':r.atLimit?'Current limit reached':residual?'Best fit · residual remains':'Target fit complete');
  const box=$('#optimizer-result');box.hidden=false;box.classList.toggle('warning',warning||worsened);
  box.innerHTML=`<strong>${title}</strong><p>RMS error <b>${fmt(r.before.rms)} → ${fmt(r.after.rms)} µT</b><br>Copper loss ${fmt(r.before.power,3)} → ${fmt(r.after.power,3)} W${worsened?'<br>'+ (r.initialFeasible===false?'Starting currents exceeded the requested limit.':r.beta>0?'Higher error accepted for lower heating. Set efficiency to 0% to prioritize accuracy.':'Unexpected increase: inspect this fit.') :''}</p><div class="result-foot"><span>${r.samples} samples · ${r.iterations} iterations</span><button id="undo-optimize" class="text-button">Undo</button></div>`;
  toast(worsened?'RMS increased; see the explained tradeoff.':residual?'Currents fitted. This geometry leaves a residual field error.':'Optimized currents applied.');
}
function updateInsight(){
  const semi=state.coils.some(c=>c.type==='semi');
  $('#insight-title').textContent=semi?'The return path changes the field.':state.preset==='gradient'?'Opposite currents create a gradient.':'A uniform field starts with symmetry.';
  $('#insight-copy').textContent=semi?'Toggle the straight return to see its contribution. Above a semicircle’s center, the return can reverse the sideways field.':state.preset==='gradient'?'The field cancels at the midpoint, but grows away from it. Inspect the axial profile to see the slope.':'Equal circular coils separated by one radius create a remarkably uniform field near their midpoint.';
}
function updateViewUI(){
  $$('[data-view]').forEach(b=>b.setAttribute('aria-selected',b.dataset.view===state.view));
  $('#view-controls').style.visibility=state.view==='map'?'visible':'hidden';
  $('#slice-label').textContent={xy:'Z',xz:'Y',yz:'X'}[state.plane];
  $('#canvas-badge').innerHTML=state.view==='map'?`${state.plane.toUpperCase()} SECTION <span>· ${{xy:'Z',xz:'Y',yz:'X'}[state.plane]} = ${fmt(state.slice,1)} cm</span>`:state.view==='geometry'?'COIL ASSEMBLY <span>· 3D projection</span>':'AXIAL PROFILE <span>· global Z axis</span>';
  $('#canvas-hint').textContent=state.view==='map'?'Click to place the probe':state.view==='geometry'?'Drag to rotate · scroll to zoom':`Line through X = ${fmt(state.probe[0],1)}, Y = ${fmt(state.probe[1],1)} cm`;
  $('#plot-caption').innerHTML=state.view==='map'?'<span class="dash-line"></span>Dashed outlines: projected coils <span class="caption-separator">/</span> Wire interiors masked':state.view==='geometry'?'Solid conductors · translucent target region · white cross = probe':'Magnitude |B| and signed Bz · gaps mark excluded wire interiors';
  $('#canvas-loading').hidden=state.view!=='map'||!mapWorker||map?.id===mapId;
}
const canvas=$('#field-canvas'),ctx=canvas.getContext('2d');
function setupCanvas(){const r=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);canvasRect={w:r.width,h:r.height};ctx.clearRect(0,0,r.width,r.height);ctx.fillStyle='#0a141e';ctx.fillRect(0,0,r.width,r.height);return canvasRect;}
function axesFor(plane){return plane==='xy'?[0,1,2]:plane==='xz'?[0,2,1]:[1,2,0];}
function plotBox(w,h){return {left:46,top:42,width:w-70,height:h-83};}
function draw(){if(!canvas.clientWidth)return;const {w,h}=setupCanvas();if(state.view==='map')drawMap(w,h);else if(state.view==='geometry')drawGeometry(w,h);else drawProfile(w,h);}
function mapXY(a,b,p=plot){return [p.left+(a+state.extent)/(2*state.extent)*p.width,p.top+(state.extent-b)/(2*state.extent)*p.height];}
function grid(p,labels=['Y','Z']){
  ctx.font='9px ui-monospace, SFMono-Regular, monospace';ctx.lineWidth=.6;ctx.textAlign='center';
  for(let i=0;i<=4;i++){const v=-state.extent+i*state.extent/2,x=p.left+i*p.width/4,y=p.top+p.height-i*p.height/4;ctx.strokeStyle=i===2?'#94b3cb3d':'#789abf1a';ctx.beginPath();ctx.moveTo(x,p.top);ctx.lineTo(x,p.top+p.height);ctx.moveTo(p.left,y);ctx.lineTo(p.left+p.width,y);ctx.stroke();ctx.fillStyle='#8ba2b5';ctx.fillText(fmt(v,0),x,p.top+p.height+17);ctx.textAlign='right';ctx.fillText(fmt(v,0),p.left-9,y+3);ctx.textAlign='center';}
  ctx.fillStyle='#a9c0d1';ctx.fillText(`${labels[0]} / cm`,p.left+p.width/2,p.top+p.height+33);ctx.save();ctx.translate(13,p.top+p.height/2);ctx.rotate(-Math.PI/2);ctx.fillText(`${labels[1]} / cm`,0,0);ctx.restore();
}
const ramp=[[12,23,39],[27,56,87],[33,100,129],[42,154,157],[77,202,170],[180,224,160],[255,202,127]];
function color(t,signed=false){
  if(signed){if(t<.5){const q=t*2;return [Math.round(65+(18-65)*q),Math.round(112+(29-112)*q),Math.round(178+(44-178)*q)];}const q=(t-.5)*2;return [Math.round(18+(244-18)*q),Math.round(29+(167-29)*q),Math.round(44+(104-44)*q)];}
  t=clamp(t,0,1)*(ramp.length-1);const i=Math.min(ramp.length-2,Math.floor(t)),f=t-i;return ramp[i].map((v,k)=>Math.round(v+(ramp[i+1][k]-v)*f));
}
function drawMap(w,h){
  plot=plotBox(w,h);if(!map||map.id!==mapId){grid(plot,axesFor(state.plane).slice(0,2).map(i=>'XYZ'[i]));return;}
  const n=map.n,signed=state.component!=='mag',values=[];
  for(let i=0;i<n*n;i++){const k=i*3;if(Number.isFinite(map.data[k]))values.push(signed?Math.abs(map.data[k+ +state.component]):Math.hypot(map.data[k],map.data[k+1],map.data[k+2]));}
  values.sort((a,b)=>a-b);const max=Math.max(values[Math.floor(values.length*.98)]||0,.001),knee=max/50,scale=Math.log1p(max/knee);
  const off=document.createElement('canvas');off.width=n;off.height=n;const oc=off.getContext('2d'),im=oc.createImageData(n,n);
  for(let i=0;i<n*n;i++){
    let rgb=[9,16,24];const k=i*3;if(Number.isFinite(map.data[k])){const v=signed?map.data[k+ +state.component]:Math.hypot(map.data[k],map.data[k+1],map.data[k+2]);const q=clamp(Math.log1p(Math.abs(v)/knee)/scale,0,1);rgb=color(signed?.5+.5*Math.sign(v)*q:q,signed);}im.data.set([...rgb,255],i*4);
  }
  oc.putImageData(im,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(off,plot.left,plot.top,plot.width,plot.height);grid(plot,axesFor(state.plane).slice(0,2).map(i=>'XYZ'[i]));
  ctx.save();ctx.beginPath();ctx.rect(plot.left,plot.top,plot.width,plot.height);ctx.clip();
  if(state.arrows){const ax=map.axes,step=8;for(let y=4;y<n-3;y+=step)for(let x=4;x<n-3;x+=step){const k=(y*n+x)*3,b1=map.data[k+ax[0]],b2=map.data[k+ax[1]],len=Math.hypot(b1,b2);if(!Number.isFinite(len)||len<max*1e-6)continue;const px=plot.left+x/(n-1)*plot.width,py=plot.top+y/(n-1)*plot.height,dx=b1/len*6,dy=-b2/len*6;ctx.strokeStyle='#e5f9ff70';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(px-dx,py-dy);ctx.lineTo(px+dx,py+dy);ctx.lineTo(px+dx-dx*.5+dy*.4,py+dy-dy*.5-dx*.4);ctx.moveTo(px+dx,py+dy);ctx.lineTo(px+dx-dx*.5-dy*.4,py+dy-dy*.5+dx*.4);ctx.stroke();}}
  const ax=axesFor(state.plane);
  for(const c of compileAll(state.coils)){
    const pts=wirePoints(c),inPlane=pts.every(p=>Math.abs(p[ax[2]]*100-state.slice)<.01);ctx.strokeStyle=c.color;ctx.lineWidth=1.5;ctx.globalAlpha=inPlane?.9:.6;ctx.setLineDash(inPlane?[]:[4,5]);ctx.beginPath();pts.forEach((p,i)=>{const [x,y]=mapXY(p[ax[0]]*100,p[ax[1]]*100);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.stroke();ctx.globalAlpha=1;ctx.setLineDash([]);
  }
  const pc=state.probe,half=state.width/2,[rx,ry]=mapXY(pc[ax[0]]-half,pc[ax[1]]+half),[rx2,ry2]=mapXY(pc[ax[0]]+half,pc[ax[1]]-half);
  if(Math.abs(pc[ax[2]]-state.slice)<=half+.001){ctx.fillStyle='#52d6c715';ctx.strokeStyle='#affced90';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.fillRect(rx,ry,rx2-rx,ry2-ry);ctx.strokeRect(rx,ry,rx2-rx,ry2-ry);ctx.setLineDash([]);}
  const [px,py]=mapXY(pc[ax[0]],pc[ax[1]]);ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.moveTo(px-11,py);ctx.lineTo(px-7,py);ctx.moveTo(px+7,py);ctx.lineTo(px+11,py);ctx.moveTo(px,py-11);ctx.lineTo(px,py-7);ctx.moveTo(px,py+7);ctx.lineTo(px,py+11);ctx.stroke();
  ctx.restore();$('#legend-min').textContent=signed?'−'+fmt(max,1):'0';$('#legend-max').textContent=fmt(max,1);$('#legend-title').textContent=signed?`${['Bx','By','Bz'][+state.component]} · µT · signed log`:'|B| · µT · log scale';$('#color-legend').style.background=signed?'linear-gradient(90deg,#4170b2,#121d2c,#f4a768)':'linear-gradient(90deg,#0c1727,#1b3857,#216481,#2a9a9d,#4dcaaa,#b4e0a0,#ffca7f)';
}
function project(p,w,h){
  const co=Math.cos(camera.yaw),si=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),scale=Math.min(w,h)*.36/(state.extent/100);
  const x=p[0]*co-p[1]*si,y=p[0]*si+p[1]*co;
  return [w/2+x*scale,h*.53+(y*sp-p[2]*cp)*scale,y*cp+p[2]*sp];
}
function drawGeometry(w,h){
  const size=state.extent/100,projected=p=>project(p,w,h);
  ctx.lineWidth=.6;ctx.strokeStyle='#43607838';
  for(let i=-4;i<=4;i++){const v=i*size/4;for(const pair of [[[v,-size,0],[v,size,0]],[[-size,v,0],[size,v,0]]]){const p=projected(pair[0]),q=projected(pair[1]);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}}
  for(let j=0;j<3;j++){const a=[0,0,0],b=[0,0,0];b[j]=size*.85;const p=projected(a),q=projected(b);ctx.strokeStyle=['#f6ac6980','#b59af880','#52d6c780'][j];ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();ctx.fillStyle=['#f6ac69','#b59af8','#52d6c7'][j];ctx.font='10px ui-monospace,monospace';ctx.fillText('XYZ'[j],q[0]+6,q[1]+3);}
  const cs=compileAll(state.coils).sort((a,b)=>projected(a.c)[2]-projected(b.c)[2]);
  for(const c of cs){const pts=wirePoints(c,150);ctx.strokeStyle=c.color;ctx.lineWidth=2.4;ctx.shadowColor=c.color;ctx.shadowBlur=7;ctx.beginPath();pts.forEach((p,i)=>{const q=projected(p);i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);});ctx.stroke();ctx.shadowBlur=0;
    const ti=Math.floor(pts.length*.2),p=projected(pts[ti]),q=projected(pts[ti+(c.current>=0?2:-2)]),ang=Math.atan2(q[1]-p[1],q[0]-p[0]);ctx.fillStyle=c.color;ctx.beginPath();ctx.moveTo(p[0]+Math.cos(ang)*7,p[1]+Math.sin(ang)*7);ctx.lineTo(p[0]+Math.cos(ang+2.5)*6,p[1]+Math.sin(ang+2.5)*6);ctx.lineTo(p[0]+Math.cos(ang-2.5)*6,p[1]+Math.sin(ang-2.5)*6);ctx.closePath();ctx.fill();
    const label=projected(pts[Math.floor(pts.length*.7)]);ctx.font='10px ui-sans-serif,sans-serif';ctx.fillStyle=c.color;ctx.fillText(`${c.name}  ${fmt(c.current,2)} A`,label[0]+9,label[1]-9);
  }
  const s=state.width/200,center=state.probe.map(x=>x/100),corners=[];for(let i=0;i<8;i++)corners.push(center.map((v,j)=>v+((i>>j)&1?s:-s)));
  ctx.strokeStyle='#aeede775';ctx.lineWidth=.8;ctx.setLineDash([3,3]);for(let i=0;i<8;i++)for(let j=0;j<3;j++)if(!(i&(1<<j))){const p=projected(corners[i]),q=projected(corners[i|(1<<j)]);ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();}ctx.setLineDash([]);
  const p=projected(center);ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(p[0]-5,p[1]);ctx.lineTo(p[0]+5,p[1]);ctx.moveTo(p[0],p[1]-5);ctx.lineTo(p[0],p[1]+5);ctx.stroke();
  $('#legend-title').textContent='Coil colors · current direction arrows';$('#legend-min').textContent='';$('#legend-max').textContent='';$('#color-legend').style.background='linear-gradient(90deg,#f6ac69,#52d6c7,#b59af8)';
}
function drawProfile(w,h){
  plot=plotBox(w,h);const vals=profile.filter(p=>p.b).flatMap(p=>[p.b[2],Math.hypot(...p.b)]);const sorted=vals.map(Math.abs).sort((a,b)=>a-b),cap=sorted[Math.floor(sorted.length*.98)]||1;let min=Math.min(0,...vals.filter(v=>Math.abs(v)<=cap)),max=Math.max(1,...vals.filter(v=>Math.abs(v)<=cap));const pad=(max-min)*.08;min-=pad;max+=pad;
  const px=z=>plot.left+(z+state.extent)/(2*state.extent)*plot.width,py=v=>plot.top+(max-v)/(max-min)*plot.height;
  ctx.font='9px ui-monospace,monospace';ctx.lineWidth=.7;
  for(let i=0;i<=4;i++){const y=plot.top+i*plot.height/4,x=plot.left+i*plot.width/4;ctx.strokeStyle='#789abf25';ctx.beginPath();ctx.moveTo(plot.left,y);ctx.lineTo(plot.left+plot.width,y);ctx.moveTo(x,plot.top);ctx.lineTo(x,plot.top+plot.height);ctx.stroke();ctx.fillStyle='#8ba2b5';ctx.textAlign='right';ctx.fillText(fmt(max-i*(max-min)/4,0),plot.left-7,y+3);ctx.textAlign='center';ctx.fillText(fmt(-state.extent+i*state.extent/2,0),x,plot.top+plot.height+17);}
  ctx.fillStyle='#a9c0d1';ctx.fillText('Z / cm',plot.left+plot.width/2,plot.top+plot.height+33);ctx.save();ctx.translate(12,plot.top+plot.height/2);ctx.rotate(-Math.PI/2);ctx.fillText('Field / µT',0,0);ctx.restore();
  ctx.save();ctx.beginPath();ctx.rect(plot.left,plot.top,plot.width,plot.height);ctx.clip();
  for(const [col,mag] of [['#f6ac69',true],['#52d6c7',false]]){ctx.strokeStyle=col;ctx.lineWidth=1.8;ctx.setLineDash(mag?[5,3]:[]);ctx.beginPath();let drawing=false;for(const p of profile){if(!p.b){drawing=false;continue;}const x=px(p.z),y=py(mag?Math.hypot(...p.b):p.b[2]);drawing?ctx.lineTo(x,y):ctx.moveTo(x,y);drawing=true;}ctx.stroke();}
  ctx.setLineDash([2,4]);ctx.strokeStyle='#d5e8f580';ctx.beginPath();ctx.moveTo(px(state.probe[2]),plot.top);ctx.lineTo(px(state.probe[2]),plot.top+plot.height);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  $('#legend-title').textContent='Orange dashed: |B|   ·   Teal: Bz';$('#legend-min').textContent='';$('#legend-max').textContent='';$('#color-legend').style.background='linear-gradient(90deg,#f6ac69 0%,#f6ac69 48%,#52d6c7 52%,#52d6c7 100%)';
}
function numeric(e){const v=Number(e.value);if(e.value.trim()===''||!Number.isFinite(v)){toast('Enter a valid number.',true);syncInputs();renderCoils();return null;}const min=e.min!==''?Number(e.min):-Infinity,max=e.max!==''?Number(e.max):Infinity;if(v<min||v>max){toast(`Enter a value from ${min} to ${max}.`,true);syncInputs();renderCoils();return null;}return v;}
document.addEventListener('change',e=>{
  const el=e.target,c=state.coils[state.selected];
  if(el.matches('[data-enable]')){state.coils[+el.dataset.enable].enabled=el.checked;coilChanged();}
  else if(el.matches('[data-coil-prop]')){let v=numeric(el);if(v===null)return;if(el.dataset.coilProp==='turns')v=Math.round(v);c[el.dataset.coilProp]=v;coilChanged();}
  else if(el.matches('[data-center]')){const v=numeric(el);if(v===null)return;c.center[+el.dataset.center]=v;coilChanged();}
  else if(el.id==='coil-type'){c.type=el.value;coilChanged();}
  else if(el.id==='coil-plane'){c.plane=el.value;coilChanged();}
  else if(el.id==='coil-closed'){c.closed=el.checked;coilChanged();}
  else if(el.id==='coil-name'){c.name=el.value.trim()||'Untitled coil';renderCoils();save();draw();}
  else if(el.matches('[data-probe]')){const v=numeric(el);if(v===null)return;state.probe[+el.dataset.probe]=v;probeChanged();}
  else if(el.matches('[data-target]')){const v=numeric(el);if(v===null)return;state.target[+el.dataset.target]=v;clearResult();save();requestMetrics();}
  else if(el.id==='preset'){state.coils=preset(el.value);state.preset=el.value;state.selected=0;state.probe=el.value==='dloop'?[0,0,5]:[0,0,0];state.width=el.value==='dloop'?1:2;state.target=[0,0,100];state.slice=0;state.extent=el.value==='shaper'?20:16;clearResult();syncInputs();renderCoils();refresh();}
  else if(el.id==='plane'){state.plane=el.value;syncInputs();save();requestMap();}
  else if(el.id==='slice'){const v=numeric(el);if(v===null)return;state.slice=v;updateViewUI();save();requestMap();}
  else if(el.id==='component'){state.component=el.value;save();draw();}
  else if(el.id==='region-width'){const v=numeric(el);if(v===null)return;state.width=v;clearResult();syncInputs();save();requestMetrics();draw();}
  else if(el.id==='max-current'){const v=numeric(el);if(v===null)return;state.maxCurrent=v;clearResult();renderEditor();save();}
});
document.addEventListener('input',e=>{
  if(e.target.id==='current-slider'){const c=state.coils[state.selected];c.current=+e.target.value;$('#coil-current').value=c.current;state.preset='custom';$('#preset').value='custom';clearResult();scheduleRefresh();}
  if(e.target.id==='bias'){state.bias=+e.target.value;$('#bias-value').textContent=`${state.bias}%`;clearResult();save();}
  if(e.target.id==='extent'){state.extent=+e.target.value;$('#extent-value').textContent=`±${state.extent} cm`;save();if(state.view==='geometry')draw();else scheduleRefresh();}
});
$('#coil-editor').addEventListener('change',e=>{if(e.target.id==='current-slider')renderCoils();});
document.addEventListener('click',e=>{
  const sel=e.target.closest('[data-select]');if(sel){state.selected=+sel.dataset.select;renderCoils();updateComparison();return;}
  if(e.target.closest('#remove-coil')&&state.coils.length>1){state.coils.splice(state.selected,1);state.selected=Math.min(state.selected,state.coils.length-1);coilChanged();}
  const tab=e.target.closest('[data-view]');if(tab){state.view=tab.dataset.view;updateViewUI();save();if(state.view==='profile')requestProfile();draw();}
  const tp=e.target.closest('[data-target-preset]');if(tp){state.target=tp.dataset.targetPreset==='zero'?[0,0,0]:[0,0,100];syncInputs();clearResult();save();requestMetrics();}
  if(e.target.closest('#undo-optimize')&&undo){undo.forEach(r=>{const c=state.coils.find(x=>x.id===r.id);if(c)c.current=r.current;});clearResult();renderCoils();refresh();toast('Previous currents restored.');}
  const ex=e.target.closest('[data-export]');if(ex){exportFile(ex.dataset.export);$('#export-menu').hidden=true;$('#export-btn').setAttribute('aria-expanded','false');}
  if(!e.target.closest('.export-wrap')){$('#export-menu').hidden=true;$('#export-btn').setAttribute('aria-expanded','false');}
});
$('#add-coil').onclick=()=>{if(state.coils.length>=6)return;state.coils.push(newCoil(state.coils.length,{center:[0,0,8]}));state.selected=state.coils.length-1;coilChanged();};
$('#reset-btn').onclick=()=>{state=defaults();clearResult();syncInputs();renderCoils();refresh();toast('Semicircle example restored.');};
$('#arrows-btn').onclick=()=>{state.arrows=!state.arrows;syncInputs();save();draw();};
$('#probe-origin').onclick=()=>{state.probe=[0,0,0];probeChanged();};
$('#view-reset').onclick=()=>{camera={yaw:-.65,pitch:.5};state.extent=16;syncInputs();refresh();};
function probeChanged(){clearResult();syncInputs();save();requestMetrics();if(state.view==='profile')requestProfile();draw();}
$('#optimize-btn').onclick=()=>{optId=++computeId;$('#optimize-btn').disabled=true;$('#optimize-btn').innerHTML='<span>✧</span> Finding currents…';computeWorker.postMessage({kind:'optimize',id:optId,coils:state.coils,probe:state.probe,target:state.target,width:state.width,maxCurrent:state.maxCurrent,bias:state.bias});};
$('#export-btn').onclick=()=>{const m=$('#export-menu');m.hidden=!m.hidden;$('#export-btn').setAttribute('aria-expanded',!m.hidden);};
$('#import-btn').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>1e6)throw new Error('Choose a design file smaller than 1 MB.');state=cleanState(validateDesign(JSON.parse(await f.text())));clearResult();syncInputs();renderCoils();refresh();toast('Design imported.');}catch(err){toast(err.message||'Could not read this design.',true);}e.target.value='';};
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportFile(type){
  if(type==='json'){download(new Blob([JSON.stringify({application:'FluxLab',version:VERSION,exportedAt:new Date().toISOString(),units:{geometry:'cm',wireDiameter:'mm',current:'A',field:'uT'},model:'Free-space DC filaments; coincident turns; copper loss excludes leads.',design:state,measurements:metrics},null,2)],{type:'application/json'}),'fluxlab-design.json');toast('Design exported.');}
  if(type==='csv'){if(!map||map.id!==mapId){toast('Wait for the current field map to finish.',true);return;}let rows=['x_m,y_m,z_m,Bx_uT,By_uT,Bz_uT,magnitude_uT,valid'];for(let y=0;y<map.n;y++)for(let x=0;x<map.n;x++){const p=[0,0,0];p[map.axes[0]]=(-map.extent+2*map.extent*x/(map.n-1))/100;p[map.axes[1]]=(map.extent-2*map.extent*y/(map.n-1))/100;p[map.axes[2]]=map.slice/100;const k=(y*map.n+x)*3,b=[map.data[k],map.data[k+1],map.data[k+2]],valid=Number.isFinite(b[0]);rows.push([...p,...(valid?[...b,Math.hypot(...b),1]:['','','','',0])].join(','));}download(new Blob([rows.join('\n')],{type:'text/csv'}),'fluxlab-field-map.csv');toast('Field map exported with all three components.');}
  if(type==='png'){canvas.toBlob(blob=>{if(blob)download(blob,`fluxlab-${state.view}.png`);});}
}
['#help-btn','#footer-help'].forEach(s=>$(s).onclick=()=>$('#help-dialog').showModal());$('#close-help').onclick=()=>$('#help-dialog').close();$('#help-dialog').onclick=e=>{if(e.target===$('#help-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
canvas.addEventListener('pointerdown',e=>{if(state.view==='geometry'){drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}else if(state.view==='map'&&plot){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;if(x<plot.left||x>plot.left+plot.width||y<plot.top||y>plot.top+plot.height)return;const ax=axesFor(state.plane);state.probe[ax[0]]=+(-state.extent+(x-plot.left)/plot.width*2*state.extent).toFixed(2);state.probe[ax[1]]=+(state.extent-(y-plot.top)/plot.height*2*state.extent).toFixed(2);state.probe[ax[2]]=state.slice;probeChanged();}});
canvas.addEventListener('pointermove',e=>{if(drag){camera.yaw+=(e.clientX-drag.x)*.008;camera.pitch=clamp(camera.pitch+(e.clientY-drag.y)*.008,-1.45,1.45);drag={x:e.clientX,y:e.clientY};draw();}});canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{if(state.view==='geometry'){e.preventDefault();state.extent=clamp(Math.round(state.extent+Math.sign(e.deltaY)),5,50);syncInputs();save();draw();}},{passive:false});
new ResizeObserver(()=>draw()).observe(canvas);syncInputs();renderCoils();refresh();
