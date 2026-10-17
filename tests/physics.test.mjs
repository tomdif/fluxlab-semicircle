import assert from 'node:assert/strict';
import {newCoil,compile,compileAll,field,unitField,metrics,preset,optimize,validateDesign} from '../src/physics.js';
let checks=0;
function close(actual,expected,rel=1e-7,abs=1e-9){assert.ok(actual!==null);assert.equal(actual.length,expected.length);const error=Math.hypot(...actual.map((x,i)=>x-expected[i]));assert.ok(error<=abs+rel*Math.hypot(...expected),`Expected ${expected}; got ${actual}; error ${error}`);checks++;}
const a=.05,I=10,C=.1*I;
for(const z of [-.2,-.05,0,.03,.5]){
  const c=compile(newCoil(0,{radius:5,current:I,turns:1}));
  close(field([c],[0,0,z]),[0,0,C*2*Math.PI*a*a/(a*a+z*z)**1.5]);
  const arc=compile(newCoil(0,{type:'semi',closed:false,radius:5,current:I,turns:1}));
  close(field([arc],[0,0,z]),[0,C*2*a*z/(a*a+z*z)**1.5,C*Math.PI*a*a/(a*a+z*z)**1.5]);
  if(z!==0){const d=compile(newCoil(0,{type:'semi',closed:true,radius:5,current:I,turns:1}));close(field([d],[0,0,z]),[0,-C*2*a*a*a/(z*(a*a+z*z)**1.5),C*Math.PI*a*a/(a*a+z*z)**1.5]);}
}
// Independent SciPy quadrature reference from the derivation, dimensionless B/C.
const c=compile(newCoil(0,{type:'semi',closed:false,radius:100,current:10,turns:1}));
close(field([c],[.4,.6,.7]),[.84379191,1.81263449,1.53650820],1e-8);
for(const theta of [-Math.PI/6,-Math.PI/2,-5*Math.PI/6]){const expected=C/(2*a)*Math.log(Math.tan((Math.PI-theta)/4)/Math.tan(-theta/4));const ar=compile(newCoil(0,{type:'semi',closed:false,radius:5,current:I,turns:1}));close(field([ar],[a*Math.cos(theta),a*Math.sin(theta),0]),[0,0,expected]);}
// Rotation and translation: XY normal +Z, XZ normal +Y, YZ normal +X.
for(const [plane,axis] of [['xy',2],['xz',1],['yz',0]]){
 const co=compile(newCoil(0,{plane,center:[1,2,3],radius:5,current:2,turns:4}));const exp=[0,0,0];exp[axis]=.1*2*4*2*Math.PI/a;close(field([co],[.01,.02,.03]),exp);
}
const masked=compile(newCoil(0,{radius:5}));assert.equal(field([masked],[.05,0,0]),null);checks++;
assert.equal(field([compile(newCoil(0,{type:'semi',closed:true,radius:5}))],[0,0,0]),null);checks++;
const pair=preset('uniform'),opts={probe:[0,0,0],target:[0,0,100],width:2,maxCurrent:10,bias:0};
const result=optimize(pair,opts);assert.ok(result.converged);assert.ok(result.after.rms<result.before.rms*.01);assert.ok(result.after.rms<.1);checks++;
const bounded=optimize(pair,{...opts,target:[0,0,100000],maxCurrent:.2});assert.ok(bounded.atLimit);assert.ok(bounded.currents.every(c=>Math.abs(c.current)<=.2));checks++;
const zero=optimize(pair,{...opts,target:[0,0,0]});assert.ok(zero.after.magnitude<1e-7);checks++;
const impossible=optimize(pair,{...opts,target:[100,0,0]});assert.ok(impossible.after.rms>=99.999);checks++;
const efficient=optimize(pair,{...opts,bias:100});assert.ok(efficient.after.power<result.after.power);checks++;
assert.throws(()=>optimize([newCoil(0,{type:'semi',closed:true})],{...opts,width:0}));checks++;
assert.throws(()=>validateDesign({coils:[{...newCoil(),radius:NaN}]}));checks++;
// A distant closed loop must recover its dipole field; arc contributions cancel.
const far=compile(newCoil(0,{type:'semi',closed:true,radius:5,current:10,turns:1}));
close(field([far],[0,0,100]),[0,0,C*Math.PI*a*a/100**3],2e-3,1e-12);
console.log(JSON.stringify({passed:checks,optimizer:{beforeRms:result.before.rms,afterRms:result.after.rms,currents:result.currents.map(c=>c.current),power:result.after.power},status:'PASS'},null,2));
