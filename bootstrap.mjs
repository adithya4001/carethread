import fs from 'node:fs';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),target=path.join(root,'.carethread');
const bytes=fs.readFileSync(path.join(root,'carethread-source.zip'));
const digest=createHash('sha256').update(bytes).digest('hex');
const marker=path.join(target,'.source-sha256');
if(!fs.existsSync(marker)||fs.readFileSync(marker,'utf8').trim()!==digest){
 fs.mkdirSync(target,{recursive:true});
 let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&bytes.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw Error('Invalid source archive.');
 const count=bytes.readUInt16LE(end+10);let offset=bytes.readUInt32LE(end+16),total=0;
 for(let i=0;i<count;i++){
  if(bytes.readUInt32LE(offset)!==0x02014b50)throw Error('Invalid archive directory.');
  const method=bytes.readUInt16LE(offset+10),size=bytes.readUInt32LE(offset+20),plain=bytes.readUInt32LE(offset+24),n=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32),attributes=bytes.readUInt32LE(offset+38),local=bytes.readUInt32LE(offset+42);
  const name=bytes.subarray(offset+46,offset+46+n).toString('utf8').replaceAll('\\','/');
  offset+=46+n+extra+comment;const dest=path.resolve(target,name);
  if(!dest.startsWith(target+path.sep)||name.includes(':')||name.split('/').includes('..')||((attributes>>>16)&0xf000)===0xa000||name.startsWith('.git/'))throw Error('Unsafe archive entry.');
  if(name.endsWith('/')){fs.mkdirSync(dest,{recursive:true});continue;}
  if(plain>10*1024*1024||(total+=plain)>50*1024*1024)throw Error('Source archive is too large.');
  if(bytes.readUInt32LE(local)!==0x04034b50)throw Error('Invalid archive entry.');
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),compressed=bytes.subarray(start,start+size);
  const content=method===0?compressed:method===8?inflateRawSync(compressed,{maxOutputLength:10*1024*1024}):null;
  if(!content||content.length!==plain)throw Error('Unsupported source archive entry.');
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,content);
 }
 fs.writeFileSync(marker,digest+'\n');console.log('Complete CareThread source prepared in .carethread/');
}
const mode=process.argv[2]||'start';
const args=mode==='test'?['--test',...fs.readdirSync(path.join(target,'tests')).filter(p=>p.endsWith('.test.mjs')).map(p=>path.join('tests',p))]:mode==='build'?['scripts/build.mjs']:['server.mjs'];
const child=spawn(process.execPath,args,{cwd:target,stdio:'inherit',env:process.env});
child.on('exit',code=>{process.exitCode=code??1;});
