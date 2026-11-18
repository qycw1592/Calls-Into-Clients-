// Offline customer experience regression. No network, real recipients or credentials.
import assert from 'node:assert/strict';
import {mountPortal} from '../portal.js';
class Node {
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.events={};this.textContent='';this.value='';this.disabled=false;this.attrs={};}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=nodes[0]?.value||'';}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,f){this.events[k]=f;}
 reset(){}
}
const doc={createElement:tag=>new Node(tag,doc)};
const walk=n=>[n,...n.children.flatMap(walk)];
const id='12345678-1234-4234-8234-123456789abc';
const property={id,address:'Synthetic property'};
const response=data=>({ok:true,json:async()=>data});
let mode='ok', calls=0;
const fetcher=async(url,opts)=>{
 calls++;
 if(url.includes('/rest/v1/properties'))return response([property]);
 if(url.includes('/rest/v1/'))return response([]);
 const action=JSON.parse(opts.body).action;
 if(action==='role')return response({is_staff:false});
 if(action==='list_approved_quotes')return response({booking_confirmed:false,quotes:[]});
 if(action==='request_service')return response({receipt_id:id,booking_confirmed:mode==='bad'});
 throw Error('Unexpected action');
};
const config={url:'https://zzixmhnmmddilijtqrqs.supabase.co',publishableKey:'synthetic',fetcher};
const session={accessToken:()=> 'synthetic',signOut:async()=>{}};
const root=doc.createElement('div');
mountPortal(root,{config,session});
assert.equal(calls,0);
assert.match(walk(root).find(n=>n.attrs.role==='status').textContent,/preview/);
const portal=mountPortal(root,{config,session,releaseEnabled:true});
await portal.refresh();
const status=()=>walk(root).find(n=>n.attrs.role==='status').textContent;
const submit=async()=>{const form=walk(root).find(n=>n.tag==='form');walk(form).find(n=>n.tag==='textarea').value='Synthetic request';await form.events.submit({preventDefault(){}});};
await submit();
assert.match(status(),new RegExp(id));
assert.match(status(),/No booking confirmed\. Email delivery not verified\./);
mode='bad';await submit();
assert.match(status(),/Request not confirmed/);
assert.doesNotMatch(status(),/Request received|Email sent/);
portal.clear();
assert.equal(status(),'Signed out.');
assert.equal(walk(root).filter(n=>n.tag==='form').length,0);
console.log('PASS: preview gate, receipt vs email distinction, invalid receipt failure, sign-out clearing; mock transport only');
