// FluxLab: SI internally, UI coordinates in cm, returned fields in microtesla.
export const VERSION = '1.1.0';
const GLX = [-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const GLW = [.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const norm=a=>Math.hypot(...a);
const plus=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const colors=['#f6ac69','#52d6c7','#b59af8','#f183a1','#7fb6ff','#e3dc85'];
export function newCoil(i=0,overrides={}) {return {id:Math.random().toString(36).slice(2,10),name:`Coil ${i+1}`,type:'circle',closed:true,enabled:true,radius:8,current:1,turns:10,wire:1,center:[0,0,0],plane:'xy',rotation:0,color:colors[i%colors.length],...overrides};}
export function preset(key) {
  if(key==='dloop') return [newCoil(0,{name:'Semicircular loop',type:'semi',radius:5,current:10,turns:1,center:[0,0,0]})];
  if(key==='gradient') return [newCoil(0,{name:'Upper coil',center:[0,0,4],current:1}),newCoil(1,{name:'Lower coil',center:[0,0,-4],current:-1})];
  if(key==='shaper') return [newCoil(0,{name:'Axial upper',center:[0,0,4]}),newCoil(1,{name:'Axial lower',center:[0,0,-4]}),newCoil(2,{name:'X correction',plane:'yz',radius:10,current:.35}),newCoil(3,{name:'Y correction',plane:'xz',radius:12,current:-.25})];
  return [newCoil(0,{name:'Upper coil',center:[0,0,4]}),newCoil(1,{name:'Lower coil',center:[0,0,-4]})];
}
function panel(lo,hi){
  const mid=(lo+hi)/2,h=(hi-lo)/2;
  return {lo,hi,c:GLX.map(x=>Math.cos(mid+h*x)),s:GLX.map(x=>Math.sin(mid+h*x)),w:GLW.map(w=>w*h),children:null};
}
function basis(coil){
  const [u,v,n]=coil.plane==='xz'?[[1,0,0],[0,0,-1],[0,1,0]]:coil.plane==='yz'?[[0,1,0],[0,0,1],[1,0,0]]:[[1,0,0],[0,1,0],[0,0,1]];
  const t=coil.rotation*Math.PI/180,co=Math.cos(t),si=Math.sin(t);
  return {u:u.map((x,i)=>x*co+v[i]*si),v:v.map((x,i)=>-u[i]*si+x*co),n};
}
export function compile(coil){
  const length=(coil.type==='circle'?2*Math.PI:Math.PI+(coil.closed?2:0))*coil.radius/100*coil.turns;
  const end=coil.type==='circle'?2*Math.PI:Math.PI,count=coil.type==='circle'?8:4;
  return {...coil,...basis(coil),a:coil.radius/100,c:coil.center.map(x=>x/100),wireRadius:coil.wire/2000,
    resistance:1.68e-8*length/(Math.PI*(coil.wire/2000)**2),length,
    panels:Array.from({length:count},(_,i)=>panel(end*i/count,end*(i+1)/count))};
}
export const compileAll=coils=>coils.filter(c=>c.enabled).map(compile);
function local(c,p){const r=p.map((x,i)=>x-c.c[i]);return [dot(r,c.u),dot(r,c.v),dot(r,c.n)];}
export function distanceToWire(c,p){
  const [x,y,z]=local(c,p),a=c.a;
  let d=c.type==='circle'||y>=0?Math.hypot(Math.hypot(x,y)-a,z):Math.min(Math.hypot(x-a,y,z),Math.hypot(x+a,y,z));
  if(c.type==='semi'&&c.closed)d=Math.min(d,Math.hypot(x-clamp(x,-a,a),y,z));
  return d;
}
function quadrature(p,x,y,z,a){
  let bx=0,by=0,bz=0;
  for(let i=0;i<8;i++){
    const dx=x-a*p.c[i],dy=y-a*p.s[i],r2=dx*dx+dy*dy+z*z,w=p.w[i]/(r2*Math.sqrt(r2));
    bx+=w*z*p.c[i];by+=w*z*p.s[i];bz+=w*(a-x*p.c[i]-y*p.s[i]);
  }
  return [a*bx,a*by,a*bz];
}
function integrate(p,x,y,z,a,coarse,tol,depth=0){
  if(!p.children){const mid=(p.lo+p.hi)/2;p.children=[panel(p.lo,mid),panel(mid,p.hi)];}
  const l=quadrature(p.children[0],x,y,z,a),r=quadrature(p.children[1],x,y,z,a),fine=plus(l,r);
  const err=Math.hypot(fine[0]-coarse[0],fine[1]-coarse[1],fine[2]-coarse[2]);
  if(depth>=12||err<tol*norm(fine)+1e-10/a) return fine;
  return plus(integrate(p.children[0],x,y,z,a,l,tol,depth+1),integrate(p.children[1],x,y,z,a,r,tol,depth+1));
}
// Field per ampere, including turns. Wire interior is excluded, not softened.
export function unitField(c,p,{mask=0,tolerance=2e-7}={}){
  if(distanceToWire(c,p)<=Math.max(c.wireRadius,mask))return null;
  const [x,y,z]=local(c,p),a=c.a;let b=[0,0,0];
  for(const pan of c.panels)b=plus(b,integrate(pan,x,y,z,a,quadrature(pan,x,y,z,a),tolerance));
  if(c.type==='semi'&&c.closed){
    const s2=y*y+z*z;
    if(s2>1e-30){const f=((x+a)/Math.hypot(x+a,y,z)-(x-a)/Math.hypot(x-a,y,z))/s2;b[1]-=z*f;b[2]+=y*f;}
  }
  return c.u.map((_,i)=>.1*c.turns*(c.u[i]*b[0]+c.v[i]*b[1]+c.n[i]*b[2]));
}
export function field(compiled,p,options={}){
  let b=[0,0,0];
  for(const c of compiled){const v=unitField(c,p,options);if(!v)return null;for(let j=0;j<3;j++)b[j]+=c.current*v[j];}
  return b;
}
export function wirePoints(c,count=100){
  const end=c.type==='circle'?2*Math.PI:Math.PI;
  const points=Array.from({length:count+1},(_,i)=>{const t=end*i/count;return c.c.map((x,j)=>x+c.a*(c.u[j]*Math.cos(t)+c.v[j]*Math.sin(t)));});
  if(c.type==='semi'&&c.closed)points.push(points[0]);
  return points;
}
export function regionPoints(probe,width){
  const s=width/200;
  if(s===0)return [probe.map(x=>x/100)];
  const pts=[];for(const x of [-s,0,s])for(const y of [-s,0,s])for(const z of [-s,0,s])pts.push([probe[0]/100+x,probe[1]/100+y,probe[2]/100+z]);return pts;
}
export function metrics(compiled,probe,target,width){
  const points=regionPoints(probe,width),b=field(compiled,probe.map(x=>x/100));let err=0,valid=0,maxerr=0;
  for(const p of points){const v=field(compiled,p);if(!v)continue;const e=norm(v.map((x,j)=>x-target[j]));err+=e*e;maxerr=Math.max(maxerr,e);valid++;}
  return {b,magnitude:b?norm(b):null,rms:valid?Math.sqrt(err/valid):null,maxerr,power:compiled.reduce((s,c)=>s+c.current*c.current*c.resistance,0),valid,total:points.length};
}
// Box-constrained convex quadratic optimization by coordinate descent.
// Objective: mean ||B-target||^2 + beta * copper loss.
export function optimize(coils,{probe,target,width,maxCurrent,bias}){
  const cs=compileAll(coils),points=regionPoints(probe,width),n=cs.length;
  if(!n)throw new Error('Enable at least one coil.');
  const A=[],b=[];
  for(const p of points){const units=cs.map(c=>unitField(c,p));if(units.some(v=>!v))throw new Error('The target region intersects a wire. Move or shrink the region.');for(let k=0;k<3;k++){A.push(units.map(v=>v[k]));b.push(target[k]);}}
  const G=Array.from({length:n},()=>Array(n).fill(0)),h=Array(n).fill(0);
  for(let row=0;row<A.length;row++)for(let i=0;i<n;i++){h[i]+=A[row][i]*b[row]/points.length;for(let j=0;j<n;j++)G[i][j]+=A[row][i]*A[row][j]/points.length;}
  const targetScale=Math.max(norm(target),1),powerScale=Math.max(cs.reduce((s,c)=>s+c.resistance*maxCurrent*maxCurrent,0),1e-12);
  const beta=(bias/100)*targetScale*targetScale/powerScale;
  for(let i=0;i<n;i++)G[i][i]+=beta*cs[i].resistance;
  const initialFeasible=cs.every(c=>Math.abs(c.current)<=maxCurrent+1e-12);
  const currents=cs.map(c=>clamp(c.current,-maxCurrent,maxCurrent));let iterations=0,converged=false;
  for(;iterations<10000;iterations++){
    let maxChange=0;
    for(let i=0;i<n;i++){
      if(G[i][i]<1e-24){currents[i]=0;continue;}
      let rhs=h[i];for(let j=0;j<n;j++)if(j!==i)rhs-=G[i][j]*currents[j];
      const next=clamp(rhs/G[i][i],-maxCurrent,maxCurrent);maxChange=Math.max(maxChange,Math.abs(next-currents[i]));currents[i]=next;
    }
    if(maxChange<1e-10*Math.max(1,maxCurrent)){converged=true;break;}
  }
  const before=metrics(cs,probe,target,width);cs.forEach((c,i)=>c.current=currents[i]);const after=metrics(cs,probe,target,width);
  return {currents:cs.map((c,i)=>({id:c.id,current:currents[i]})),before,after,iterations:iterations+1,converged,beta,initialFeasible,atLimit:currents.some(x=>Math.abs(x)>=maxCurrent-1e-7),samples:points.length};
}
export function validateDesign(obj){
  const s=obj.design??obj;
  if(!s||!Array.isArray(s.coils)||s.coils.length<1||s.coils.length>6)throw new Error('Choose a FluxLab design with 1–6 coils.');
  const number=(x,min,max)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
  for(const c of s.coils){
    if(!['circle','semi'].includes(c.type)||!['xy','xz','yz'].includes(c.plane)||!number(c.radius,.5,100)||!number(c.current,-100,100)||!number(c.turns,1,1000)||!Number.isInteger(c.turns)||!number(c.wire,.05,10)||!number(c.rotation,-360,360)||!Array.isArray(c.center)||c.center.length!==3||!c.center.every(x=>number(x,-100,100))||typeof c.enabled!=='boolean'||typeof c.closed!=='boolean')throw new Error('The file contains invalid coil settings.');
  }
  return s;
}
