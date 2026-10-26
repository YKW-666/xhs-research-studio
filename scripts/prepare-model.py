import hashlib,json,os,sys,time,urllib.request
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
REPO='mobiuslabsgmbh/faster-whisper-large-v3-turbo'
REV='0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf'
HASHES={
 'model.bin':'e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da',
 'config.json':'b0253ea6c0d3bea6b1e19e91a02acfd3b53f4467362efcb5a3e6b16c9b3a9b7e',
 'tokenizer.json':'297b13372ac43916285644fb9687add3cc62ee2a1adb60da3dc25cc94c1871fd',
 'vocabulary.json':'c69260f2ab26d659b7c398f9a2b2b48ed0df16c3b47d7326782fd9cba71690c1',
 'preprocessor_config.json':'7ccc62c6f2765af1f3b46c00c9b5894426835a05021c8b9c01eecb6dfb542711'}
def digest(file):
 h=hashlib.sha256()
 with file.open('rb') as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def main():
 root=Path(os.environ.get('XHS_MODEL_DIR',str(Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'XhsResearch'/'models')))/'whisper-turbo'
 root.mkdir(parents=True,exist_ok=True)
 lock=root/'prepare.lock'
 try:
  with lock.open('x') as f:f.write(json.dumps({'pid':os.getpid(),'startedAt':time.time()}))
 except FileExistsError:
  raise SystemExit('Model preparation is active or previously interrupted. Inspect prepare.lock PID/start time; only remove the lock after confirming its owner exited. See README recovery section.')
 try:
  for name,expected in HASHES.items():
   file=root/name
   if file.exists() and digest(file)==expected:print('Verified cache:',name,flush=True);continue
   part=root/(name+'.part');count=0
   print('Downloading',name,'(model weights are about 1.6 GB)',flush=True)
   with urllib.request.urlopen(f'https://huggingface.co/{REPO}/resolve/{REV}/{name}',timeout=60) as r,part.open('wb') as w:
    while True:
     data=r.read(1048576)
     if not data:break
     count+=len(data)
     if count>2_000_000_000:raise ValueError('Model download exceeds expected upper bound')
     w.write(data)
   if digest(part)!=expected:raise ValueError('Checksum mismatch: '+name)
   part.replace(file)
  (root/'provenance.json').write_text(json.dumps({'repo':REPO,'revision':REV,'sha256':HASHES},indent=2),encoding='utf-8')
  print('Model ready:',root)
 finally:lock.unlink(missing_ok=True)
if __name__=='__main__':main()
