"""Install project-local Android build tools from official, verified archives."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile
import os
import sys

root = Path(__file__).resolve().parent.parent / '.android-tools'
root.mkdir(exist_ok=True)

def archive(url, name, digest):
    target = root / name
    if not target.exists():
        print('Downloading ' + name, flush=True)
        urllib.request.urlretrieve(url, target)
    if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
        raise RuntimeError('Checksum mismatch for ' + name)
    return target

sdk = root / 'sdk'
sdkmanager = sdk / 'cmdline-tools/latest/bin/sdkmanager.bat'
if not sdkmanager.exists():
    package = archive('https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip', 'android-commandline.zip', '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a')
    with zipfile.ZipFile(package) as z:
        for item in z.infolist():
            relative = Path(item.filename).relative_to('cmdline-tools')
            dest = sdk / 'cmdline-tools/latest' / relative
            if item.is_dir(): dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(item))

jdk = root / 'jdk'
if not jdk.exists():
    downloaded = archive('https://aka.ms/download-jdk/microsoft-jdk-21.0.12.1-windows-x64.zip', 'jdk21.zip', '192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f')
    with zipfile.ZipFile(downloaded) as z:
        for item in z.infolist():
            relative = Path(*Path(item.filename).parts[1:])
            dest = jdk / relative
            if item.is_dir(): dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(item))

gradle_package = root / 'gradle-bin.zip'
if gradle_package.exists():
    if hashlib.sha256(gradle_package.read_bytes()).hexdigest() != 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531':
        raise RuntimeError('Incomplete or invalid Gradle archive')
    if not (root / 'gradle-dist/gradle-8.14.3/bin/gradle.bat').exists():
        with zipfile.ZipFile(gradle_package) as z:
            z.extractall(root / 'gradle-dist')

env = {**os.environ, 'JAVA_HOME': str(jdk), 'ANDROID_HOME': str(sdk)}
for filename, folder, checksum in [
    ('platform36.zip', 'platforms/android-36', '2c1a80dd4d9f7d0e6dd336ec603d9b5c55a6f576'),
    ('build-tools36.zip', 'build-tools/36.0.0', 'f16ccffd34de8790dede813a6c7d8e2c11a27b50'),
]:
    package = root / filename
    destination = sdk / folder
    if package.exists() and not (destination / 'source.properties').exists():
        if hashlib.sha1(package.read_bytes()).hexdigest() != checksum:
            raise RuntimeError('Incomplete or invalid package: ' + filename)
        with zipfile.ZipFile(package) as z:
            for item in z.infolist():
                dest = destination / Path(*Path(item.filename).parts[1:])
                if item.is_dir(): dest.mkdir(parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(z.read(item))
if '--extract-only' in sys.argv:
    print('Verified local archives extracted.', flush=True)
    sys.exit(0)
print('Installing Android platform 36, build tools and ADB.', flush=True)
with (root / 'sdk-setup.log').open('w', encoding='utf-8') as log:
    subprocess.run([str(sdkmanager), '--sdk_root=' + str(sdk), '--licenses'], input='y\n' * 100, text=True, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    if '--licenses-only' not in sys.argv:
        subprocess.run([str(sdkmanager), '--sdk_root=' + str(sdk), 'platform-tools', 'platforms;android-36', 'build-tools;36.0.0'], env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
print('Project-local Android tools are ready.', flush=True)
