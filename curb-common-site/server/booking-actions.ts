// Canonicalize only a configured HTTPS origin, never the request header. Fail closed on paths, queries, credentials and fragments.
const configuredOrigin=(value:string|undefined)=>{if(!value)return undefined;try{const input=value.trim();const u=new URL(input);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!(input===u.origin||input===u.origin+"/"))return undefined;return u.origin;}catch{return undefined;}};
// Protected C&C booking adapter. Disabled unless explicitly configured for synthetic QA.
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async(req)=>{
 const headers:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 const origin=req.headers.get("Origin"),allowed=configuredOrigin(Deno.env.get("CC_BOOKING_QA_ORIGIN"));
 if(Deno.env.get("CC_BOOKING_QA_ENABLED")!=="true"||!allowed||origin!==allowed)return reply(403,{error:"unavailable"});
 headers["Access-Control-Allow-Origin"]=allowed;headers["Access-Control-Allow-Methods"]="POST, OPTIONS";headers["Access-Control-Allow-Headers"]="authorization, apikey, content-type";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const token=req.headers.get("Authorization"),url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!token?.startsWith("Bearer ")||!url||!anon||!service||token==="Bearer "+service)return reply(401,{error:"unauthorized"});
 try{
 const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:token},signal:AbortSignal.timeout(5000)});
 if(!auth.ok)return reply(401,{error:"unauthorized"});
 const user=await auth.json();const actors=(Deno.env.get("CC_BOOKING_QA_ACTORS")||"").split(",").map(x=>x.trim());
 if(!uuid(user.id)||user.is_anonymous!==false||!actors.includes(user.id))return reply(403,{error:"unavailable"});
 if((req.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="application/json")return reply(415,{error:"invalid_request"});
 const reader=req.body?.getReader();if(!reader)return reply(400,{error:"invalid_request"});
 let total=0;const chunks:Uint8Array[]=[];const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},5000);
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>2048){await reader.cancel();return reply(413,{error:"invalid_request"});}chunks.push(value);}}finally{clearTimeout(timer);}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 if(!data||typeof data!=="object"||Array.isArray(data)||!uuid(data.quote_id))return reply(400,{error:"invalid_request"});
 const rpc=async(name:string,args:Record<string,unknown>)=>{
 const res=await fetch(url+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 return {ok:res.ok,value:await res.json()};};
 const base={p_actor:user.id,p_quote:data.quote_id};
 if(data.action==="list_slots"&&Object.keys(data).length===2){
 const r=await rpc("cc_list_approved_booking_slots",base);
 if(!r.ok||!Array.isArray(r.value))return reply(403,{error:"availability_not_verified"});
 return reply(200,r.value);}
 if(data.action==="hold"&&Object.keys(data).length===4&&uuid(data.slot_id)&&uuid(data.request_id)){
 const r=await rpc("cc_hold_approved_booking",{...base,p_slot:data.slot_id,p_request:data.request_id});
 if(!r.ok)return reply(r.value?.code==="42501"?403:409,{error:"hold_not_verified"});
 if(r.value!==data.quote_id)return reply(409,{error:"hold_not_verified"});
 const receipt=await rpc("cc_booking_hold_receipt",{...base,p_request:data.request_id});
 const row=receipt.value?.[0];
 if(!receipt.ok||!Array.isArray(receipt.value)||receipt.value.length!==1||row.quote_id!==data.quote_id||row.slot_id!==data.slot_id||!Number.isInteger(row.amount_cents)||row.amount_cents<=0||Date.parse(row.held_until)<=Date.now())return reply(409,{error:"hold_not_verified"});
 return reply(200,{...row,booking_confirmed:false,payment_enabled:false});}
 return reply(400,{error:"invalid_request"});
 }catch{return reply(503,{error:"not_verified"});}
});
