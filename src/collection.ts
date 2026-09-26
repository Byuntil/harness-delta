import { SourceFailure, sourceCategory, type SourceDiagnosticCategory } from './source-errors.js';
import { constants, closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parseSnapshot, metadataKey, type SourceScope, type Snapshot } from './adapters.js';
import { TimestampSchema } from './contracts.js';
import { type Clock, utcNow } from './lifecycle.js';
import { Store } from './store.js';

export interface SourceBytes { text: string; identity: string; size: number; modified: number }
export type SourceReader = (path: string) => SourceBytes;
const MAX_SOURCE_BYTES=16*1024*1024;
/** A bounded, transient read of one previously authorized source. */
export const readSource: SourceReader = path => {
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try {
    const before=fstatSync(fd);
    if (!before.isFile() || before.size > MAX_SOURCE_BYTES) throw new SourceFailure('unsupported_source','unsupported');
    const buffer=Buffer.alloc(before.size);let offset=0;
    while(offset<buffer.length){const length=readSync(fd,buffer,offset,buffer.length-offset,offset);if(!length)throw new SourceFailure('short_read');offset+=length;}
    const after=fstatSync(fd);
    if(before.size!==after.size || before.mtimeMs!==after.mtimeMs)throw new SourceFailure('unstable_read');
    return {text:buffer.toString('utf8'),identity:`${after.dev}:${after.ino}`,size:after.size,modified:after.mtimeMs};
  } finally {closeSync(fd);}
};
interface LinkedSource {id:string;project_id:string;task_id:string;source_path:string;product:'codex'|'claude_code';product_version:string;local_root:string;generation:number;metadata:string}
interface MemoryCheckpoint {generation:number;since:string;lastAt:string;identity:string;size:number;modified:number;fingerprints:Record<string,string>;settledKeys:string[]}

export interface CollectionDiagnostic { session_id: string; at: string; category: SourceDiagnosticCategory }

export class Collector {
  private checkpoints=new Map<string,MemoryCheckpoint>();
  constructor(private readonly store:Store,private readonly clock:Clock=utcNow,private readonly read:SourceReader=readSource){}
  tick(taskId:string):CollectionDiagnostic[] {
    const diagnostics:CollectionDiagnostic[]=[];
    const pending=new Map(this.checkpoints);
    try {
      this.store.transaction(()=>{
        // Acquire SQLite's writer lock before scope checks and bounded sync I/O.
        // Other processes cannot pause/delete/change scope until this batch ends.
        this.store.execute('UPDATE tasks SET generation = generation WHERE id = ?',[taskId]);
        const links=this.store.all<LinkedSource>(`SELECT s.*,p.local_root,t.generation,t.metadata FROM sessions s
          JOIN tasks t ON t.id=s.task_id JOIN projects p ON p.id=s.project_id
          WHERE t.id=? AND t.state='active' AND p.local_root IS NOT NULL
          AND s.source_path IS NOT NULL AND s.parent_id IS NULL`,[taskId]);
        if(!links.length){for(const [key] of pending)pending.delete(key);return;}
        const now=new Date(TimestampSchema.parse(this.clock())).toISOString();
        for(const link of links){
          let bytes:SourceBytes;let snapshot:Snapshot;
          const scope:SourceScope={sessionId:link.id,projectRoot:link.local_root,product:link.product,version:link.product_version};
          let previous=pending.get(link.id);
          if(previous && previous.generation!==link.generation)previous=undefined;
          let stage:SourceDiagnosticCategory='read_failed';
          try {
            bytes=this.read(link.source_path);
            if(previous && bytes.identity!==previous.identity)throw new SourceFailure('identity_changed');
            if(previous && bytes.size<previous.size)throw new SourceFailure('source_truncated');
            if(previous && bytes.size===previous.size && bytes.modified!==previous.modified)throw new SourceFailure('same_size_modified');
            if(previous && now<previous.lastAt)throw new SourceFailure('clock_regressed');
            stage='parse_failed';snapshot=parseSnapshot(bytes.text,scope);
            const metadata=JSON.parse(link.metadata) as {model:string;product:string};
            if(metadata.product!==link.product || snapshot.model && snapshot.model!==metadata.model ||
              snapshot.records.some(r=>r.payload.kind==='usage' && r.payload.model!==metadata.model))throw new SourceFailure('model_mismatch','unsupported');
          }catch(error){
            const reason=error instanceof Error && ['unsupported','scope_mismatch'].includes(error.message)?error.message:'source_error';
            diagnostics.push({session_id:link.id,at:now,category:sourceCategory(error,reason==='scope_mismatch'?'scope_mismatch':reason==='unsupported'?'unsupported_source':stage)});
            this.observe(taskId,now,now,'error',reason);pending.delete(link.id);
            this.store.execute('DELETE FROM cursors WHERE session_id=?',[link.id]);continue;
          }
          const current=this.store.get<{state:string;generation:number}>('SELECT state,generation FROM tasks WHERE id=?',[taskId]);
          if(!current || current.state!=='active' || current.generation!==link.generation){pending.delete(link.id);continue;}
          const fingerprints=Object.fromEntries(snapshot.records.map(row=>[row.key,metadataKey(JSON.stringify(row))]));
          if(previous && Object.entries(previous.fingerprints).some(([key,value])=>fingerprints[key]!==value)){
            diagnostics.push({session_id:link.id,at:now,category:'record_changed'});
            this.observe(taskId,now,now,'error','source_error');pending.delete(link.id);
            this.store.execute('DELETE FROM cursors WHERE session_id=?',[link.id]);continue;
          }
          // Baseline and blocked records are permanently excluded from this
          // interval. Otherwise fingerprint future records without settling them.
          // Copy nested state so a failed transaction cannot consume eligibility.
          const settledKeys=new Set(previous && !snapshot.blocked?previous.settledKeys:Object.keys(fingerprints));
          if(previous && !snapshot.blocked){
            for(const record of snapshot.records){
              if(settledKeys.has(record.key))continue;
              if(!record.turnStartedAt || record.turnStartedAt<=previous.since){settledKeys.add(record.key);continue;}
              if(record.at>now)continue;
              const key=metadataKey(link.id,record.key);
              this.store.putEvent({id:key,source_key:key,project_id:link.project_id,task_id:link.task_id,session_id:link.id,occurred_at:record.at,payload:record.payload});
              settledKeys.add(record.key);
            }
          }
          const checkpoint:MemoryCheckpoint={generation:link.generation,since:previous?.since??now,lastAt:now,identity:bytes.identity,size:bytes.size,modified:bytes.modified,fingerprints,settledKeys:[...settledKeys]};
          pending.set(link.id,checkpoint);
          // Persist metadata-only position for diagnostics. A new Collector never
          // resumes it: every process/run establishes its own current-tail baseline.
          this.store.execute(`INSERT INTO cursors(session_id,checkpoint) VALUES (?,?)
            ON CONFLICT(session_id) DO UPDATE SET checkpoint=excluded.checkpoint`,[link.id,JSON.stringify(checkpoint)]);
          this.observe(taskId,previous?.lastAt??now,now,previous?'unmeasurable':'excluded',snapshot.blocked?'unsupported':previous?'incomplete':'offline');
        }
      });
      this.checkpoints=pending;
      return diagnostics;
    }catch{throw new Error('collection_error');}
  }
  private observe(taskId:string,start:string,end:string,status:string,reason:string):void{
    this.store.execute('INSERT INTO observations(id,task_id,started_at,ended_at,status,reason) VALUES (?,?,?,?,?,?)',[randomUUID(),taskId,start,end,status,reason]);
  }
}
