import assert from 'node:assert/strict';
import {compile,newCoil,unitField,optimize} from '../src/physics.js';
import {ellipticFE,analyticField,verificationSuite} from '../src/analytic.js';
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
let checks=0;
for(const t of [-4,-Math.PI,0,.25,Math.PI,4]){const v=ellipticFE(t,0);near(v.F,t);near(v.E,t);checks++;}
const arc=compile(newCoil(0,{radius:5,current:10,turns:1,type:'semi',closed:false}));
const p=[0,0,.05],b=analyticField(arc,p).b;near(b[0],0);near(b[1],14.1421356237);near(b[2],22.2144146908);checks++;
const dloop=compile(newCoil(0,{radius:5,current:10,turns:1,type:'semi',closed:true}));
near(analyticField(dloop,p).b[1],-14.1421356237);checks++;
near(analyticField(arc,[0,0,0]).b[2],Math.PI*20);checks++;
assert.equal(analyticField(dloop,[0,0,0]).b,null);checks++;
for(const theta of [-2.8,-Math.PI/2,-.3]){const point=[.05*Math.cos(theta),.05*Math.sin(theta),0],a=analyticField(arc,point).b,n=unitField(arc,point,{tolerance:1e-11}).map(v=>v*10);a.forEach((v,i)=>near(v,n[i]));checks++;}
const r=verificationSuite();assert.equal(r.passed,100,JSON.stringify(r.failures));checks+=r.total;
const raw=newCoil(0,{radius:5,current:10,turns:1,type:'semi',closed:false});
const fit=optimize([raw],{probe:[0,0,5],target:[0,0,100],width:2,maxCurrent:10,bias:0});
assert.equal(fit.initialFeasible,true);assert.ok(fit.after.rms<=fit.before.rms+1e-8);checks++;
const constrained=optimize([raw],{probe:[0,0,5],target:[0,0,100],width:2,maxCurrent:1,bias:0});assert.equal(constrained.initialFeasible,false);checks++;
console.log(`${checks} analytic and regression checks passed; max relative difference ${r.maxRelative.toExponential(3)}.`);
