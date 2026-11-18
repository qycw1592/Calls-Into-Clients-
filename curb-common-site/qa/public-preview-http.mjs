// Verify the existing public preview before publishing another build; no customer data.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='https://curb-common-preview.onrender.com';
const nonce=Date.now().toString(36);
const paths=['index.html','design-preview.css','auth.js','intake.js','portal.js','booking.js','booking-availability.js','assets/hero.jpg','assets/service-cleanout.webp','assets/service-pet.webp','assets/service-exterior.webp','assets/service-valet.webp','assets/service-windows.webp'];
let failed=0;
for(const path of paths){
 try{
  const r=await fetch(base+'/'+path+'?ccqa='+nonce,{redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store',headers:{'Cache-Control':'no-cache','Accept-Encoding':'identity'}});
  const actual=Buffer.from(await r.arrayBuffer()),expected=await readFile('dist/'+path);
  if(r.status!==200||!actual.equals(expected))throw Error('status='+r.status+' bytes='+actual.length+' expected='+expected.length);
  if(path==='index.html'&&!/noindex/i.test(actual.toString('utf8')))throw Error('missing noindex');
  console.log('PUBLIC PASS',path,r.status,actual.length,createHash('sha256').update(actual).digest('hex'));
 }catch(e){failed++;console.log('PUBLIC FAIL',path,String(e.message).slice(0,140));}
}
for(const path of ['server/portal-actions.ts','qa/intake-protected-http.mjs','assets/hero.jpg.b64','assets/windows.jpg','assets/cleanout.png']){
 try{const r=await fetch(base+'/'+path+'?ccqa='+nonce,{redirect:'error',signal:AbortSignal.timeout(12000),cache:'no-store',headers:{'Cache-Control':'no-cache','Accept-Encoding':'identity'}});const bytes=Buffer.from(await r.arrayBuffer());if(r.status!==404)throw Error('status='+r.status+' type='+r.headers.get('content-type')+' bytes='+bytes.length+' sha256='+createHash('sha256').update(bytes).digest('hex'));console.log('PRIVATE PASS',path,r.status);}
 catch(e){failed++;console.log('PRIVATE FAIL',path,String(e.message).slice(0,140));}
}
console.log('C&C public acceptance:',failed===0?'PASS':'INCOMPLETE ('+failed+' checks failed)');
if(failed)process.exitCode=1;
