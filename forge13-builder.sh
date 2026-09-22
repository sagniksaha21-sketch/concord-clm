#!/usr/bin/env bash
set -euo pipefail

echo "[FORGE] Android Alpha 2 build runner starting"
export EXPO_NO_TELEMETRY=1
export CI=1

WORK=/workspace/forge13-alpha2
OUT=/srv/forge13
rm -rf "$WORK" "$OUT"
mkdir -p "$WORK" "$OUT"
cd "$WORK"

echo "[FORGE] Reconstructing exact Alpha 2 native source"
: "${SRC_A2_CHUNKS:?SRC_A2_CHUNKS is required}"
for i in $(seq 0 $((SRC_A2_CHUNKS-1))); do
  v="SRC_A2_$i"
  printf "%s" "${!v}"
done | base64 -d | tar -xz

mkdir -p assets/splash assets/programmes src/graphics
BASE="${FORGE_ASSET_BASE:-https://forge-v120-2.vercel.app}"

fetch(){
  local url="$1" out="$2"
  echo "[FORGE] asset -> $out"
  curl -fsSL --retry 6 --retry-delay 2 "$url" -o "$out"
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

echo "[FORGE] Recovering proven FHM2 body mesh from current Forge parity source"
fetch "$BASE/forge-v11-classic.html" /tmp/forge-v11-classic.html
node - <<'NODE'
const fs=require('fs');
const html=fs.readFileSync('/tmp/forge-v11-classic.html','utf8');
const m=html.match(/(?:const|let|var)\s+V104_MESH_B64\s*=\s*["']([^"']+)["']/);
if(!m) throw new Error('V104_MESH_B64 not found in parity source');
fs.mkdirSync('src/graphics',{recursive:true});
fs.writeFileSync(
  'src/graphics/bodyMesh.ts',
  '// FORGE native body mesh — recovered from proven v12 FHM2 payload.\nexport const BODY_MESH_B64 = '+JSON.stringify(m[1])+';\n'
);
console.log('[FORGE] FHM2 payload chars',m[1].length);
NODE

echo "[FORGE] Ensuring Android API 36 toolchain"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platforms;android-36" "build-tools;36.0.0" >/dev/null

echo "[FORGE] Installing Alpha 2 dependencies"
npm install --no-audit --no-fund

echo "[FORGE] Running native source regression checks"
npm test
node scripts/static-check.mjs
node scripts/check-body.mjs

echo "[FORGE] Generating Android native project"
npx expo prebuild --platform android --no-install

echo "[FORGE] Running Gradle assembleDebug"
cd android
chmod +x gradlew
export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx1200m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8"
./gradlew assembleDebug --no-daemon --max-workers=1 --stacktrace

APK="$WORK/android/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
cp "$APK" "$OUT/FORGE-V13.0.0-Alpha2.apk"
stat -c '[FORGE] APK bytes: %s' "$OUT/FORGE-V13.0.0-Alpha2.apk"
sha256sum "$OUT/FORGE-V13.0.0-Alpha2.apk" | tee "$OUT/SHA256.txt"
echo "[FORGE] APK READY: $OUT/FORGE-V13.0.0-Alpha2.apk"

cd "$OUT"
node - <<'NODE'
const http=require('http'),fs=require('fs'),path=require('path');
const root='/srv/forge13',apk='FORGE-V13.0.0-Alpha2.apk';
http.createServer((req,res)=>{
  if(req.url==='/health'){
    const p=path.join(root,apk);
    if(!fs.existsSync(p)){res.writeHead(503,{'Content-Type':'text/plain'});return res.end('building');}
    res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');
  }
  if(req.url==='/SHA256.txt'){
    res.writeHead(200,{'Content-Type':'text/plain'});
    return fs.createReadStream(path.join(root,'SHA256.txt')).pipe(res);
  }
  if(req.url==='/'+apk){
    const p=path.join(root,apk);
    const st=fs.statSync(p);
    res.writeHead(200,{
      'Content-Type':'application/vnd.android.package-archive',
      'Content-Length':st.size,
      'Content-Disposition':'attachment; filename="'+apk+'"'
    });
    return fs.createReadStream(p).pipe(res);
  }
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
  res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#050507;color:#fff;font-family:system-ui;padding:32px"><h1 style="font-size:42px;font-style:italic">FORGE 13</h1><p>React Native Android · Alpha 2</p><a style="color:#ffb347;font-size:22px" href="/'+apk+'">Download APK</a></body>');
}).listen(process.env.PORT||3000,'0.0.0.0');
NODE
