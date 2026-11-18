// Existing disposable users only. No passwords, tokens, or customer data logged.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const env=process.env,base='https://zzixmhnmmddilijtqrqs.supabase.co';
assert.equal(env.CC_QA_SYNTHETIC_FIXTURES,'true');
const key=env.CC_QA_PUBLISHABLE_KEY, origin=env.CC_BOOKING_QA_ORIGIN;
const oldA='ca6ebb1b-7a02-49dc-99c7-a646fb76a5cc',oldB='ed5295d3-65ab-4b44-8b45-39bdf8dee997',oldSlot='9f240000-0000-4000-8000-000000000004',oldRequest='d56884ae-d0ef-4851-be78-37ee2012a8e6';
async function login(role){const email=env['CC_QA_'+role+'_EMAIL'];assert.match(email,/@example\.invalid$/);const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password:env['CC_QA_'+role+'_PASSWORD']}),signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return(await r.json()).access_token;}
async function call(endpoint,token,payload){const r=await fetch(base+'/functions/v1/'+endpoint,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};}
const [staff,a,b]=await Promise.all(['STAFF','CUSTOMER','OTHER'].map(login));
const hold=(quote_id,slot_id,request_id)=>({action:'hold',quote_id,slot_id,request_id});
const replay=await call('cc-booking-actions',b,hold(oldB,oldSlot,oldRequest));assert.equal(replay.status,200,'existing hold replay');assert.equal(replay.body.amount_cents,2345);assert.equal(replay.body.quote_id,oldB);assert.equal(replay.body.slot_id,oldSlot);
const conflict=await call('cc-booking-actions',a,hold(oldA,oldSlot,randomUUID()));assert.equal(conflict.status,409,'explicit held-slot conflict');console.log('PASS actual replay 200 and unavailable slot 409');
const quotes=[];for(const [property,amount] of [[env.CC_QA_PROPERTY_ID,1234],[env.CC_QA_PROPERTY_B_ID,2345]]){const q=await call('cc-portal-actions',staff,{action:'approve_quote',property_id:property,service:'pet',amount_cents:amount,expires_at:new Date(Date.now()+86400000).toISOString(),request_id:randomUUID()});assert.equal(q.status,200);assert.match(q.body.receipt_id,/^[a-f0-9-]{36}$/i);quotes.push(q.body.receipt_id);}
console.log('NEW synthetic race quotes',quotes.join(','));
Object.assign(env,{CC_QA_QUOTE_A:quotes[0],CC_QA_QUOTE_B:quotes[1],CC_QA_SLOT:'9f240000-0000-4000-8000-000000000005',CC_QA_AMOUNT_CENTS:'1234',CC_QA_AMOUNT_B_CENTS:'2345'});
await import('./booking-protected-http.mjs');
