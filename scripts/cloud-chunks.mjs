import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {transcribeDots,dotsPayload,usableTranscript} from './dots-client.mjs';

export async function cloudChunks({audio,state,noteId,key,allowCloud=false,call=transcribeDots}) {
  if(!allowCloud)throw new Error('Cloud processing not authorized');
  if(!/^[a-f0-9]{24}$/.test(noteId)||!/^[a-f0-9]{64}$/.test(audio.mediaSha256))throw new Error('Invalid source identity');
  if(!Number.isFinite(audio.durationSeconds)||!audio.chunks.length||audio.chunks.length>5)throw new Error('Invalid audio chunk count');
  let previous=0;
  for(const c of audio.chunks){if(!Number.isFinite(c.start)||!Number.isFinite(c.end)||Math.abs(c.start-previous)>0.002||c.end<=c.start||c.end-c.start>180.01)throw new Error('Audio coverage gap');dotsPayload(c.data,'audio');previous=c.end;}
  if(Math.abs(previous-audio.durationSeconds)>0.002)throw new Error('Audio tail missing');
  const folder=path.resolve(state,'dots',noteId,audio.mediaSha256);
  fs.mkdirSync(folder,{recursive:true});const results=[];
  const requestConfig=dotsPayload('https://storage.googleapis.com/cloud-samples-data/speech/brooklyn_bridge.mp3','audio');
  requestConfig.messages[1].content[0].audio_url.url='[WAV bytes identified separately]';
  const requestConfigHash=createHash('sha256').update(JSON.stringify(requestConfig)).digest('hex');
  for(const [index,chunk] of audio.chunks.entries()) {
    const hash=createHash('sha256').update(Buffer.from(chunk.data.split(',')[1],'base64')).digest('hex');
    const identity={noteId,sourceSha256:audio.mediaSha256,index,startSample:Math.round(chunk.start*16000),endSample:Math.round(chunk.end*16000),sampleRate:16000,wavSha256:hash,inputKind:'audio',requestConfigHash};
    const requestIdentity=JSON.stringify(identity);
    const file=path.join(folder,`part-${index}.json`);const pending=file+'.pending';
    if(fs.existsSync(file)) {
      const old=JSON.parse(fs.readFileSync(file,'utf8'));
      if(JSON.stringify(old.requestIdentity)===requestIdentity&&old.finishReason==='stop'&&usableTranscript(old.transcript)){results.push(old);continue;}
      throw new Error('Cloud cache differs; inspect before making another request');
    }
    if(fs.existsSync(pending))throw new Error('A previous cloud request has uncertain status. Inspect it before retrying.');
    fs.writeFileSync(pending,JSON.stringify({startedAt:new Date().toISOString(),requestIdentity:identity,status:'unknown-until-response-saved',recovery:'Do not automatically resubmit. Inspect provider usage and saved response; confirm original process exited before manually resolving this receipt.'}),{flag:'wx'});
    const response=await call({url:chunk.data,kind:'audio',key,allowCloud:true});
    const result={...response,start:chunk.start,end:chunk.end,timeBasis:'audio-sample chunk boundaries, not sentence alignment',requestIdentity:identity};
    fs.writeFileSync(file+'.tmp',JSON.stringify(result,null,2));fs.renameSync(file+'.tmp',file);fs.unlinkSync(pending);
    if(response.finishReason!=='stop')throw new Error('Cloud chunk may be truncated; inspect saved output before continuing');
    if(!usableTranscript(response.transcript))throw new Error('Cloud response contains no usable transcript; inspect saved output before continuing');
    results.push(result);
  }
  const usage=results.reduce((sum,r)=>({prompt_tokens:sum.prompt_tokens+(r.usage?.prompt_tokens||0),completion_tokens:sum.completion_tokens+(r.usage?.completion_tokens||0)}),{prompt_tokens:0,completion_tokens:0});
  const report={provider:'dots',status:'all-audio-parts-received',durationSeconds:audio.durationSeconds,
    sourceUrl:`https://www.xiaohongshu.com/explore/${noteId}`,sourceSha256:audio.mediaSha256,parts:results,usage,
    requestIntervalsComplete:true,coverageVerified:false,timestampsVerified:false,accuracyVerified:false,
    warning:'All audio intervals submitted; text completeness still needs review. Times label chunks, not individual sentences.'};
  const manifest=path.join(folder,'transcript.json');fs.writeFileSync(manifest,JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(folder,'transcript.txt'),results.map(r=>`[${r.start.toFixed(3)}-${r.end.toFixed(3)} seconds]\n${r.transcript}`).join('\n\n'));
  return {...report,manifest};
}
