const KEY='carethread.workspace.v2';
export function readLocal(){try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch{return null;}}
export function saveLocal(state){localStorage.setItem(KEY,JSON.stringify(state));}
async function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('carethread-files',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Local file storage is unavailable.'));});}
export async function saveFile(id,blob){const d=await db();try{await new Promise((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').put(blob,id);t.oncomplete=resolve;t.onerror=()=>reject(Error('The attachment could not be saved.'));});}finally{d.close();}}
export async function loadFile(id){const d=await db();try{return await new Promise((resolve,reject)=>{const r=d.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=reject;});}finally{d.close();}}
export async function clearFiles(){const d=await db();try{await new Promise((resolve,reject)=>{const t=d.transaction('files','readwrite');t.objectStore('files').clear();t.oncomplete=resolve;t.onerror=reject;});}finally{d.close();}}
