import {compileAll,field,metrics,optimize} from './physics.js';
self.onmessage=e=>{
  const {kind,id,coils,probe,target,width,...options}=e.data;
  try{
    if(kind==='optimize'){self.postMessage({kind,id,result:optimize(coils,{probe,target,width,...options})});return;}
    const cs=compileAll(coils);
    if(kind==='metrics'){self.postMessage({kind,id,result:metrics(cs,probe,target,width)});return;}
    if(kind==='map'){
      const {plane,slice,extent,n}=options,axes=plane==='xy'?[0,1,2]:plane==='xz'?[0,2,1]:[1,2,0];
      const data=new Float64Array(n*n*3),pixel=2*extent/100/(n-1);
      for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const p=[0,0,0];p[axes[0]]=(-extent+2*extent*x/(n-1))/100;p[axes[1]]=(extent-2*extent*y/(n-1))/100;p[axes[2]]=slice/100;
        const b=field(cs,p,{mask:pixel*.3,tolerance:1e-6});const k=(y*n+x)*3;
        data[k]=b?b[0]:NaN;data[k+1]=b?b[1]:NaN;data[k+2]=b?b[2]:NaN;
      }
      self.postMessage({kind,id,data,n,axes,plane,slice,extent},[data.buffer]);return;
    }
    if(kind==='profile'){
      const {extent,n=201}=options,data=[];
      for(let i=0;i<n;i++){const z=-extent+2*extent*i/(n-1),b=field(cs,[probe[0]/100,probe[1]/100,z/100]);data.push({z,b});}
      self.postMessage({kind,id,data});
    }
  }catch(err){self.postMessage({kind,id,error:err.message});}
};
