const proof=process.env.CC_ROUND1_PROOF,key=process.env.CC_ROUND1_ANON;
if(!proof||!key)throw Error('Missing scoped QA config');
const url='https://zzixmhnmmddilijtqrqs.supabase.co/functions/v1/cc-intake-qa-gateway';
const denied=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key}});if(![401,403].includes(denied.status))throw Error('Round1 uncredentialed request not denied');console.log('ROUND1 unauthorized denied',denied.status);
const r=await fetch(url,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'X-CC-QA-Proof':proof},signal:AbortSignal.timeout(100000)});const d=await r.json();console.log('ROUND1 result',JSON.stringify(d));if(r.status!==200)throw Error('Round1 acceptance incomplete '+r.status);
