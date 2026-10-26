"""Local ASR and timestamped scene/uniform frames; visual interpretation is a separate step."""
import argparse
import hashlib
import json
import math
import os
import time
import sys
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"): stream.reconfigure(encoding="utf-8")
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def sha256(file):
    h = hashlib.sha256()
    with open(file, 'rb') as src:
        for chunk in iter(lambda: src.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def write_json(file, value):
    tmp = file.with_suffix(file.suffix+'.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(file)

def stamp(seconds):
    ms = int(round(seconds*1000))
    return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'

def frames(video, out, source, at=None):
    import cv2
    from PIL import Image, ImageDraw
    from scenedetect import open_video, SceneManager
    from scenedetect.detectors import AdaptiveDetector
    receipt = out/'frames.json'
    if receipt.exists():
        prior=json.loads(receipt.read_text(encoding='utf-8'))
        expected={'version':2,'at':at}
        outputs=prior.get('outputHashes',{})
        if prior.get('sourceSha256') == source['sha256'] and prior.get('config')==expected and outputs and all(Path(f).is_file() and sha256(f)==h for f,h in outputs.items()): return prior
    stream = open_video(str(video))
    duration=stream.duration.seconds
    if not 0 < duration <= 1800: raise ValueError('Invalid duration or exceeds 30 minutes')
    scenes=[]
    if at is not None:
        if not at or any(not math.isfinite(t) or t<0 or t>=duration for t in at): raise ValueError('Frame timestamps outside video')
        times=sorted(set(at))
    else:
        manager=SceneManager()
        manager.add_detector(AdaptiveDetector())
        print('Detecting scenes locally...',flush=True)
        manager.detect_scenes(stream, frame_skip=2, show_progress=False)
        scenes=manager.get_scene_list(start_in_scene=True)
        scene_times=[a.seconds+min(1.0,(b.seconds-a.seconds)/2) for a,b in scenes]
        if len(scene_times)>30:
            scene_times=[scene_times[round(i*(len(scene_times)-1)/29)] for i in range(30)]
        times=sorted(set(round(t,2) for t in [*range(0,math.ceil(duration),30),*scene_times,duration-0.5] if 0<=t<duration))
    # Uniform coverage is retained even if many cuts require capping the scene samples.
    cap=cv2.VideoCapture(str(video)); records=[]; failures=[]
    frame_dir=out/'frames'; frame_dir.mkdir(exist_ok=True)
    try:
        for i,t in enumerate(times):
            cap.set(cv2.CAP_PROP_POS_MSEC,t*1000); ok,frame=cap.read()
            if not ok: failures.append(t); continue
            actual=cap.get(cv2.CAP_PROP_POS_MSEC)/1000
            file=frame_dir/f'{i:03d}-{t:08.2f}.jpg'
            image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB)); image.save(file,quality=90)
            records.append({'seconds':t,'decodedSeconds':actual,'seekDeviationSeconds':round(actual-t,3),'timecode':stamp(t),'file':str(file),'visualReviewed':False})
    finally: cap.release()
    sheets=[]
    for start in range(0,len(records),12):
        group=records[start:start+12]
        sheet=Image.new('RGB',(1440,math.ceil(len(group)/3)*300),'#151820')
        draw=ImageDraw.Draw(sheet)
        for j,r in enumerate(group):
            image=Image.open(r['file']); image.thumbnail((480,270))
            x=j%3*480;y=j//3*300
            sheet.paste(image,(x+(480-image.width)//2,y))
            draw.text((x+8,y+275),f"{start+j:03d}  {r['timecode']}",fill='white')
        file=out/f'contact-{start//12+1:02d}.jpg';sheet.save(file,quality=90);sheets.append(str(file))
    if not records: raise ValueError('No frames decoded')
    output_hashes={f:sha256(f) for f in [*[r['file'] for r in records],*sheets]}
    result={'sourceSha256':source['sha256'],'config':{'version':2,'at':at},'outputHashes':output_hashes,'failedTimestamps':failures,'durationSeconds':duration,'sceneCount':len(scenes),
        'sampling':'specified timestamps' if at is not None else 'every 30 seconds plus up to 30 scene-start samples; scene detector frame_skip=2',
        'frames':records,'contactSheets':sheets,'visualReviewed':False}
    write_json(receipt,result);print(f'Extracted {len(records)} frames across {duration:.1f}s',flush=True)
    return result

def transcribe(video,out,source,language,model_name):
    from faster_whisper import WhisperModel
    model_dir=Path(os.environ.get('XHS_MODEL_DIR', str(Path(os.environ.get('LOCALAPPDATA', str(Path.home())))/'XhsResearch'/'models')))/('whisper-'+model_name)
    model_hash=sha256(model_dir/'model.bin')
    receipt=out/'transcript.json'
    if receipt.exists():
        prior=json.loads(receipt.read_text(encoding='utf-8'))
        if prior.get('sourceSha256') == source['sha256'] and prior.get('modelSha256')==model_hash and prior.get('requestedLanguage')==language and prior.get('outputHashes') and all(Path(f).is_file() and sha256(f)==h for f,h in prior['outputHashes'].items()):return prior
    start=time.monotonic()
    model=WhisperModel(str(model_dir),device='cpu',compute_type='int8',cpu_threads=min(8,os.cpu_count() or 4),local_files_only=True)
    segments,info=model.transcribe(str(video),language=None if language=='auto' else language,beam_size=5,vad_filter=True,condition_on_previous_text=False)
    records=[]
    with open(out/'transcript.partial.jsonl','w',encoding='utf-8') as partial:
        for seg in segments:
            row={'start':seg.start,'end':seg.end,'text':seg.text,'avgLogProb':seg.avg_logprob,'noSpeechProb':seg.no_speech_prob}
            records.append(row);partial.write(json.dumps(row,ensure_ascii=False)+'\n');partial.flush()
            if len(records)%25==0:print(f'ASR: {len(records)} segments, through {stamp(seg.end)}',flush=True)
    speech_status='completed_with_speech' if records else 'completed_no_speech_detected'
    result={'sourceSha256':source['sha256'],'status':speech_status,'model':{'small':'Systran/faster-whisper-small','turbo':'mobiuslabsgmbh/faster-whisper-large-v3-turbo'}[model_name],'modelSha256':model_hash,
        'device':'cpu','computeType':'int8','requestedLanguage':language,'detectedLanguage':info.language,
        'languageProbability':info.language_probability,'audioDurationSeconds':info.duration,
        'elapsedSeconds':round(time.monotonic()-start,2),'audioProcessed':'entire input with VAD silence filtering',
        'accuracy':'machine transcript; proper names and numbers require verification','segments':records}
    (out/'transcript.srt').write_text('\n\n'.join(f"{i}\n{stamp(r['start'])} --> {stamp(r['end'])}\n{r['text'].strip()}" for i,r in enumerate(records,1)),encoding='utf-8')
    (out/'transcript.txt').write_text('\n'.join(f"[{stamp(r['start'])} - {stamp(r['end'])}] {r['text'].strip()}" for r in records),encoding='utf-8')
    result['outputHashes']={str(out/f):sha256(out/f) for f in ['transcript.srt','transcript.txt']}
    write_json(receipt,result)
    print(f'ASR complete: {len(records)} segments; {result["elapsedSeconds"]}s',flush=True)
    return result

def main():
    p=argparse.ArgumentParser();p.add_argument('source_manifest',type=Path);p.add_argument('--language',default='auto');p.add_argument('--stage',choices=['all','frames','transcribe'],default='all')
    p.add_argument('--model',choices=['small','turbo'],default='turbo');p.add_argument('--at',nargs='+',type=float)
    args=p.parse_args()
    if args.at is not None and args.stage!='frames':p.error('--at requires --stage frames')
    manifest=args.source_manifest.resolve();source=json.loads(manifest.read_text(encoding='utf-8'))
    video=Path(source['file']).resolve();out=manifest.parent
    if video.parent != out or video.name!='video.mp4': raise ValueError('Media must belong to manifest directory')
    if sha256(video)!=source['sha256']:raise ValueError('Source hash mismatch')
    import av
    with av.open(str(video)) as probe:
        if not probe.streams.video:raise ValueError('No decodable video stream')
        audio_present=bool(probe.streams.audio)
        duration=(probe.duration or 0)/av.time_base
        if not 0<duration<=1800:raise ValueError('Invalid video duration or exceeds 30 minutes')
    if args.at is not None:
        out=out/('detail-'+hashlib.sha256(str(args.at).encode()).hexdigest()[:10]);out.mkdir(exist_ok=True)
    lock=out/'analysis.lock'
    with lock.open('x',encoding='utf-8') as f:f.write(json.dumps({'pid':os.getpid(),'startedAt':time.time(),'stage':args.stage}))
    try:
        result={'sourceUrl':source['sourceUrl'],'sourceSha256':source['sha256'],'visualReviewed':False}
        if args.stage in ['all','frames']:
            r=frames(video,out,source,args.at);result['frameCount']=len(r['frames']);result['contactSheets']=r['contactSheets']
        if args.stage in ['all','transcribe']:
            if audio_present:
                r=transcribe(video,out,source,args.language,args.model);result['transcriptSegments']=len(r['segments']);result['transcriptionStatus']=r['status']
            else:
                result['transcriptSegments']=0;result['transcriptionStatus']='completed_no_audio_stream'
        write_json(out/('analysis-'+args.stage+'.json'),result);print(json.dumps(result,ensure_ascii=False),flush=True)
    finally:lock.unlink(missing_ok=True)

if __name__=='__main__':main()
