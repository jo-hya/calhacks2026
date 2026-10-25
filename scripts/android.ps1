param([ValidateSet('build', 'run', 'devices')][string]$Mode = 'run', [string]$Serial = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$sdkRoot = Join-Path $projectRoot '.android-tools/sdk'
$jdkRoot = Join-Path $projectRoot '.android-tools/jdk'
$adbPath = Join-Path $sdkRoot 'platform-tools/adb.exe'
if (!(Test-Path $adbPath)) { throw 'Android tools are missing. Run: python scripts/setup-android.py' }
$env:ANDROID_HOME = $sdkRoot
$env:JAVA_HOME = $jdkRoot
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.android-tools/gradle'
$env:ANDROID_USER_HOME = Join-Path $projectRoot '.android-tools/user'

function Assert-Exit([string]$Action) { if ($LASTEXITCODE -ne 0) { throw "$Action failed (exit $LASTEXITCODE)." } }
if ($Mode -eq 'devices') { & $adbPath devices -l; Assert-Exit 'Device discovery'; exit }

if ($Mode -eq 'build') {
    & npm.cmd run build
    Assert-Exit 'Web build'
    & npx.cmd cap sync android
    Assert-Exit 'Android sync'
    # Local USB development URL only. No pairing credentials enter the APK.
    $configPath = Join-Path $projectRoot 'android/app/src/main/assets/capacitor.config.json'
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $config | Add-Member -Force NoteProperty server @{ url = 'http://localhost:3002'; cleartext = $true }
    [System.IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding $false))
    $sdkProperty = 'sdk.dir=' + $sdkRoot.Replace('\', '/')
    Set-Content -LiteralPath (Join-Path $projectRoot 'android/local.properties') -Value $sdkProperty -Encoding ASCII
    Push-Location android
    $gradlePath = Join-Path $projectRoot '.android-tools/gradle-dist/gradle-8.14.3/bin/gradle.bat'
    if (!(Test-Path $gradlePath)) { $gradlePath = '.\gradlew.bat' }
    try { & $gradlePath assembleDebug --console=plain --no-daemon --max-workers=1; Assert-Exit 'APK build' }
    finally { Pop-Location }
    Write-Host 'APK ready: android/app/build/outputs/apk/debug/app-debug.apk'
    exit
}

$apk = Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk'
if (!(Test-Path $apk)) { throw 'Build the APK first: npm run android:build' }
$linkFile = Join-Path $projectRoot '.pocket/device-link.json'
if (!(Test-Path $linkFile)) { throw 'Start the backend first: npm run demo' }
$link = Get-Content -LiteralPath $linkFile -Raw | ConvertFrom-Json
if ($link.token -notmatch '^[a-f0-9]{48}$') { throw 'Invalid pairing file. Restart npm run demo.' }
# Pair like the app does: the token exchanges for a session cookie, which the API accepts.
$pairing = Invoke-WebRequest "http://127.0.0.1:3002/pair/$($link.token)" -MaximumRedirection 0 -ErrorAction SilentlyContinue -UseBasicParsing
$sessionCookie = ($pairing.Headers['Set-Cookie'] | Select-Object -First 1) -replace ';.*$', ''
if ($sessionCookie -notmatch '^pocket=') { throw 'Could not pair with the backend. Restart npm run demo.' }
$backendSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$backendSession.Cookies.Add((New-Object System.Net.Cookie('pocket', $sessionCookie.Substring(7), '/', '127.0.0.1')))
$null = Invoke-RestMethod 'http://127.0.0.1:3002/api/state' -WebSession $backendSession
$deviceOutput = & $adbPath devices
Assert-Exit 'Device discovery'
$devices = @($deviceOutput | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if (!$Serial) {
    if ($devices.Count -ne 1) { throw 'Connect and unlock one Android phone, enable USB debugging, and accept its Allow USB debugging prompt. Use npm run android:devices to check.' }
    $Serial = $devices[0]
}
if ($Serial -notin $devices) { throw 'Selected phone is not connected and authorized.' }
& $adbPath -s $Serial reverse tcp:3002 tcp:3002
Assert-Exit 'USB backend forwarding'
& $adbPath -s $Serial install -r $apk
Assert-Exit 'APK installation'
# Hide the launch output because ADB includes intent extras in its status text.
$launchResult = & $adbPath -s $Serial shell am start -S -n com.pocket.budget/.MainActivity --es pocketPairToken $link.token 2>&1
Assert-Exit 'App launch'
if ($launchResult -match 'Error:|Exception') { throw 'Android could not launch Lila.' }
Write-Host 'Lila is installed and running. Keep USB connected and npm run demo running.'
