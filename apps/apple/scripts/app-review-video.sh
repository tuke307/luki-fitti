#!/usr/bin/env bash
# Record the App Review walkthrough on a physical iPhone — one screen-recording video
# per language (en + de). Run: yarn review:video (from apps/apple).
#
# Prereqs on the Mac: dev stack running (API on :3001, Mailpit on :8025), XcodeGen,
# signing set up in Config/Local.xcconfig. On the iPhone: unlocked, same Wi-Fi,
# Developer Mode + Settings › Developer › Enable UI Automation.
#
# Overrides: DEVICE_UDID, HOST_IP, API_PORT, MAILPIT_URL, RELAY_PORT, REVIEW_PACE_SECONDS.
set -euo pipefail
cd "$(dirname "$0")/.."

XCODEPROJ="LukiFitti.xcodeproj"
SCHEME="LukiFittiIOS"
TEST_CLASS="LukiFittiIOSUITests/AppReviewWalkthroughUITests"
OUT_DIR="build/app-review"
DERIVED_DATA="$OUT_DIR/dd"
RELAY_PORT="${RELAY_PORT:-4001}"
RELAY_PID=""

cleanup() {
  [ -n "$RELAY_PID" ] && kill "$RELAY_PID" 2>/dev/null || true
}
trap cleanup EXIT

VERSION=$(grep -m1 'MARKETING_VERSION' project.yml | sed -E 's/.*"([0-9.]+)".*/\1/')
echo "Version: $VERSION"

# ---------- pick the physical iPhone -----------------------------------------
# devicectl also lists simulators (transportType sameMachine) — a physical iPhone
# shows up as wired/localNetwork.
pick_device() {
  xcrun devicectl list devices --json-output /dev/stdout 2>/dev/null | python3 -c "
import json, sys
d = json.load(sys.stdin)
cands = []
for dev in d.get('result', {}).get('devices', []):
    hp = dev.get('hardwareProperties', {})
    cp = dev.get('connectionProperties', {})
    if hp.get('deviceType') != 'iPhone':
        continue
    if cp.get('pairingState') != 'paired':
        continue
    physical = cp.get('transportType') != 'sameMachine'
    connected = cp.get('tunnelState') == 'connected'
    cands.append((0 if (physical and connected) else 1 if physical else 2 if connected else 3,
                  dev['identifier'], dev.get('deviceProperties', {}).get('name', '?')))
cands.sort()
if cands:
    print(cands[0][1])
    print(cands[0][2], file=sys.stderr)
"
}

DEVICE_UDID="${DEVICE_UDID:-$(pick_device)}"
[ -z "$DEVICE_UDID" ] && {
  echo "error: no paired iPhone found — plug it in, unlock it, trust this Mac," >&2
  echo "       or pass DEVICE_UDID=<udid>" >&2
  exit 1
}
echo "Device: $DEVICE_UDID"

# ---------- dev stack ----------------------------------------------------------
HOST_IP="${HOST_IP:-$(ipconfig getifaddr en0)}"
[ -z "$HOST_IP" ] && { echo "error: no en0 IP — is the Mac on Wi-Fi?" >&2; exit 1; }
API_PORT="${API_PORT:-3001}"
# The UI-test runner executes ON the device, so Mailpit must be reachable over LAN.
MAILPIT_URL="${MAILPIT_URL:-http://$HOST_IP:8025}"

curl -sf -m 5 -o /dev/null "$MAILPIT_URL/api/v1/messages?limit=1" || {
  echo "error: Mailpit not reachable at $MAILPIT_URL — start the dev stack (docker compose up)" >&2
  exit 1
}
curl -sf -m 5 -o /dev/null "http://localhost:$API_PORT/api/health" || {
  echo "error: API not reachable at http://localhost:$API_PORT — run 'yarn workspace @luki-fitti/api dev'" >&2
  exit 1
}

# The iPhone must reach the API over LAN. If the Mac's application firewall blocks
# the dev server's binary, relay through /usr/bin/python3 (firewall-allowlisted).
API_BASE_URL="http://$HOST_IP:$API_PORT"
if ! curl -sf -m 3 -o /dev/null "$API_BASE_URL/api/health"; then
  echo "API not reachable on $API_BASE_URL — starting a LAN relay on :$RELAY_PORT via /usr/bin/python3"
  /usr/bin/python3 - "$RELAY_PORT" "127.0.0.1" "$API_PORT" "$HOST_IP" >/dev/null 2>&1 <<'PY' &
