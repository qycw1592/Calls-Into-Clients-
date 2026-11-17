// Verify original cleared image sources before publishing; no dependencies.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../assets/',import.meta.url);
const expected=[['hero.jpg',407884,'ffd8ff'],['windows.jpg',625475,'ffd8ff'],['cleanout.png',2408870,'89504e470d0a1a0a']];
for(const [name,size,magic] of expected){
 const source=(await readFile(fileURLToPath(new URL(name+'.b64',root)),'utf8')).trim();
 if(!/^[A-Za-z0-9+/]+={0,2}$/.test(source)||source.length%4!==0)throw Error('Invalid base64: '+name);
 const bytes=Buffer.from(source,'base64');
 if(bytes.length!==size||!bytes.toString('hex',0,magic.length/2).startsWith(magic))throw Error('Original size/signature mismatch: '+name);
 if(bytes.toString('base64')!==source)throw Error('Noncanonical encoding: '+name);
 console.log(name,bytes.length,createHash('sha256').update(bytes).digest('hex'));
}
console.log('PASS: three cleared original image sources');
