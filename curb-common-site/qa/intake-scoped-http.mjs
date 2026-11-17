// Explicitly scoped, synthetic-only acceptance. Never print credentials.
const endpoint='https://zzixmhnmmddilijtqrqs.supabase.co/functions/v1/cc-intake-qa-gateway';
const key=process.env.CC_QA_ANON,proof=process.env.CC_QA_PROOF,id=process.env.CC_QA_FIXTURE;
if(!key||!proof||!id)throw Error('Missing scoped test configuration');
async function post(fixture,token){const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json','X-CC-QA-ID':fixture};if(token)headers['X-CC-QA-Proof']=token;const r=await fetch(endpoint,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(15000)});let body={};try{body=await r.json()}catch{};return {status:r.status,body};}
const denied=await post(id,null);if(![401,403].includes(denied.status))throw Error('Unauthenticated QA request not denied: '+denied.status);console.log('INTAKE PASS no proof denied',denied.status);
const wrong=await post('00000000-0000-4000-8000-000000000000',proof);if(![401,403].includes(wrong.status))throw Error('Wrong fixture not denied: '+wrong.status);console.log('INTAKE PASS wrong fixture denied',wrong.status);
const first=await post(id,proof);if(first.status!==200||!first.body.synthetic||first.body.booking_confirmed!==false||!(/^[a-f0-9-]{36}$/i.test(first.body.receipt_id)))throw Error('Synthetic intake not confirmed: '+first.status+' '+String(first.body.error||''));console.log('INTAKE PASS actual receipt',first.body.receipt_id);
const second=await post(id,proof);if(second.status!==200||second.body.receipt_id!==first.body.receipt_id)throw Error('Intake retry mismatch: '+second.status);console.log('INTAKE PASS idempotent retry',second.body.receipt_id);
