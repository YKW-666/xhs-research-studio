import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Stream a verified local media cache into Chrome's native decoder, without Python.
export async function browserAudio(page,file,duration,expectedHash) {
  if(!Number.isFinite(duration)||duration<=0||duration>900)throw new Error('Browser audio supports videos up to 15 minutes');
  const size=fs.statSync(file).size;
  if(size>150*1024*1024)throw new Error('Media exceeds the 150 MiB browser-audio limit');
  const holder=await page.evaluateHandle(()=>({buffers:[],size:0}));
  const digest=createHash('sha256');
  try {
    for await(const chunk of fs.createReadStream(file,{highWaterMark:1024*1024})) {
      digest.update(chunk);
      await holder.evaluate((h,b64)=>{const text=atob(b64);const bytes=new Uint8Array(text.length);for(let i=0;i<text.length;i++)bytes[i]=text.charCodeAt(i);h.buffers.push(bytes);h.size+=bytes.length;},chunk.toString('base64'));
    }
    const mediaSha256=digest.digest('hex');
    if(mediaSha256!==expectedHash)throw new Error('Source hash changed during audio processing');
    const audio=await holder.evaluate(async(h,duration)=>{
      const bytes=new Uint8Array(h.size);let at=0;for(const b of h.buffers){bytes.set(b,at);at+=b.length;}h.buffers.length=0;
      const context=new OfflineAudioContext(1,1,16000);
      let timer;
      let decoded;
      try{decoded=await Promise.race([context.decodeAudioData(bytes.buffer),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Audio decode timed out')),90000);})]);}finally{clearTimeout(timer);}
      if(decoded.sampleRate!==16000||decoded.numberOfChannels<1||decoded.numberOfChannels>2||!decoded.length||decoded.length>16000*901||decoded.length*decoded.numberOfChannels*4>128*1024*1024)throw new Error('Decoded audio exceeds supported format or size');
      if(Math.abs(decoded.duration-duration)>2)throw new Error('Audio and video durations do not match');
      const rate=decoded.sampleRate;const channels=Array.from({length:decoded.numberOfChannels},(_,i)=>decoded.getChannelData(i));const chunks=[];let outputBytes=0;
      for(let start=0;start<decoded.length;start+=180*rate){
        const length=Math.min(180*rate,decoded.length-start);const wav=new Uint8Array(44+length*2);const v=new DataView(wav.buffer);
        const tag=(at,text)=>{for(let i=0;i<text.length;i++)wav[at+i]=text.charCodeAt(i);};
        tag(0,'RIFF');v.setUint32(4,wav.length-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,length*2,true);
        for(let i=0;i<length;i++){let sample=0;for(const c of channels)sample+=c[start+i]/channels.length;sample=Math.max(-1,Math.min(1,sample));v.setInt16(44+i*2,sample<0?sample*32768:sample*32767,true);}
        const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(new Blob([wav],{type:'audio/wav'}));});
        outputBytes+=data.length;if(outputBytes>40*1024*1024)throw new Error('Audio output exceeds transfer limit');
        chunks.push({start:start/rate,end:(start+length)/rate,data});
      }
      return {durationSeconds:decoded.duration,sampleRate:rate,chunks};
    },duration);
    return {...audio,mediaBytes:size,mediaSha256};
  } finally {await holder.dispose();}
}
