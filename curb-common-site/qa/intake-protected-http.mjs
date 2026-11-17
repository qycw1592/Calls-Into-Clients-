// Server-only acceptance runner. Never copy to dist or use in a browser.
import { randomUUID } from 'node:crypto';
const base='https://zzixmhnmmddilijtqrqs.supabase.co';
const service=process.env.CC_QA_SERVICE_ROLE_KEY;
const anon=process.env.CC_QA_PUBLISHABLE_KEY;
const owner=process.env.CC_QA_SYNTHETIC_STAFF_JWT;
if(!service||!anon||!owner||service===owner) throw new Error('Protected QA credentials missing; no request made');
const id=randomUUID();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const call=async(path,options)=>fetch(base+path,{...options,signal:AbortSignal.timeout(15000)});
const headers={apikey:service,Authorization:'Bearer '+service,'X-CC-QA-ID':id};
let receipt;
try {
  const denied=await call('/functions/v1/cc-intake-qa-gateway',{method:'POST',headers:{'X-CC-QA-ID':id}});
  if(![401,403].includes(denied.status)) throw new Error('Unauthenticated gateway did not deny: '+denied.status);
  const submit=()=>call('/functions/v1/cc-intake-qa-gateway',{method:'POST',headers});
  const r=await submit();
  if(r.status!==200) throw new Error('Gateway HTTP '+r.status);
  const body=await r.json();
  if(!uuid.test(body.receipt_id)||body.synthetic!==true||body.booking_confirmed!==false) throw new Error('Invalid synthetic receipt');
  receipt=body.receipt_id;
  console.log('Synthetic receipt:',receipt,'request:',id);
  const retry=await submit();
  if(retry.status!==200||(await retry.json()).receipt_id!==receipt) throw new Error('Idempotent retry failed');
  const path='/rest/v1/leads?select=id,status,email&id=eq.'+receipt;
  for(const [label,key,token] of [['database',service,service],['staff',anon,owner]]) {
    const res=await call(path,{headers:{apikey:key,Authorization:'Bearer '+token}});
    if(res.status!==200) throw new Error(label+' HTTP '+res.status);
    const rows=await res.json();
    if(rows.length!==1||rows[0].id!==receipt||rows[0].email!=='cc-gateway-qa@example.invalid'||rows[0].status!=='new') throw new Error(label+' receipt mismatch');
    console.log(label+' retrieval PASS');
  }
  console.log('PASS: protected HTTP, receipt, retry, persistence, staff retrieval');
} finally {
  // Database lane cleans up the exact synthetic receipt and request ledger via SQL.
  // Do not delete through REST: ledger dependencies must be handled together.
  console.log('Cleanup required: synthetic request',id,'receipt',receipt||'unknown');
}
