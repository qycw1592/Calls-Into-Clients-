// Protected HTTP acceptance only. Run after Gate B, with disposable synthetic fixtures.
// No service-role key required here. Never use real customers or a live Stripe account.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const env=process.env;
const required=['CC_QA_PUBLISHABLE_KEY','CC_BOOKING_QA_ORIGIN','CC_QA_CUSTOMER_A_JWT','CC_QA_CUSTOMER_B_JWT','CC_QA_QUOTE_A','CC_QA_QUOTE_B','CC_QA_SLOT','CC_QA_AMOUNT_CENTS'];
for(const k of required)assert(env[k], 'Missing '+k);
assert.equal(env.CC_QA_SYNTHETIC_FIXTURES,'true','Explicit synthetic fixture confirmation required');
const endpoint='https://zzixmhnmmddilijtqrqs.supabase.co/functions/v1/cc-booking-actions';
const a=env.CC_QA_CUSTOMER_A_JWT,b=env.CC_QA_CUSTOMER_B_JWT;
assert.notEqual(a,b);assert.notEqual(env.CC_QA_QUOTE_A,env.CC_QA_QUOTE_B);
const qa=env.CC_QA_QUOTE_A,qb=env.CC_QA_QUOTE_B,slot=env.CC_QA_SLOT;
const amount=Number(env.CC_QA_AMOUNT_CENTS);assert(Number.isSafeInteger(amount)&&amount>0);
async function call(token,payload){
 const headers={apikey:env.CC_QA_PUBLISHABLE_KEY,Origin:env.CC_BOOKING_QA_ORIGIN,'Content-Type':'application/json'};
 if(token)headers.Authorization='Bearer '+token;
 const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
 return {status:r.status,body:await r.json()};
}
const list=quote_id=>({action:'list_slots',quote_id});
const hold=(quote_id,request_id)=>({action:'hold',quote_id,slot_id:slot,request_id});
const denied=await call(null,list(qa));assert([401,403].includes(denied.status));console.log('PASS anonymous denial');
for(const [token,quote] of [[a,qa],[b,qb]]){
 const r=await call(token,list(quote));assert.equal(r.status,200);assert(Array.isArray(r.body));assert(r.body.some(x=>x.slot_id===slot),'Both synthetic quotes must initially be eligible for the same slot');
}
const cross=await call(b,list(qa));assert(cross.status===403||(cross.status===200&&Array.isArray(cross.body)&&cross.body.length===0));console.log('PASS real availability and cross-account denial');
const tampered=await call(a,{...hold(qa,randomUUID()),amount_cents:1});assert.equal(tampered.status,400);console.log('PASS browser amount rejected');
const ra=randomUUID(),rb=randomUUID();
const results=await Promise.all([call(a,hold(qa,ra)),call(b,hold(qb,rb))]);
assert.equal(results.filter(r=>r.status===200).length,1,'Exactly one competing hold must succeed');
const i=results.findIndex(r=>r.status===200),winner=results[i].body;
assert.equal(results[1-i].status,409);
assert.equal(winner.quote_id,i===0?qa:qb);assert.equal(winner.slot_id,slot);
assert.equal(winner.amount_cents,amount);assert.equal(winner.booking_confirmed,false);assert.equal(winner.payment_enabled,false);
assert(Date.parse(winner.held_until)>Date.now());
const retry=await call(i===0?a:b,hold(i===0?qa:qb,i===0?ra:rb));assert.equal(retry.status,200);assert.deepEqual(retry.body,winner);
console.log('PASS competing holds, authoritative amount, idempotent receipt');
console.log('HTTP acceptance only; owner/backend lane must verify persisted fixture state and clean it up before marking Gate C passed.');
