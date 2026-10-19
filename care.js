export const providers=[
 {id:'general',name:'Dr. Meera Iyer',initials:'MI',specialty:'General medicine',qualification:'MD · Internal Medicine',clinic:'Willow Family Clinic',clinicId:'willow',language:'English · Telugu',category:'general',available:'Today, 16:30',color:'#e9eddf'},
 {id:'endo',name:'Dr. Arjun Sen',initials:'AS',specialty:'Endocrinology',qualification:'DM · Endocrinology',clinic:'Northstar Medical Centre',clinicId:'northstar',language:'English · Hindi',category:'diabetes',available:'Tomorrow, 10:00',color:'#e3edf1'},
 {id:'cardio',name:'Dr. Leela Rao',initials:'LR',specialty:'Cardiology',qualification:'DM · Cardiology',clinic:'Northstar Medical Centre',clinicId:'northstar',language:'English · Telugu',category:'heart',available:'Tomorrow, 12:00',color:'#f1e6df'}
];
// All names, qualifications, schedules and organisations above are fictional demo fixtures.
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export function emptyState(name='Alex Morgan',ownerId='demo-patient'){
 return {version:2,profile:{name,ownerId,patientId:'CT-'+uid().slice(0,8).toUpperCase()},episodes:[]};
}
export function createEpisode({title,symptoms,onset,category='general'},ownerId){
 if(!String(title||'').trim()||String(symptoms||'').trim().length<8)throw Error('Add a concern title and at least a short symptom description.');
 return {id:uid(),ownerId,title:String(title).trim().slice(0,100),symptoms:String(symptoms).trim().slice(0,3000),onset:String(onset||'Not specified').slice(0,50),category:['general','diabetes','heart'].includes(category)?category:'general',status:'draft',revision:1,reviewedRevision:0,doctorId:null,consent:false,createdAt:now(),checkins:[],reports:[],messages:[],tasks:[],plan:null,closeRequested:false,events:[{id:uid(),time:now(),actor:'patient',title:'Care workspace opened',detail:'Patient-reported concern. Diagnosis not established.'}]};
}
export function recommendedProviders(category){return [...providers].sort((a,b)=>(b.category===category)-(a.category===category));}
export function applyAction(original,action,actor){
 const e=structuredClone(original), data=action.data||{};
 const patient=actor.role==='patient'&&actor.id===e.ownerId;
 const doctor=actor.role==='doctor'&&actor.providerId===e.doctorId&&e.consent;
 const provider=providers.find(p=>p.id===e.doctorId);
 const clinic=actor.role==='clinic'&&actor.clinicId===provider?.clinicId&&e.consent;
 const need=(ok,msg='This action is not allowed for this account.')=>{if(!ok)throw Error(msg);};
 const event=(title,detail='')=>e.events.push({id:uid(),time:now(),actor:actor.role,title,detail});
 const reopen=(reason)=>{e.revision++;if(['approved','closure_requested'].includes(e.status)){e.status='needs_review';event('Doctor review needed',reason);}e.closeRequested=false;};
 if(e.status==='resolved'&&!['reopen','revoke'].includes(action.type))throw Error('This episode is archived. Reopen it or create a new concern.');
 switch(action.type){
 case 'share':
  need(patient);need(data.consent===true,'Confirm consent before sharing with the selected demo clinician.');need(providers.some(p=>p.id===data.doctorId),'Select a clinician.');
  e.doctorId=data.doctorId;e.consent=true;e.status='awaiting_review';e.revision++;event('Review requested',`Workspace shared with ${providers.find(p=>p.id===e.doctorId).name}.`);break;
 case 'revoke':
  need(patient);e.consent=false;e.status=e.status==='resolved'?'resolved':'draft';e.plan=null;e.doctorId=null;e.revision++;e.tasks.forEach(t=>{if(['requested','accepted'].includes(t.status))t.status='cancelled';});event('Sharing withdrawn','Pending coordination requests cancelled. Retained history remains in this workspace.');break;
 case 'checkin':
  need(patient);need(['better','same','worse'].includes(data.feeling),'Choose how you are feeling.');
  const temp=data.temperature===''||data.temperature==null?null:Number(data.temperature);
  need(temp===null||(Number.isFinite(temp)&&temp>=30&&temp<=45),'Temperature must be between 30 and 45 °C.');
  e.checkins.push({id:uid(),time:now(),feeling:data.feeling,temperature:temp,note:String(data.note||'').slice(0,1500),newSymptoms:!!data.newSymptoms});
  if(data.feeling==='worse'||data.newSymptoms)reopen('Patient reported worsening or new symptoms.');
  event('Patient check-in',`${data.feeling}${temp===null?'':` · ${temp} °C`}${data.note?' · '+String(data.note).slice(0,1500):''}`);break;
 case 'report':
  need(patient);need(data.id&&data.name,'Choose a report.');need(e.reports.length<12,'This demo supports 12 attachments per episode.');
  e.reports.push({id:data.id,name:String(data.name).slice(0,150),type:String(data.type||'application/octet-stream'),size:Number(data.size)||0,summary:String(data.summary||'').slice(0,1500),time:now(),source:'patient-upload',verified:false});
  reopen('A new patient report needs clinician review.');event('Report added',`${data.name}. Values have not been extracted or clinically verified.`);break;
 case 'message':
  need(patient||doctor);need(String(data.text||'').trim().length>0,'Write a message.');e.messages.push({id:uid(),time:now(),role:actor.role,text:String(data.text).trim().slice(0,3000)});event(actor.role==='doctor'?'Clinician message':'Patient update','Message added to the shared workspace.');break;
 case 'approve':
  need(doctor);need(['awaiting_review','needs_review','approved','closure_requested'].includes(e.status),'The patient must request a review first.');need(Number(data.revision)===e.revision,'The workspace changed. Refresh and review the latest update.');need(data.reviewed===true,'Confirm you reviewed the history and attached reports.');need(String(data.instructions||'').trim().length>=20,'Add specific follow-up instructions (at least 20 characters).');
  e.plan={instructions:String(data.instructions).trim().slice(0,4000),followup:String(data.followup||'').slice(0,100),reviewTriggers:String(data.reviewTriggers||'Any new or worsening symptoms or new reports').slice(0,1000),approvedAt:now(),approvedBy:actor.providerId,revision:e.revision};
  e.reviewedRevision=e.revision;e.status='approved';e.closeRequested=false;event('Care plan approved','This approval covers the recorded revision and follow-up instructions only.');break;
 case 'request_task':
  need(patient||doctor);need(e.consent&&e.doctorId,'Share with a clinician before requesting coordination.');need(['appointment','transport','test'].includes(data.kind),'Choose a supported request type.');
  need(data.kind==='appointment'||(e.status==='approved'&&e.reviewedRevision===e.revision),'A current clinician-approved plan is required for this coordination request.');
  need(String(data.details||'').trim().length>=5,'Add request details.');
  e.tasks.push({id:uid(),kind:data.kind,details:String(data.details).trim().slice(0,1000),preferred:String(data.preferred||'').slice(0,100),status:'requested',clinicId:provider.clinicId,createdAt:now(),confirmation:null});
  event('Coordination requested',`${data.kind}. Provider acknowledgement is pending; no booking or dispatch is confirmed.`);break;
 case 'task_status':
  need(clinic);const task=e.tasks.find(t=>t.id===data.id);need(task&&task.clinicId===actor.clinicId,'Request not found.');
  const allowed={requested:['accepted','declined'],accepted:['confirmed','declined'],confirmed:['completed'],completed:[],declined:[],cancelled:[]};
  need(allowed[task.status]?.includes(data.status),'This request cannot move to that status.');
  if(data.status==='confirmed')need(String(data.confirmation||'').trim().length>=5,'Add a provider confirmation or booking reference.');
  task.status=data.status;task.updatedAt=now();if(data.confirmation)task.confirmation=String(data.confirmation).slice(0,300);event('Provider request updated',`${task.kind}: ${data.status}${task.confirmation?' · '+task.confirmation:''}`);break;
 case 'request_close':need(patient);need(e.status==='approved','A current reviewed care plan is required before requesting closure.');e.closeRequested=true;e.status='closure_requested';event('Recovery review requested','Patient reports improvement and requests clinician review before closing the episode.');break;
 case 'resolve':need(doctor);need(e.closeRequested&&e.reviewedRevision===e.revision,'Review the current episode and recovery request first.');need(String(data.summary||'').trim().length>=15,'Add a recovery summary.');e.status='resolved';e.resolvedAt=now();e.recoverySummary=String(data.summary).trim().slice(0,3000);event('Care episode archived',e.recoverySummary);break;
 case 'reopen':need(patient);need(e.status==='resolved','Only an archived episode can be reopened.');e.status=e.consent?'needs_review':'draft';e.revision++;e.closeRequested=false;event('Patient reopened the episode','A new review is required. Previous care plan is historical.');break;
 default:throw Error('Unknown workspace action.');
 }
 return e;
}
export function demoState(){
 const state=emptyState('Alex Morgan');
 const e=createEpisode({title:'Fever & tiredness',symptoms:'Feeling warm and tired since yesterday evening. Mild headache. I would like a clinician to review my symptoms.',onset:new Date(Date.now()-86400000).toISOString().slice(0,10),category:'general'},'demo-patient');
 e.createdAt=new Date(Date.now()-3600000).toISOString();e.checkins=[{id:uid(),time:e.createdAt,feeling:'same',temperature:38.1,note:'Resting at home. Symptoms are patient-reported.',newSymptoms:false}];
 state.episodes.push(e);return state;
}
