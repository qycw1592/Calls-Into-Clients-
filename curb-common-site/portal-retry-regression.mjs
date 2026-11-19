// Synthetic DOM-only regression; no network, credentials, or release changes.
import assert from 'node:assert/strict';
import {mountPortal} from './portal.js';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
class Node {
 constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.events={};this.textContent='';this.value='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 setAttribute(){}
 addEventListener(name,fn){this.events[name]=fn;}
}
const doc={createElement:tag=>new Node(tag,doc)};
const root=new Node('root',doc);
const all=(n,tag)=>[...(n.tag===tag?[n]:[]),...n.children.flatMap(c=>all(c,tag))];
const property='11111111-1111-4111-8111-111111111111';
const calls=[];let mode='lost',failRefresh=false,releaseResponse;
const response=(data,ok=true)=>({ok,json:async()=>data});
const fetcher=async(url,opts)=>{
 if(url.includes('/functions/')){
  const a=JSON.parse(opts.body);
  if(a.action==='role')return response({is_staff:false});
  if(a.action==='list_approved_quotes')return response({quotes:[],booking_confirmed:false});
  assert.equal(a.action,'request_service');calls.push(a);
  if(mode==='deferred')await new Promise(resolve=>{releaseResponse=resolve;});
  if(mode==='lost')throw Error('simulated lost response');
  if(mode==='wrong')return response({receipt_id:property,booking_confirmed:false});
  return response({receipt_id:a.request_id,booking_confirmed:false});
 }
 if(failRefresh)return response([],false);
 return response(url.includes('/properties?')?[{id:property,address:'Synthetic property'}]:[]);
};
const session={accessToken:()=> 'synthetic-token',signOut:async()=>{}};
const portal=mountPortal(root,{releaseEnabled:true,session,config:{url:'https://synthetic.supabase.co',publishableKey:'synthetic-key',fetcher}});
await portal.refresh();
const submit=async(message)=>{all(root,'textarea')[0].value=message;await all(root,'form')[0].events.submit({preventDefault(){}});};
await submit('Synthetic request');
assert.equal(calls.length,1);
const id=calls[0].request_id;
assert.match(id,/^[0-9a-f-]{36}$/);
await portal.refresh();
assert.equal(all(root,'form').length,1);
await submit('Changed request');
assert.equal(calls.length,1);
mode='wrong';await submit('Synthetic request');
assert.equal(calls[1].request_id,id);
mode='success';failRefresh=true;await submit('Synthetic request');
assert.equal(calls[2].request_id,id);
assert.match(all(root,'p')[0].textContent,/Request received:.*Account refresh failed/);
failRefresh=false;await portal.refresh();
await submit('Synthetic request');
assert.notEqual(calls[3].request_id,id);
portal.clear();
assert.equal(all(root,'form').length,0);
console.log('PASS: lost response, changed intent, wrong receipt, same-ID retry, refresh failure, distinct intent, clear');

 // A disabled preview must never invoke the network or expose request controls.
 const previewRoot=new Node('root',doc);
 const preview=mountPortal(previewRoot,{releaseEnabled:false,session,config:{fetcher:()=>{throw Error('preview network call');}}});
 assert.equal(all(previewRoot,'form').length,0);
 assert.equal(all(previewRoot,'button').length,0);
 assert.match(all(previewRoot,'p')[0].textContent,/not available during the preview/);
 preview.clear();
 // Concurrent submissions share one in-flight request; logout invalidates its receipt.
 await portal.refresh();
 mode='deferred';
 const before=calls.length;
 const first=submit('Synthetic concurrent request');
 await submit('Synthetic concurrent request');
 assert.equal(calls.length,before+1);
 const signout=all(root,'button').find(b=>b.textContent==='Sign out');
 await signout.events.click();
 assert.equal(all(root,'form').length,0);
 releaseResponse();
 await first;
 assert.equal(all(root,'form').length,0);
 assert.equal(all(root,'p')[0].textContent,'Signed out.');
 console.log('PASS: preview disabled, concurrent submit, in-flight logout');
