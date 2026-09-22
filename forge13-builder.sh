#!/usr/bin/env bash
set -euo pipefail

echo "[FORGE] Android build runner starting"
export EXPO_NO_TELEMETRY=1
export CI=1
WORK=/workspace/forge13
OUT=/srv/forge13
rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
cd "$WORK"

echo "[FORGE] Reconstructing native source"
printf "%s" "${SRC_0:-}${SRC_1:-}${SRC_2:-}${SRC_3:-}${SRC_4:-}" | base64 -d | tar -xz

mkdir -p assets/splash assets/programmes
BASE="${FORGE_ASSET_BASE:-https://forge-v120-2.vercel.app}"

fetch(){
  local url="$1" out="$2"
  echo "[FORGE] asset -> $out"
  curl -fsSL --retry 5 --retry-delay 2 "$url" -o "$out"
}

fetch "$BASE/icon-512.png" assets/icon.png
cp assets/icon.png assets/adaptive-icon.png
fetch "$BASE/assets/analytics-body-poster.png" assets/body-poster.png
fetch "$BASE/assets/FORGE-HD-Chest-Shoulders.jpg" assets/programmes/chest-shoulders.jpg
fetch "$BASE/assets/FORGE-HD-Back-Biceps.jpg" assets/programmes/back-biceps.jpg
fetch "$BASE/assets/FORGE-HD-Legs-Triceps.jpg" assets/programmes/legs-triceps.jpg
fetch "$BASE/assets/FORGE-SPLASH-01.jpg" assets/splash/01.jpg
fetch "$BASE/assets/FORGE-SPLASH-02.jpg" assets/splash/02.jpg
fetch "$BASE/assets/FORGE-SPLASH-03.jpg" assets/splash/03.jpg
fetch "$BASE/assets/FORGE-SPLASH-04.jpg" assets/splash/04.jpg

echo "[FORGE] Ensuring Android API 36 toolchain"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platforms;android-36" "build-tools;36.0.0" >/dev/null

echo "[FORGE] Installing React Native dependencies"
npm install --no-audit --no-fund

echo "[FORGE] Generating Android native project"
npx expo prebuild --platform android --non-interactive

echo "[FORGE] Running Gradle assembleDebug"
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon --stacktrace

APK="$WORK/android/app/build/outputs/apk/debug/app-debug.apk"
test -f "$APK"
cp "$APK" "$OUT/FORGE-V13.0.0-alpha1.apk"
sha256sum "$OUT/FORGE-V13.0.0-alpha1.apk" | tee "$OUT/SHA256.txt"

echo "[FORGE] APK build complete; starting download server"
cd "$OUT"
node - <<'NODE'
const http=require('http'), fs=require('fs'), path=require('path');
const root='/srv/forge13';
const apk='FORGE-V13.0.0-alpha1.apk';
http.createServer((req,res)=>{
  if(req.url==='/health'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
  if(req.url==='/SHA256.txt'){res.writeHead(200,{'Content-Type':'text/plain'});return fs.createReadStream(path.join(root,'SHA256.txt')).pipe(res);}
  if(req.url==='/'+apk){
    const p=path.join(root,apk);
    res.writeHead(200,{'Content-Type':'application/vnd.android.package-archive','Content-Length':fs.statSync(p).size,'Content-Disposition':'attachment; filename="'+apk+'"'});
    return fs.createReadStream(p).pipe(res);
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#050507;color:#fff;font-family:system-ui;padding:32px"><h1 style="font-style:italic">FORGE 13</h1><p>Native Android alpha build.</p><a style="color:#ffb347;font-size:20px" href="/'+apk+'">Download APK</a></body>');
}).listen(process.env.PORT||3000,'0.0.0.0');
NODE
