// Curb & Common synthetic Stripe sandbox only. Never accepts a client price or live key.
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const originValue=(v:string|undefined)=>{try{const i=v?.trim()||"",u=new URL(i);return u.protocol==="https:"&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==="/"&&(i===u.origin||i===u.origin+"/")?u.origin:undefined;}catch{return undefined;}};
Deno.serve(async(req)=>{
const headers:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
const origin=req.headers.get("Origin"),allowed=originValue(Deno.env.get("CC_BOOKING_QA_ORIGIN"));
if(Deno.env.get("CC_STRIPE_QA_ENABLED")!=="true"||Deno.env.get("CC_BOOKING_QA_ENABLED")!=="true"||Deno.env.get("CC_PORTAL_RELEASE")==="true"||!allowed||origin!==allowed)return reply(403,{error:"unavailable"});
headers["Access-Control-Allow-Origin"]=allowed;headers["Access-Control-Allow-Methods"]="POST, OPTIONS";headers["Access-Control-Allow-Headers"]="authorization, apikey, content-type";
if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
const token=req.headers.get("Authorization"),base=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),stripe=Deno.env.get("CC_STRIPE_TEST_SECRET_KEY");
if(!token?.startsWith("Bearer ")||!base||!anon||!service||token==="Bearer "+service)return reply(401,{error:"unauthorized"});
if(!stripe||!/^sk_test_/.test(stripe)||!Deno.env.get("CC_STRIPE_TEST_WEBHOOK_SECRET")?.startsWith("whsec_"))return reply(503,{error:"payment_setup_incomplete"});
try{
const auth=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,Authorization:token},signal:AbortSignal.timeout(5000)});if(!auth.ok)return reply(401,{error:"unauthorized"});const user=await auth.json();const actors=(Deno.env.get("CC_BOOKING_QA_ACTORS")||"").split(",").map(x=>x.trim());
if(!uuid(user.id)||user.is_anonymous!==false||!actors.includes(user.id)||typeof user.email!=="string"||!user.email.endsWith("@example.invalid"))return reply(403,{error:"unavailable"});
if((req.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="application/json")return reply(415,{error:"invalid_request"});
const reader=req.body?.getReader();if(!reader)return reply(400,{error:"invalid_request"});
let total=0;const chunks:Uint8Array[]=[];const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},5000);try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>1024){await reader.cancel();return reply(413,{error:"invalid_request"});}chunks.push(value);}}finally{clearTimeout(timer);}
const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).length!==2||!uuid(data.quote_id)||!uuid(data.request_id))return reply(400,{error:"invalid_request"});
const stripeHeaders={Authorization:"Bearer "+stripe};
const account=await fetch("https://api.stripe.com/v1/account",{headers:stripeHeaders,signal:AbortSignal.timeout(7000)});const accountBody=await account.json();if(!account.ok||accountBody.id!=="acct_1Uasdx5QECjTiiFH")return reply(503,{error:"payment_account_unverified"});
const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await fetch(base+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});return {ok:r.ok,body:await r.json()};};
const prepared=await rpc("cc_prepare_test_checkout",{p_actor:user.id,p_quote:data.quote_id,p_request:data.request_id});
if(!prepared.ok)return reply(prepared.body?.code==="42501"?403:prepared.body?.code==="PT409"?409:503,{error:"checkout_not_verified"});
const a=prepared.body?.[0];if(!Array.isArray(prepared.body)||prepared.body.length!==1||!uuid(a?.attempt_id)||!Number.isSafeInteger(a.amount_cents)||a.amount_cents<=0||!["pending","open"].includes(a.state))return reply(503,{error:"checkout_not_verified"});
const validSession=(s:any)=>s&&s.livemode===false&&s.mode==="payment"&&s.currency==="usd"&&s.amount_total===a.amount_cents&&s.status==="open"&&s.payment_status==="unpaid"&&typeof s.id==="string"&&s.id.startsWith("cs_test_")&&s.metadata?.cc_attempt_id===a.attempt_id&&s.metadata?.cc_quote_id===data.quote_id&&s.metadata?.cc_request_id===data.request_id&&typeof s.url==="string"&&(()=>{try{const u=new URL(s.url);return u.protocol==="https:"&&u.hostname==="checkout.stripe.com"&&!u.username&&!u.password;}catch{return false;}})();
let res:Response;
if(a.session_id){if(typeof a.session_id!=="string"||!a.session_id.startsWith("cs_test_"))return reply(503,{error:"checkout_not_verified"});res=await fetch("https://api.stripe.com/v1/checkout/sessions/"+encodeURIComponent(a.session_id),{headers:stripeHeaders,signal:AbortSignal.timeout(10000)});}
else{
const expiry=Math.floor(Date.parse(a.expires_at)/1000);if(expiry<Math.floor(Date.now()/1000)+1800)return reply(409,{error:"checkout_needs_review"});
const form=new URLSearchParams({mode:"payment","line_items[0][quantity]":"1","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(a.amount_cents),"line_items[0][price_data][product_data][name]":"Curb & Common — SANDBOX TEST ONLY",success_url:allowed+"/?checkout=test_return#portal",cancel_url:allowed+"/?checkout=test_cancel#portal",expires_at:String(expiry),"metadata[cc_attempt_id]":a.attempt_id,"metadata[cc_quote_id]":data.quote_id,"metadata[cc_request_id]":data.request_id});
res=await fetch("https://api.stripe.com/v1/checkout/sessions",{method:"POST",headers:{...stripeHeaders,"Content-Type":"application/x-www-form-urlencoded","Idempotency-Key":"cc-test-"+a.attempt_id},body:form,signal:AbortSignal.timeout(10000)});
}
const session=await res.json();if(!res.ok||!validSession(session))return reply(503,{error:"checkout_not_verified"});
const bound=await rpc("cc_bind_test_checkout",{p_actor:user.id,p_attempt:a.attempt_id,p_session:session.id});if(!bound.ok||bound.body!==true)return reply(503,{error:"checkout_not_verified"});
return reply(200,{test_mode:true,checkout_url:session.url,attempt_id:a.attempt_id,amount_cents:a.amount_cents,booking_confirmed:false,payment_confirmed:false});
}catch{return reply(503,{error:"checkout_not_verified"});}
});
