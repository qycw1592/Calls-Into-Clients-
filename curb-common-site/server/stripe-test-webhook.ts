// Test-only Stripe webhook. JWT is not used here: verified raw-body Stripe HMAC is mandatory.
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
Deno.serve(async(req)=>{
if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
const secret=Deno.env.get("CC_STRIPE_TEST_WEBHOOK_SECRET"),key=Deno.env.get("CC_STRIPE_TEST_SECRET_KEY"),base=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if(Deno.env.get("CC_STRIPE_QA_ENABLED")!=="true"||Deno.env.get("CC_PORTAL_RELEASE")==="true"||!secret?.startsWith("whsec_")||!key?.startsWith("sk_test_")||!base||!service)return reply(503,{error:"unavailable"});
try{
const header=req.headers.get("Stripe-Signature")||"",parts=header.split(",").map(x=>x.trim()),timestamps=parts.filter(x=>/^t=\d{10}$/.test(x)),sigs=parts.filter(x=>/^v1=[a-f0-9]{64}$/i.test(x)).slice(0,8);
if(timestamps.length!==1||!sigs.length)return reply(400,{error:"invalid_signature"});
const stamp=timestamps[0].slice(2);if(Math.abs(Math.floor(Date.now()/1000)-Number(stamp))>300)return reply(400,{error:"invalid_signature"});
const reader=req.body?.getReader();if(!reader)return reply(400,{error:"invalid_body"});
const chunks:Uint8Array[]=[];let length=0;const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},5000);
try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>65536){await reader.cancel();return reply(413,{error:"invalid_body"});}chunks.push(value);}}finally{clearTimeout(timer);}
const raw=new Uint8Array(length);let off=0;for(const chunk of chunks){raw.set(chunk,off);off+=chunk.length;}
const enc=new TextEncoder(),prefix=enc.encode(stamp+"."),message=new Uint8Array(prefix.length+raw.length);message.set(prefix);message.set(raw,prefix.length);
const hmac=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
let valid=false;for(const s of sigs){const b=Uint8Array.from(s.slice(3).match(/.{2}/g)!,x=>parseInt(x,16));if(await crypto.subtle.verify("HMAC",hmac,b,message))valid=true;}
if(!valid)return reply(400,{error:"invalid_signature"});
const event=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
if(event.livemode!==false||typeof event.id!=="string"||!event.id.startsWith("evt_"))return reply(400,{error:"invalid_event"});
if(!["checkout.session.completed","checkout.session.expired"].includes(event.type))return reply(200,{ignored:true});
const id=event.data?.object?.id;if(typeof id!=="string"||!id.startsWith("cs_test_"))return reply(400,{error:"invalid_event"});
const stripeHeaders={Authorization:"Bearer "+key};
const account=await fetch("https://api.stripe.com/v1/account",{headers:stripeHeaders,signal:AbortSignal.timeout(7000)});const accountData=await account.json();if(!account.ok||accountData.id!=="acct_1Uasdx5QECjTiiFH")return reply(503,{error:"account_unverified"});
const fetched=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(id),{headers:stripeHeaders,signal:AbortSignal.timeout(10000)});const s=await fetched.json();
if(!fetched.ok||s.id!==id||s.livemode!==false||s.mode!=="payment"||s.currency!=="usd"||!Number.isSafeInteger(s.amount_total)||s.amount_total<=0)return reply(503,{error:"session_unverified"});
const m=s.metadata;if(!uuid(m?.cc_attempt_id)||!uuid(m?.cc_quote_id)||!uuid(m?.cc_request_id))return reply(200,{ignored:true});
let kind:string;
if(s.status==="complete"&&s.payment_status==="paid")kind="paid";else if(s.status==="expired"&&s.payment_status==="unpaid")kind="expired";else return reply(503,{error:"payment_unresolved"});
const r=await fetch(base+"/rest/v1/rpc/cc_reconcile_test_checkout",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify({p_attempt:m.cc_attempt_id,p_session:id,p_quote:m.cc_quote_id,p_request:m.cc_request_id,p_amount:s.amount_total,p_event:event.id,p_kind:kind}),signal:AbortSignal.timeout(8000)});
const state=await r.json();if(!r.ok||!["paid","expired","needs_review"].includes(state))return reply(503,{error:"reconciliation_unverified"});
return reply(200,{test_mode:true,recorded_state:state});
}catch{return reply(503,{error:"reconciliation_unverified"});}
});
