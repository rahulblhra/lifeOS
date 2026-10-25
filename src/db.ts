import { openDB, type IDBPDatabase } from 'idb';
import type {Store} from './types';
export const stores=['tasks','expenses','shoppingItems','learningGoals','learningTopics','reminders','stickyNotes','jobApplications','jobContacts','jobActivities','jobEmailLinks','jobInterviews','jobFollowUps','settings'] as const;
export type StoreName=typeof stores[number];
type SyncState={id:'sync';localUpdatedAt:string;driveCheckpoint:string};
let dbPromise:Promise<IDBPDatabase>|undefined;
function database(){return dbPromise??=openDB('lifeos-local',4,{upgrade(db){for(const s of stores)if(!db.objectStoreNames.contains(s))db.createObjectStore(s,{keyPath:'id'});if(!db.objectStoreNames.contains('syncMetadata'))db.createObjectStore('syncMetadata',{keyPath:'id'});}});}
async function markLocalChanged(){const db=await database();const tx=db.transaction('syncMetadata','readwrite');const state=await tx.store.get('sync') as SyncState|undefined;await tx.store.put({id:'sync',localUpdatedAt:new Date().toISOString(),driveCheckpoint:state?.driveCheckpoint||''});await tx.done;}
export async function getSyncState():Promise<SyncState>{const state=await(await database()).get('syncMetadata','sync') as SyncState|undefined;return state??{id:'sync',localUpdatedAt:'',driveCheckpoint:''};}
export async function setDriveCheckpoint(checkpoint:string){const db=await database();const tx=db.transaction('syncMetadata','readwrite');await tx.store.put({id:'sync',localUpdatedAt:checkpoint,driveCheckpoint:checkpoint});await tx.done;}
export async function all<T>(store:StoreName):Promise<T[]>{return (await database()).getAll(store) as Promise<T[]>;}
export async function save<T extends {id:string}>(store:StoreName,item:T){await (await database()).put(store,item);await markLocalChanged();}
export async function saveLearningGoalWithTopics(goal:{id:string;[key:string]:unknown},topics:{id:string;[key:string]:unknown}[]){const db=await database();const tx=db.transaction(['learningGoals','learningTopics'],'readwrite');try{await tx.objectStore('learningGoals').put(goal);for(const topic of topics)await tx.objectStore('learningTopics').put(topic);await tx.done;await markLocalChanged();}catch(error){tx.abort();throw error;}}
export async function remove(store:StoreName,id:string){await (await database()).delete(store,id);await markLocalChanged();}
export async function replaceData(data:Store){const db=await database();const tx=db.transaction([...stores],'readwrite');try{for(const name of stores){const os=tx.objectStore(name);await os.clear();for(const item of data[name] as {id:string}[])await os.put(item);}await tx.done;await markLocalChanged();}catch(e){tx.abort();throw e;}}
export async function clearData(){const db=await database();const tx=db.transaction([...stores],'readwrite');for(const s of stores)await tx.objectStore(s).clear();await tx.done;await markLocalChanged();}
