#!/usr/bin/env python3
"""Turn a song into a casino background track: assets/music/song-N.mp3.

    python3 tools/make_song.py "Some Song.mp3" 14           -> assets/music/song-14.mp3
    python3 tools/make_song.py "Some Song.mp3" 14 --dry     -> just print where the music starts

Recipe (matches every song already in the game): trim the leading silence/click (first moment the level rises above
-40 dBFS, less a tenth of a second), fade in 0.5 s / out 1.5 s, highpass 80 Hz, lowpass 2200 (Q 2) + 4000 (Q 2) for
the 'speaker across the room' tone, loudnorm to -31 LUFS, mono 64 kb/s. Then add a line to assets/music/setlist.json
so the Setlist editor can show the title, and run tools/build_sw.py.
"""
import subprocess, sys, json, math, os

def onset(src):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', '8000', '-t', '60', '-f', 's16le', '-'], capture_output=True).stdout
    import array
    a = array.array('h'); a.frombytes(raw[:len(raw) // 2 * 2])
    win = 400  # 50 ms
    for i in range(0, len(a) - win, win):
        seg = a[i:i + win]
        rms = math.sqrt(sum(x * x for x in seg) / win) / 32768
        if rms > 10 ** (-40 / 20):
            return max(0.0, i / 8000 - 0.1)
    return 0.0

def main():
    src, n = sys.argv[1], int(sys.argv[2])
    dry = '--dry' in sys.argv
    start = onset(src)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout.strip())
    out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'music', f'song-{n}.mp3')
    print(f'{os.path.basename(src)}: music starts at {start:.2f}s, length {dur - start:.0f}s -> song-{n}.mp3')
    if dry: return
    length = dur - start
    af = f'afade=t=in:d=0.5,afade=t=out:st={max(0, length - 1.5):.2f}:d=1.5,highpass=f=80,lowpass=f=2200:p=2,lowpass=f=4000:p=2,loudnorm=I=-31:TP=-2:LRA=11'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start:.3f}', '-i', src, '-af', af, '-ac', '1', '-b:a', '64k', '-map_metadata', '-1', out], check=True)

if __name__ == '__main__':
    main()