import socket, threading, sys
listen_port = int(sys.argv[1]); target_host = sys.argv[2]; target_port = int(sys.argv[3])
bind_ip = sys.argv[4]
srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind((bind_ip, listen_port)); srv.listen(50)
def pipe(a, b):
    try:
        while True:
            data = a.recv(65536)
            if not data: break
            b.sendall(data)
    except OSError: pass
    finally:
        for s in (a, b):
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass
while True:
    conn, _ = srv.accept()
    target = socket.create_connection((target_host, target_port))
    threading.Thread(target=pipe, args=(conn, target), daemon=True).start()
    threading.Thread(target=pipe, args=(target, conn), daemon=True).start()
PY
  RELAY_PID=$!
  sleep 1
  API_BASE_URL="http://$HOST_IP:$RELAY_PORT"
  curl -sf -m 3 -o /dev/null "$API_BASE_URL/api/health" || {
    echo "error: API still unreachable on LAN ($API_BASE_URL). Check the Mac firewall —" >&2
    echo "       System Settings › Network › Firewall must allow the node binary." >&2
    exit 1
  }
fi
echo "API base URL for the device: $API_BASE_URL"

# ---------- build -------------------------------------------------------------
mkdir -p "$OUT_DIR"
xcodegen generate

xcodebuild build-for-testing \
  -project "$XCODEPROJ" -scheme "$SCHEME" \
  -destination "platform=iOS,id=$DEVICE_UDID" \
  -derivedDataPath "$DERIVED_DATA" \
  -allowProvisioningUpdates \
  | tee "$OUT_DIR/build.log" | tail -5

XCTESTRUN_BUILT=$(find "$DERIVED_DATA/Build/Products" -name '*.xctestrun' ! -name '*.review.*' | head -1)
[ -z "$XCTESTRUN_BUILT" ] && { echo "error: no .xctestrun produced" >&2; exit 1; }
# Keep the patched file next to the build products — __TESTROOT__ is relative to it.
XCTESTRUN="${XCTESTRUN_BUILT%.xctestrun}.review.xctestrun"

# ---------- patch the xctestrun ------------------------------------------------
# Screen-recording keys on the iOS test target + env. The runner executes ON the
# device: EnvironmentVariables reach the test runner (Mailpit URL, pacing),
# UITargetAppEnvironmentVariables reach the app (API base URL).
python3 - "$XCTESTRUN_BUILT" "$XCTESTRUN" "$MAILPIT_URL" "$API_BASE_URL" "${REVIEW_PACE_SECONDS:-0.75}" <<'PY'
import plistlib, sys
src, dst, mailpit, api, pace = sys.argv[1:6]
doc = plistlib.load(open(src, 'rb'))

def targets(doc):
    for key, value in doc.items():
        if isinstance(value, dict) and 'BlueprintName' in value:
            yield value
    for config in doc.get('TestConfigurations', []):
        yield from config.get('TestTargets', [])

count = 0
for target in targets(doc):
    if 'LukiFittiIOS' not in target.get('BlueprintName', ''):
        continue
    target['PreferredScreenCaptureFormat'] = 'screenRecording'
    target['SystemAttachmentLifetime'] = 'keepAlways'
    env = target.setdefault('EnvironmentVariables', {})
    env['MAILPIT_URL'] = mailpit
    env['LUKIFITTI_API_BASE_URL'] = api
    env['REVIEW_PACE_SECONDS'] = pace
    ui_env = target.setdefault('UITargetAppEnvironmentVariables', {})
    ui_env['LUKIFITTI_API_BASE_URL'] = api
    ui_env['LUKIFITTI_MAILPIT_URL'] = mailpit
    count += 1

if count == 0:
    sys.exit('error: no LukiFittiIOS test target found in xctestrun')
plistlib.dump(doc, open(dst, 'wb'))
print(f"patched {dst} ({count} target(s))")
PY

