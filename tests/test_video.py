import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from pathlib import Path
import cv2
import numpy as np

script=Path(__file__).resolve().parents[1]/'scripts'/'analyze-video.py'
spec=importlib.util.spec_from_file_location('analysis',script)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert module.stamp(59.9997)=='00:01:00,000'
base=Path(tempfile.mkdtemp(prefix='xhs-video-fixture-'))
video=base/'video.mp4'
writer=cv2.VideoWriter(str(video),cv2.VideoWriter_fourcc(*'mp4v'),10,(320,180))
for i in range(30):writer.write(np.full((180,320,3),0 if i<15 else 255,dtype=np.uint8))
writer.release()
source={'file':str(video),'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'sourceUrl':'https://www.xiaohongshu.com/explore/123456789012345678901234'}
(base/'source.json').write_text(json.dumps(source),encoding='utf-8')
run=subprocess.run([sys.executable,str(script),str(base/'source.json')],capture_output=True,text=True,encoding='utf-8')
assert run.returncode==0,run.stderr
report=json.loads((base/'analysis-all.json').read_text(encoding='utf-8'))
assert report['transcriptionStatus']=='completed_no_audio_stream'
assert report['frameCount']>0 and report['visualReviewed'] is False
frames=json.loads((base/'frames.json').read_text(encoding='utf-8'))
assert all(0<=row['seconds']<3.1 for row in frames['frames'])
print('PASS: local synthetic silent-video decoding, frame timestamps, outputs and status')
