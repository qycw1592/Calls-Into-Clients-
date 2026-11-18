// Canonicalize only a configured HTTPS origin, never the request header. Fail closed on paths, queries, credentials and fragments.
const configuredOrigin=(value:string|undefined)=>{if(!value)return undefined;try{const input=value.trim();const u=new URL(input);if(u.protocol!=="https:"||u.username||u.password||u.pathname!=="/"||u.search||u.hash||!(input===u.origin||input===u.origin+"/"))return undefined;return u.origin;}catch{return undefined;}};
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async(req)=>{
 const origin=req.headers.get("Origin");const allowed=Deno.env.get("CC_PORTAL_ALLOWED_ORIGIN");
 const released=Deno.env.get("CC_PORTAL_RELEASE")==="true";
 const headers:Record<string,string>={"Content-Type":"application/json","Cache-Control":"no-store","Vary":"Origin"};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 const qaEnabled=Deno.env.get("CC_PORTAL_QA_ENABLED")==="true";
 const qaOrigin=configuredOrigin(Deno.env.get("CC_PORTAL_QA_ORIGIN"));
 const qaMode=!released&&qaEnabled&&!!qaOrigin&&origin===qaOrigin;
 if(!qaMode&&(!released||!allowed||origin!==allowed))return reply(403,{error:"unavailable"});
 headers["Access-Control-Allow-Origin"]=qaMode?qaOrigin!:allowed!;headers["Access-Control-Allow-Methods"]="POST, OPTIONS";headers["Access-Control-Allow-Headers"]="authorization, apikey, content-type";
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply(405,{error:"method_not_allowed"});
 const token=req.headers.get("Authorization"),url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!token?.startsWith("Bearer ")||!url||!anon||!service||token==="Bearer "+service)return reply(401,{error:"unauthorized"});
 if((req.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="application/json")return reply(415,{error:"invalid_request"});
 let data:any;try{
 const reader=req.body?.getReader();if(!reader)return reply(400,{error:"invalid_request"});
 let total=0;const chunks:Uint8Array[]=[];const timer=setTimeout(()=>{void reader.cancel().catch(()=>{});},5000);try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>8192){await reader.cancel();return reply(413,{error:"invalid_request"});}chunks.push(value);}}finally{clearTimeout(timer);}
 const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
 if(!data||typeof data!=="object"||Array.isArray(data))return reply(400,{error:"invalid_request"});
 const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:token},signal:AbortSignal.timeout(5000)});
 if(!auth.ok)return reply(401,{error:"unauthorized"});const user=await auth.json();
 if(!uuid(user.id)||user.is_anonymous!==false)return reply(401,{error:"unauthorized"});
 if(qaMode){const actors=(Deno.env.get("CC_PORTAL_QA_ACTORS")||"").split(",").map(x=>x.trim());const fixtureMutation=(data.action==="request_service"&&data.property_id==="9f240000-0000-4000-8000-000000000001"&&data.message==="CC-QA-PORTAL-MUTATION-20261117")||(data.action==="lead_status"&&data.lead_id==="9f240000-0000-4000-8000-000000000003"&&data.expected==="new"&&data.next==="reviewing");if(!actors.includes(user.id)||(!["role","approve_quote","list_approved_quotes"].includes(data.action)&&!fixtureMutation))return reply(403,{error:"unavailable"});}
 let rpc:string,args:Record<string,unknown>;const list=data.action==="list_approved_quotes";
 if(list||data.action==="approve_quote"){const actors=(Deno.env.get("CC_BOOKING_QA_ACTORS")||"").split(",").map(x=>x.trim());if(!qaMode&&(Deno.env.get("CC_BOOKING_QA_ENABLED")!=="true"||!actors.includes(user.id)))return reply(403,{error:"unavailable"});}
 if(data.action==="role"&&Object.keys(data).length===1){rpc="cc_portal_actor_is_staff";args={p_actor:user.id};}
 else if(data.action==="request_service"&&Object.keys(data).length===3&&uuid(data.property_id)&&typeof data.message==="string"&&data.message.trim().length>=1&&data.message.trim().length<=3000){rpc="cc_create_service_request";args={p_actor:user.id,p_property:data.property_id,p_message:data.message.trim()};}
 else if(data.action==="lead_status"&&Object.keys(data).length===4&&uuid(data.lead_id)&&["new","reviewing","quoted"].includes(data.expected)&&["reviewing","quoted","closed"].includes(data.next)){rpc="cc_set_lead_status";args={p_actor:user.id,p_lead:data.lead_id,p_expected:data.expected,p_next:data.next};}
 else if(list&&Object.keys(data).length===1){rpc="cc_list_customer_approved_quotes";args={p_actor:user.id};}
 else if(data.action==="approve_quote"&&Object.keys(data).length===6&&uuid(data.property_id)&&uuid(data.request_id)&&["pet","litter","windows"].includes(data.service)&&Number.isInteger(data.amount_cents)&&data.amount_cents>0&&data.amount_cents<=2147483647&&typeof data.expires_at==="string"&&Number.isFinite(Date.parse(data.expires_at))){rpc="cc_approve_booking_quote_request";args={p_actor:user.id,p_property:data.property_id,p_service:data.service,p_amount:data.amount_cents,p_expires:data.expires_at,p_request:data.request_id};}
 else return reply(400,{error:"invalid_request"});
 const res=await fetch(url+"/rest/v1/rpc/"+rpc,{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},body:JSON.stringify(args),signal:AbortSignal.timeout(8000)});
 const result=await res.json();if(!res.ok)return reply(result.code==="42501"?403:result.code==="40001"?409:result.code==="22023"?400:503,{error:"not_saved"});
 if(data.action==="role"){if(typeof result!=="boolean")return reply(503,{error:"not_confirmed"});return reply(200,{is_staff:result});}
 if(list){if(!Array.isArray(result))return reply(503,{error:"not_confirmed"});return reply(200,{quotes:result,booking_confirmed:false});}
 if(!uuid(result))return reply(503,{error:"not_confirmed"});
 return reply(200,{receipt_id:result,booking_confirmed:false});
 }catch{return reply(503,{error:"not_confirmed"});}
});