export_video() {
  local result="$1" lang="$2"
  local tmp out
  tmp=$(mktemp -d)
  if ! xcrun xcresulttool export attachments --path "$result" --output-path "$tmp" 1>&2; then
    echo "warn: no attachments exported from $result" >&2
    rm -rf "$tmp"; return 1
  fi
  out=$(python3 - "$tmp" "$OUT_DIR" "$lang" "$VERSION" <<'PY'
import json, os, shutil, sys
tmp, outdir, lang, version = sys.argv[1:5]
video_exts = {'.mp4', '.mov', '.m4v'}
videos = []
for entry in json.load(open(os.path.join(tmp, 'manifest.json'))):
    for e in entry.get('attachments', [entry] if 'exportedFileName' in entry else []):
        name = e.get('exportedFileName') or e.get('suggestedHumanReadableName') or ''
        ext = os.path.splitext(name)[1].lower()
        if ext in video_exts:
            videos.append((e.get('timestamp', 0), name))
videos.sort()
if not videos:
    sys.exit('error: no video attachment in manifest')
src = os.path.join(tmp, videos[-1][1])
ext = os.path.splitext(src)[1]
dst = os.path.join(outdir, f'LukiFitti-{version}-{lang}{ext}')
shutil.copy(src, dst)
print(dst)
PY
)
  rm -rf "$tmp"
  echo "$out"
}

# The recording starts before app.launch() — the first seconds show the iOS home
# screen. Cut them so the video starts just before the app's launch animation
# (Apple requires it to "begin with launching the app").
TRIM_START_SECONDS="${TRIM_START_SECONDS:-4.0}"
# avconvert needs a .mp4 source and rejects some basenames inside build/ — work in /tmp.
trim_video() {
  local video="$1" dir
  dir=$(mktemp -d)
  cp "$video" "$dir/src.mp4"
  if avconvert -s "$dir/src.mp4" -p PresetHighestQuality -o "$dir/out.mp4" --replace --start "$TRIM_START_SECONDS" >/dev/null 2>&1 \
     && [ -s "$dir/out.mp4" ]; then
    mv -f "$dir/out.mp4" "$video"
    echo "trimmed $(basename "$video"): first ${TRIM_START_SECONDS}s removed"
  else
    echo "note: trim failed for $(basename "$video") — keeping untrimmed file"
  fi
  rm -rf "$dir"
}

# The App Review attachment next to the App Store screenshots gets a compressed
# 720p copy (avconvert Preset1280x720), copied when it comes out under 20 MB.
copy_for_marketing() {
  local video="$1" lang="$2" locale dst size
  [ -f "$video" ] || return 0
  case "$lang" in
    en) locale="en-US" ;;
    de) locale="de-DE" ;;
    *) return 0 ;;
  esac
  dst="marketing/appstore/$locale/app-walkthrough"
  mkdir -p "$dst"
  if ! avconvert -s "$video" -p Preset1280x720 -o "$dst/LukiFitti.mp4" --replace >/dev/null 2>&1; then
    echo "note: avconvert failed for $(basename "$video") — no marketing copy"
    return 0
  fi
  size=$(stat -f%z "$dst/LukiFitti.mp4")
  if [ "$size" -ge 20971520 ]; then
    echo "note: compressed video is $((size / 1048576)) MB (>= 20 MB) — removed $dst/LukiFitti.mp4"
    rm -f "$dst/LukiFitti.mp4"
    return 0
  fi
  echo "copied for App Review: $dst/LukiFitti.mp4 ($((size / 1024)) KB, 720p compressed)"
}

run_lang() {
  local suffix="$1" lang="$2"
  local result="$OUT_DIR/LukiFitti-review-$lang.xcresult"
  rm -rf "$result"
  echo "== walkthrough ($lang) =="
  xcodebuild test-without-building \
    -xctestrun "$XCTESTRUN" \
    -destination "platform=iOS,id=$DEVICE_UDID" \
    "-only-testing:$TEST_CLASS/testAppReviewWalkthrough$suffix" \
    -resultBundlePath "$result" \
    | tee "$OUT_DIR/test-$lang.log" | tail -5
  local video
  video=$(export_video "$result" "$lang")
  echo "$video"
  trim_video "$video"
  copy_for_marketing "$video" "$lang"
}

# LANGS="en de" (default) — set LANGS=de to record only German.
LANGS="${LANGS:-en de}"
for lang in $LANGS; do
  case "$lang" in
    en) run_lang En en ;;
    de) run_lang De de ;;
    *) echo "error: unknown LANG '$lang' (use en or de)" >&2; exit 1 ;;
  esac
done

echo "Done. Videos in $OUT_DIR:"
ls -1 "$OUT_DIR"/LukiFitti-"$VERSION"-*.* 2>/dev/null || true
