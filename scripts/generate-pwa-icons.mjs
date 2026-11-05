// Build-time app icons. Reuses the Motyq M/speed-mark visual language.
// Pure Node.js PNG encoder: no external image service, credentials or dependencies.
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateSync} from 'node:zlib';

const table=Array.from({length:256},(_,n)=>{
 let c=n;for(let i=0;i<8;i++)c=c&1?(0xedb88320^(c>>>1)):(c>>>1);
 return c>>>0;
});
const crc32=data=>{
 let crc=0xffffffff;
 for(const b of data)crc=table[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
};
const chunk=(type,data)=>{
 const head=Buffer.from(type,'ascii');
 const result=Buffer.alloc(12+data.length);
 result.writeUInt32BE(data.length,0);head.copy(result,4);data.copy(result,8);
 result.writeUInt32BE(crc32(Buffer.concat([head,data])),8+data.length);
 return result;
};
const clamp=x=>Math.max(0,Math.min(1,x));
const distance=(x,y,ax,ay,bx,by)=>{
 const dx=bx-ax,dy=by-ay;
 const t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy));
 return Math.hypot(x-(ax+t*dx),y-(ay+t*dy));
};
const alphaLine=(x,y,a,b,r,soft)=>clamp((r+soft-distance(x,y,...a,...b))/(2*soft));
const overlay=(base,ink,alpha)=>[
 Math.round(base[0]*(1-alpha)+ink[0]*alpha),
 Math.round(base[1]*(1-alpha)+ink[1]*alpha),
 Math.round(base[2]*(1-alpha)+ink[2]*alpha)
];
const roundRect=(x,y,min,max,r)=>{
 if(x<min||x>max||y<min||y>max)return false;
 const cx=Math.min(Math.max(x,min+r),max-r);
 const cy=Math.min(Math.max(y,min+r),max-r);
 return Math.hypot(x-cx,y-cy)<=r;
};
export function createMotyqPng(size,{maskable=false}={}){
 if(!Number.isInteger(size)||size<96||size>1024)throw Error('unsupported icon dimensions');
 const pixels=Buffer.alloc((size*3+1)*size);
 const scale=maskable?.69:1;
 const soft=1/size;
 for(let y=0;y<size;y++){
  const offset=y*(size*3+1);pixels[offset]=0;
  for(let x=0;x<size;x++){
   const nx=(x+.5)/size,ny=(y+.5)/size;
   const u=(nx-.5)/scale+.5,v=(ny-.5)/scale+.5;
   let rgb=maskable?[18,36,58]:[243,248,251];
   if(roundRect(u,v,.05,.95,.18)){
    rgb=[20,30,45];
    let silver=0;
    for(const [a,b] of [
      [[.29,.73],[.29,.30]],[[.29,.30],[.50,.52]],
      [[.50,.52],[.71,.30]],[[.71,.30],[.71,.73]]
    ])silver=Math.max(silver,alphaLine(u,v,a,b,.040,soft*1.5));
    rgb=overlay(rgb,[222,232,241],silver);
    let blue=0;
    for(let i=0;i<3;i++){
     const yy=.65+i*.065;
     blue=Math.max(blue,alphaLine(u,v,[.13,yy],[.245-i*.014,yy],.011,soft*1.5));
    }
    rgb=overlay(rgb,[13,174,229],blue);
   }
   const j=offset+1+x*3;
   pixels[j]=rgb[0];pixels[j+1]=rgb[1];pixels[j+2]=rgb[2];
  }
 }
 const ihdr=Buffer.alloc(13);
 ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);
 ihdr[8]=8;ihdr[9]=2; // RGB, no transparency
 const signature=Buffer.from('89504e470d0a1a0a','hex');
 return Buffer.concat([signature,chunk('IHDR',ihdr),
   chunk('IDAT',deflateSync(pixels,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
export function generateIcons(outDir=resolve(process.cwd(),'public/icons')){
 mkdirSync(outDir,{recursive:true});
 for(const {size,name,maskable} of [
  {size:192,name:'motyq-iq-192.png',maskable:false},
  {size:512,name:'motyq-iq-512.png',maskable:false},
  {size:512,name:'motyq-iq-maskable-512.png',maskable:true}
 ]){
  writeFileSync(resolve(outDir,name),createMotyqPng(size,{maskable}));
  console.log('PWA icon: '+name);
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 generateIcons();
