#!/usr/bin/env python3
"""Paint the faint 'WARBAND GAMES' watermark out of the felt in the intro video and the splash poster.
The camera is static, so: clean frame 0 once (felt cloned in from just above the mark, Poisson-blended), then for
every frame use the clean background wherever the frame still matches frame 0 there, and the frame itself wherever
something is moving over it (cards, the logo). Audio is copied.  python3 tools/clean_intro.py
"""
import cv2, numpy as np, subprocess, os
SRC = 'assets/video/intro.mp4'; TMP = '/tmp/intro-clean-video.mp4'; OUT = SRC
x0, y0, x1, y1 = 556, 488, 984, 556          # the watermark box (with margin), 1536x768 frames
cap = cv2.VideoCapture(SRC)
fps = cap.get(cv2.CAP_PROP_FPS); w = int(cap.get(3)); h = int(cap.get(4))
ok, f0 = cap.read(); assert ok
src = f0[y0-100:y1-100, x0:x1].copy()
mask = np.full(src.shape[:2], 255, np.uint8)
clean0 = cv2.seamlessClone(src, f0, mask, ((x0+x1)//2, (y0+y1)//2), cv2.NORMAL_CLONE)
cv2.imwrite('assets/img/splash.jpg', clean0, [cv2.IMWRITE_JPEG_QUALITY, 88])
ref = f0[y0:y1, x0:x1].astype(np.int16); cl = clean0[y0:y1, x0:x1]
proc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
                         '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', TMP], stdin=subprocess.PIPE)
cap.set(cv2.CAP_PROP_POS_FRAMES, 0); n = 0
while True:
    ok, f = cap.read()
    if not ok: break
    reg = f[y0:y1, x0:x1]
    diff = np.abs(reg.astype(np.int16) - ref).max(2)
    moving = (diff > 22).astype(np.uint8)
    moving = cv2.dilate(moving, np.ones((7, 7), np.uint8))
    moving = cv2.GaussianBlur(moving.astype(np.float32), (0, 0), 2)[..., None]
    out = f.copy()
    out[y0:y1, x0:x1] = (reg * moving + cl * (1 - moving)).astype(np.uint8)
    proc.stdin.write(out.tobytes()); n += 1
proc.stdin.close(); proc.wait()
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', TMP, '-i', SRC, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', OUT + '.tmp.mp4'], check=True)
os.replace(OUT + '.tmp.mp4', OUT); os.remove(TMP)
print('frames', n, '->', OUT, os.path.getsize(OUT) // 1024, 'KB; poster assets/img/splash.jpg')
