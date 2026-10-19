import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync,timingSafeEqual,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {applyAction,createEpisode,emptyState,providers,uid} from './dist/care.js';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createApp({dbPath=process.env.DB_PATH||path.join(ROOT,'data/carethread.sqlite'),origin=process.env.APP_ORIGIN,staffInvites=process.env.STAFF_INVITES?JSON.parse(process.env.STAFF_INVITES):{}}={}){
 if(dbPath!==':memory:')fs.mkdirSync(path.dirname(dbPath),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,salt TEXT NOT NULL,role TEXT NOT NULL,provider_id TEXT,clinic_id TEXT,patient_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS episodes(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),name TEXT NOT NULL,type TEXT NOT NULL,content BLOB NOT NULL);
 CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,created TEXT NOT NULL);`);
 const rates=new Map();
 const record=(user,action)=>db.prepare('INSERT INTO audit VALUES(?,?,?,?)').run(uid(),user?.id||null,action,new Date().toISOString());
 const publicUser=u=>({id:u.id,name:u.name,role:u.role,providerId:u.provider_id,clinicId:u.clinic_id,patientId:u.patient_id});
 const allowed=(u,e)=>u&&(u.role==='patient'?u.id===e.ownerId:e.consent&&(u.role==='doctor'?u.provider_id===e.doctorId:providers.find(p=>p.id===e.doctorId)?.clinicId===u.clinic_id));
 const issue=(u,res)=>{const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),u.id,Date.now()+86400000);res.setHeader('Set-Cookie',`ct_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${origin?.startsWith('https:')?'; Secure':''}`);};
 async function body(req){let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Object.assign(Error('Request exceeds 8 MB.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw Error('Invalid JSON.');}}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   if(!route.startsWith('/api/')){
    const target=path.resolve(ROOT,'dist','.'+decodeURIComponent(route==='/'?'/index.html':route));
    if(!target.startsWith(path.join(ROOT,'dist')+path.sep)){res.writeHead(403);return res.end();}
    const actual=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;
    if(!fs.existsSync(actual)){res.writeHead(404);return res.end('Not found');}
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.csv':'text/csv','.pdf':'application/pdf','.png':'image/png'};
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    res.writeHead(200,{'Content-Type':types[path.extname(actual)]||'application/octet-stream'});return fs.createReadStream(actual).pipe(res);
   }
   if(req.method!=='GET'){
    const expected=origin||`http://${req.headers.host}`;
    if(req.headers.origin!==expected)return reply(403,{error:'Request origin rejected.'});
    if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON content type required.'});
   }
   const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('ct_session='))?.slice(11);
   const user=cookie?db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(hash(cookie),Date.now()):null;
   if(route==='/api/health')return reply(200,{status:'ok',version:'2.0',providerIntegrations:false,medicalAI:false});
   if(route==='/api/session')return reply(200,{user:user?publicUser(user):null,backend:true,providerIntegrations:false});
   if(['/api/auth/register','/api/auth/login'].includes(route)&&req.method==='POST'){
    const input=await body(req),email=String(input.email||'').trim().toLowerCase();
    const key=req.socket.remoteAddress+':'+email;let attempts=rates.get(key);if(!attempts||Date.now()>attempts.until)attempts={n:0,until:Date.now()+900000};rates.set(key,attempts);if(++attempts.n>12)return reply(429,{error:'Too many attempts. Try again in 15 minutes.'});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||String(input.password||'').length<12||input.password.length>128)return reply(400,{error:'Use a valid email and a 12–128 character password.'});
    if(route.endsWith('register')){
     const name=String(input.name||'').trim();if(name.length<2||name.length>100)return reply(400,{error:'Enter your name (2–100 characters).'});
     if(db.prepare('SELECT id FROM users WHERE email=?').get(email))return reply(409,{error:'This account cannot be created. Try signing in.'});
     let role='patient',providerId=null,clinicId=null;
     if(input.invite){const cfg=staffInvites[input.invite];if(!cfg||!['doctor','clinic'].includes(cfg.role))return reply(403,{error:'Invalid staff invitation.'});role=cfg.role;providerId=cfg.providerId||null;clinicId=cfg.clinicId||null;if(role==='doctor'&&!providers.some(p=>p.id===providerId))throw Error('Staff provider mapping is invalid.');if(role==='clinic'&&!['willow','northstar'].includes(clinicId))throw Error('Staff clinic mapping is invalid.');}
     const salt=randomBytes(16).toString('hex'),password=scryptSync(input.password,salt,64).toString('hex'),id=uid(),patientId='CT-'+id.slice(0,8).toUpperCase();
     db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?)').run(id,email,name,password,salt,role,providerId,clinicId,patientId);
     const created=db.prepare('SELECT * FROM users WHERE id=?').get(id);issue(created,res);record(created,'account_created');return reply(201,{user:publicUser(created)});
    }
    const found=db.prepare('SELECT * FROM users WHERE email=?').get(email),salt=found?.salt||'0000000000000000';const candidate=scryptSync(input.password,salt,64);if(!found||!timingSafeEqual(candidate,Buffer.from(found.password,'hex')))return reply(401,{error:'Email or password is incorrect.'});
    issue(found,res);record(found,'signed_in');return reply(200,{user:publicUser(found)});
   }
   if(!user)return reply(401,{error:'Sign in to access this workspace.'});
   if(route==='/api/auth/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(cookie));res.setHeader('Set-Cookie','ct_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return reply(200,{ok:true});}
   if(route==='/api/state'&&req.method==='GET'){
    const episodes=db.prepare('SELECT payload FROM episodes').all().map(x=>JSON.parse(x.payload)).filter(e=>allowed(user,e)).map(e=>user.role==='clinic'?{id:e.id,ownerId:e.ownerId,patientName:e.patientName,title:'Care coordination',doctorId:e.doctorId,consent:e.consent,status:e.status,revision:e.revision,reviewedRevision:e.reviewedRevision,tasks:e.tasks,reports:[],messages:[],checkins:[],events:e.events.filter(x=>x.title.startsWith('Coordination')||x.title.startsWith('Provider')),symptoms:'Clinical details are restricted to the patient and assigned clinician.',createdAt:e.createdAt}:e);
    return reply(200,{version:2,profile:{name:user.name,ownerId:user.id,patientId:user.patient_id},episodes});
   }
   if(route==='/api/episodes'&&req.method==='POST'){
    if(user.role!=='patient')return reply(403,{error:'Only a patient can open an episode.'});const input=await body(req),e=createEpisode(input,user.id);e.patientName=user.name;db.prepare('INSERT INTO episodes VALUES(?,?,?)').run(e.id,user.id,JSON.stringify(e));record(user,'episode_created');return reply(201,e);
   }
   const actionMatch=route.match(/^\/api\/episodes\/([\w-]+)\/action$/);
   if(actionMatch&&req.method==='POST'){
    const row=db.prepare('SELECT payload FROM episodes WHERE id=?').get(actionMatch[1]);if(!row)return reply(404,{error:'Episode not found.'});const e=JSON.parse(row.payload);if(!allowed(user,e))return reply(403,{error:'This workspace is not shared with your account.'});
    const a=await body(req);if(a.type==='report'&&!db.prepare('SELECT id FROM attachments WHERE id=? AND owner_id=?').get(a.data?.id,user.id))throw Error('Upload this attachment before linking it.');
    const updated=applyAction(e,a,{id:user.id,role:user.role,providerId:user.provider_id,clinicId:user.clinic_id});
    // Optimistic revision lease prevents overwriting another session's update.
    const result=db.prepare('UPDATE episodes SET payload=? WHERE id=? AND payload=?').run(JSON.stringify(updated),e.id,row.payload);if(!result.changes)return reply(409,{error:'Workspace changed. Refresh and try again.'});record(user,'episode_'+a.type);return reply(200,{ok:true});
   }
   if(route==='/api/attachments'&&req.method==='POST'){
    if(user.role!=='patient')return reply(403,{error:'Only patients can upload attachments.'});const d=await body(req);
    const types=['application/pdf','image/jpeg','image/png','text/plain','audio/webm','audio/ogg','video/webm','video/mp4'];if(!types.includes(String(d.type||'').split(';')[0]))throw Error('Unsupported file type.');
    const content=Buffer.from(String(d.base64||''),'base64');if(!content.length||content.length>5*1024*1024)throw Error('File must be between 1 byte and 5 MB.');
    const used=db.prepare('SELECT COALESCE(SUM(length(content)),0) n FROM attachments WHERE owner_id=?').get(user.id).n;if(used+content.length>30*1024*1024)return reply(413,{error:'This prototype supports 30 MB of files per account.'});
    const id=uid();db.prepare('INSERT INTO attachments VALUES(?,?,?,?,?)').run(id,user.id,String(d.name||'report').slice(0,150),d.type,content);record(user,'attachment_uploaded');return reply(201,{id});
   }
   const fileMatch=route.match(/^\/api\/attachments\/([\w-]+)$/);
   if(fileMatch&&req.method==='GET'){
    const f=db.prepare('SELECT * FROM attachments WHERE id=?').get(fileMatch[1]);if(!f)return reply(404,{error:'Attachment not found.'});
    const shared=user.role==='doctor'&&db.prepare('SELECT payload FROM episodes').all().map(x=>JSON.parse(x.payload)).some(e=>allowed(user,e)&&e.reports.some(r=>r.id===f.id));
    if(f.owner_id!==user.id&&!shared)return reply(403,{error:'Attachment access denied.'});record(user,'attachment_accessed');res.writeHead(200,{'Content-Type':f.type,'Content-Disposition':`attachment; filename="${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`});return res.end(Buffer.from(f.content));
   }
   return reply(404,{error:'API route not found.'});
  }catch(err){return reply(err.status||400,{error:err.message||'Request failed.'});}
 });
 server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createApp();const port=Number(process.env.PORT||4175);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`CareThread: http://localhost:${port}`));
}
