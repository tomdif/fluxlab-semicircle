import {compile,unitField,distanceToWire,newCoil} from './physics.js';
// Independent evaluation of the closed-form elliptic representation.
// F and E are evaluated from their defining integrals by adaptive Simpson.
function simpson(f,a,b,tol=2e-12){
  if(a===b)return 0;
  const fa=f(a),fb=f(b),m=(a+b)/2,fm=f(m),s=(b-a)*(fa+4*fm+fb)/6;
  function step(a,b,fa,fm,fb,s,tol,depth){
    const m=(a+b)/2,l=(a+m)/2,r=(m+b)/2,fl=f(l),fr=f(r);
    const sl=(m-a)*(fa+4*fl+fm)/6,sr=(b-m)*(fm+4*fr+fb)/6,delta=sl+sr-s;
    if(depth===0||Math.abs(delta)<15*tol)return sl+sr+delta/15;
    return step(a,m,fa,fl,fm,sl,tol/2,depth-1)+step(m,b,fm,fr,fb,sr,tol/2,depth-1);
  }
  return step(a,b,fa,fm,fb,s,tol,24);
}
function amplitudeIntegral(t,f){
  if(t===0)return 0;const s=Math.sign(t),b=Math.abs(t);let value=0;
  for(let lo=0;lo<b;){const hi=Math.min(b,lo+Math.PI/2);value+=simpson(f,lo,hi);lo=hi;}return s*value;
}
export function ellipticFE(t,m){return {F:amplitudeIntegral(t,u=>1/Math.sqrt(1-m*Math.sin(u)**2)),E:amplitudeIntegral(t,u=>Math.sqrt(1-m*Math.sin(u)**2))};}
export function analyticField(c,p){
  if(distanceToWire(c,p)<=c.wireRadius)return {b:null,reason:'Probe is inside the excluded conductor region.'};
  const r=p.map((v,i)=>v-c.c[i]),dot=v=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2];
  const x=dot(c.u),y=dot(c.v),z=dot(c.n),a=c.a,rho=Math.hypot(x,y),theta=Math.atan2(y,x),C=.1*c.turns*c.current;
  let b;
  if(rho===0){const den=(a*a+z*z)**1.5;b=c.type==='circle'?[0,0,C*2*Math.PI*a*a/den]:[0,C*2*a*z/den,C*Math.PI*a*a/den];}
  else if(z===0&&Math.abs(rho-a)<1e-14*a&&c.type==='semi'&&y<0){b=[0,0,C/(2*a)*Math.log(Math.tan((Math.PI-theta)/4)/Math.tan(-theta/4))];}
  else{
    const S=a*a+rho*rho+z*z,d=Math.hypot(a+rho,z),q=(a-rho)**2+z*z,m=4*a*rho/(d*d);
    if(q/(d*d)<1e-9||rho/a<1e-7)return {b:null,reason:'Elliptic evaluation is ill-conditioned here. Move the probe slightly; the field map uses direct integration.'};
    const t0=-(Math.PI+theta)/2,t1=((c.type==='circle'?2*Math.PI:Math.PI)-theta-Math.PI)/2;
    const f0=ellipticFE(t0,m),f1=ellipticFE(t1,m),h=(t,e)=>e-m*Math.sin(t)*Math.cos(t)/Math.sqrt(1-m*Math.sin(t)**2);
    const J1=2/d*(f1.F-f0.F),J3=2/(d*q)*(h(t1,f1.E)-h(t0,f0.E));
    const Rp=Math.hypot(x-a,y,z),Rm=c.type==='circle'?Rp:Math.hypot(x+a,y,z);
    const br=C*z/(2*rho)*(S*J3-J1),bt=C*z/rho*(1/Rp-1/Rm),bz=C/2*(J1+(a*a-rho*rho-z*z)*J3);
    b=[br*x/rho-bt*y/rho,br*y/rho+bt*x/rho,bz];
  }
  if(c.type==='semi'&&c.closed){const s2=y*y+z*z;if(s2>1e-30){const f=C*((x+a)/Math.hypot(x+a,y,z)-(x-a)/Math.hypot(x-a,y,z))/s2;b[1]-=z*f;b[2]+=y*f;}}
  return {b:c.u.map((_,i)=>c.u[i]*b[0]+c.v[i]*b[1]+c.n[i]*b[2]),reason:'Closed-form representation evaluated numerically.'};
}
export function verificationSuite(){
  let seed=17659;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};let passed=0,maxRelative=0,maxAbsolute=0;const failures=[];
  for(let i=0;i<100;i++){
    const c=compile(newCoil(0,{type:i%3===0?'circle':'semi',closed:i%3===2,plane:['xy','xz','yz'][i%3],rotation:i%4*21,radius:5,current:10,turns:1}));
    const p=Array.from({length:3},()=>.3*(rand()-.5));
    const n=unitField(c,p,{tolerance:1e-10}),a=analyticField(c,p);if(!n||!a.b){failures.push({i,reason:a.reason});continue;}
    const numeric=n.map(v=>v*c.current),abs=Math.hypot(...numeric.map((v,j)=>v-a.b[j])),rel=abs/Math.max(Math.hypot(...numeric),1e-12);
    maxRelative=Math.max(maxRelative,rel);maxAbsolute=Math.max(maxAbsolute,abs);
    if(abs<1e-7+Math.hypot(...numeric)*1e-7)passed++;else failures.push({i,p,numeric,analytic:a.b,rel});
  }
  return {passed,total:100,maxRelative,maxAbsolute,failures};
}
