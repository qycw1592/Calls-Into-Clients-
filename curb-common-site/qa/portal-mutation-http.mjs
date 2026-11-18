// Synthetic-only HTTP acceptance; never publish in dist. Backend owner cleans exact fixtures.
import assert from 'node:assert/strict';
const env=k=>{const v=process.env[k];if(!v)throw Error('Missing '+k);return v};
const base='https://zzixmhnmmddilijtqrqs.supabase.co',key=env('CC_QA_PUBLISHABLE_KEY'),origin=env('CC_PORTAL_QA_ORIGIN');
const property='9f240000-0000-4000-8000-000000000001',lead='9f240000-0000-4000-8000-000000000003',message='CC-QA-PORTAL-MUTATION-20261117';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function login(role){const email=env('CC_QA_'+role+'_EMAIL');assert.match(email,/@example\.invalid$/);const r=await fetch(base+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email,password:env('CC_QA_'+role+'_PASSWORD')}),signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,role+' login');return (await r.json()).access_token;}
async function action(token,body,status){const r=await fetch(base+'/functions/v1/cc-portal-actions',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});assert.equal(r.status,status,body.action);return r.json();}
async function rows(token,table,query){const r=await fetch(base+'/rest/v1/'+table+'?'+query,{headers:{apikey:key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(r.status===403)return [];assert.equal(r.status,200);return r.json();}
const staff=await login('STAFF'),customer=await login('CUSTOMER'),other=await login('OTHER');
const request={action:'request_service',property_id:property,message},change={action:'lead_status',lead_id:lead,expected:'new',next:'reviewing'};
assert.equal((await rows(staff,'leads','select=id,status&id=eq.'+lead))[0]?.status,'new','fixture prerequisite');
await action(other,request,403);await action(staff,request,403);await action(customer,{...request,message:'unapproved marker'},403);await action(customer,change,403);
const result=await action(customer,request,200);assert.match(result.receipt_id,uuid);console.log('Synthetic request receipt='+result.receipt_id);assert.equal(result.booking_confirmed,false);
const query='select=id,property_id,message&id=eq.'+result.receipt_id;
const own=await rows(customer,'service_requests',query);assert.equal(own.length,1);assert.equal(own[0].property_id,property);assert.equal(own[0].message,message);assert.equal((await rows(other,'service_requests',query)).length,0);
await action(staff,change,200);assert.equal((await rows(staff,'leads','select=id,status&id=eq.'+lead))[0]?.status,'reviewing');await action(staff,change,409);
console.log('PASS scoped service request, persistence, isolation, staff lead transition and stale replay; backend cleanup required');
