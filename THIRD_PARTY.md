# Third-party components and provenance

This repository distributes the Windows integration, not dependency packages, model weights, credentials, video files, or upstream skill source.

- Playwright: https://github.com/microsoft/playwright — Apache-2.0.
- faster-whisper: https://github.com/SYSTRAN/faster-whisper — MIT.
- CTranslate2: https://github.com/OpenNMT/CTranslate2 — MIT.
- PySceneDetect: https://github.com/Breakthrough/PySceneDetect — BSD-3-Clause.
- PyAV: https://github.com/PyAV-Org/PyAV — BSD-3-Clause; wheels include libraries with their own notices, including FFmpeg components. Consult the installed distribution's notices.
- OpenCV: https://github.com/opencv/opencv — Apache-2.0.
- Pillow: https://github.com/python-pillow/Pillow — HPND.
- Model: https://huggingface.co/mobiuslabsgmbh/faster-whisper-large-v3-turbo — CTranslate2 conversion of Whisper large-v3-turbo. See its model card and https://github.com/openai/whisper. Weights are downloaded by the user, not redistributed here.

Research references: yt-dlp's XiaoHongShuIE documents normal video stream fields; this project implements its own bounded downloader and does not vendor that extractor. VideoLingo informed modular processing; no VideoLingo code is included.

An earlier private prototype used a feed extractor from JMY2003/a-skill-to-do-anything-in-xiaohongshu, which had no declared license at review time. That extractor and all other upstream skill files are NOT included here. Public search instead reads rendered DOM cards through a new implementation. Acknowledgement is not represented as permission to redistribute upstream source.
