"""Resume the large SDK/JDK downloads in checked HTTP ranges on slow networks."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request
import time

root = Path(__file__).resolve().parent.parent / '.android-tools'
root.mkdir(exist_ok=True)

def download(url, name, checksum, algorithm="sha256"):
    target = root / name
    if target.exists() and hashlib.new(algorithm, target.read_bytes()).hexdigest() == checksum:
        print(name + ' already verified.', flush=True)
        return
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=30) as r:
        size = int(r.headers['Content-Length'])
        url = r.url
    count = 16
    chunk = (size + count - 1) // count
    def part(i):
        start, end = i * chunk, min(size - 1, (i + 1) * chunk - 1)
        path = root / (name + '.part' + str(i))
        if path.exists() and path.stat().st_size == end - start + 1: return path
        for attempt in range(4):
            try:
                have = path.stat().st_size if path.exists() else 0
                offset = start + have
                req = urllib.request.Request(url, headers={'Range': f'bytes={offset}-{end}'})
                with urllib.request.urlopen(req, timeout=60) as r:
                    if r.status != 206 or r.headers.get('Content-Range') != f'bytes {offset}-{end}/{size}':
                        raise RuntimeError('Server did not honor download range')
                    with path.open('ab') as f:
                        while data := r.read(32 * 1024): f.write(data)
                if path.stat().st_size != end - start + 1: raise RuntimeError('Incomplete range')
                print(f'{name}: part {i+1}/{count} downloaded', flush=True)
                return path
            except Exception:
                if attempt == 3: raise
                time.sleep(2)
    with ThreadPoolExecutor(max_workers=count) as pool:
        parts = list(pool.map(part, range(count)))
    with target.open('wb') as f:
        for p in parts:
            with p.open('rb') as source:
                while data := source.read(1024 * 1024): f.write(data)
    if hashlib.new(algorithm, target.read_bytes()).hexdigest() != checksum: raise RuntimeError('Checksum mismatch: ' + name)
    print(name + ' verified.', flush=True)

if __name__ == '__main__':
    import sys
    if '--gradle' in sys.argv:
        packages = [('https://github.com/gradle/gradle-distributions/releases/download/v8.14.3/gradle-8.14.3-bin.zip', 'gradle-bin.zip', 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531')]
    elif '--packages' in sys.argv:
        packages = [
            ('https://dl.google.com/android/repository/platform-36_r02.zip', 'platform36.zip', '2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576', 'sha1'),
            ('https://dl.google.com/android/repository/build-tools_r36_windows.zip', 'build-tools36.zip', 'f16ccffd34de8790dede813a6c7d8e2c11a27b50', 'sha1'),
        ]
    else:
        packages = [
            ('https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip', 'android-commandline.zip', '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'),
            ('https://aka.ms/download-jdk/microsoft-jdk-21.0.12.1-windows-x64.zip', 'jdk21.zip', '192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f'),
        ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = [pool.submit(download, *package) for package in packages]
        for job in jobs: job.result()
