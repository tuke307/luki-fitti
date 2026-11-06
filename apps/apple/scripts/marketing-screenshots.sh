#!/usr/bin/env bash
# Capture marketing screenshots on iPhone + Watch simulators, then compose App Store and
# landing images. Run: yarn marketing:screenshots (from apps/apple).
set -euo pipefail
cd "$(dirname "$0")/.."

MARKETING_DIR="marketing"
RAW_DIR="$MARKETING_DIR/raw"
RESULTS_DIR="$MARKETING_DIR/.xcresults"
XCODEPROJ="LukiFitti.xcodeproj"

# Any recent Pro Max works — the composer renders at 1320×2868 either way. Override via env.
IPHONE_SIM="${IPHONE_SIM:-iPhone 18 Pro Max}"
WATCH_SIM="${WATCH_SIM:-Apple Watch Ultra}"
IPAD_SIM="${IPAD_SIM:-iPad Pro 13-inch (M5)}"

# ---------- pick devices -----------------------------------------------------
pick_udid() {
  local want="$1" platform="$2"
  xcrun simctl list devices available -j \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)['devices']
want='$want'.lower()
for run,devs in d.items():
    if '$platform' not in run: continue
    for dev in devs:
        if want in dev['name'].lower() and dev['isAvailable']:
            print(dev['udid']); sys.exit(0)
" || true
}

IPHONE_UDID=$(pick_udid "$IPHONE_SIM" iOS)
WATCH_UDID=$(pick_udid "$WATCH_SIM" watchOS)
IPAD_UDID=$(pick_udid "$IPAD_SIM" iOS)
[ -z "$IPHONE_UDID" ] && { echo "error: iPhone simulator '$IPHONE_SIM' not found" >&2; exit 1; }
[ -z "$WATCH_UDID" ] && { echo "error: Watch simulator '$WATCH_SIM' not found" >&2; exit 1; }
[ -z "$IPAD_UDID" ] && { echo "error: iPad simulator '$IPAD_SIM' not found" >&2; exit 1; }
echo "iPhone: $IPHONE_SIM ($IPHONE_UDID)"
echo "Watch:  $WATCH_SIM ($WATCH_UDID)"
echo "iPad:   $IPAD_SIM ($IPAD_UDID)"

mkdir -p "$RAW_DIR/en" "$RAW_DIR/de" "$RAW_DIR/watch-en" "$RAW_DIR/watch-de" \
  "$RAW_DIR/ipad-en" "$RAW_DIR/ipad-de" "$RESULTS_DIR"
xcodegen generate

# Dark marketing shots: force the appearance on all simulators; restore afterwards.
xcrun simctl boot "$IPHONE_UDID" 2>/dev/null || true
xcrun simctl boot "$WATCH_UDID" 2>/dev/null || true
xcrun simctl boot "$IPAD_UDID" 2>/dev/null || true
PREV_APPEARANCE=$(xcrun simctl ui "$IPHONE_UDID" appearance 2>/dev/null | awk '{print $NF}' || echo "light")
xcrun simctl ui "$IPHONE_UDID" appearance dark || true
xcrun simctl ui "$WATCH_UDID" appearance dark || true
xcrun simctl ui "$IPAD_UDID" appearance dark || true

IOS_SHOTS="01ActiveWorkout 02SetSuggestion 04ExerciseLibrary 05HistoryProgress 06MealPhoto"

# Apply the 09:41 marketing status bar. Must run AFTER the device is fully booted —
# an override issued mid-boot is silently dropped, which is how real clocks leaked in.
ensure_status_bar() {
  xcrun simctl bootstatus "$1" -b >/dev/null 2>&1 || true
  xcrun simctl status_bar "$1" override \
    --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
}

# One xcodebuild run per test so the status-bar override is re-applied before EVERY
# capture, and so a single-test re-run only touches its own attachments.
run_ios_test() {
  local udid="$1" test_name="$2" result="$3" out="$4"
  rm -rf "$result"
  ensure_status_bar "$udid"
  xcodebuild test \
    -project "$XCODEPROJ" -scheme LukiFittiIOS \
    -destination "platform=iOS Simulator,id=$udid" \
    "-only-testing:LukiFittiIOSUITests/MarketingScreenshotsUITests/${test_name}" \
    -resultBundlePath "$result" \
    CODE_SIGNING_ALLOWED=NO
  export_attachments "$result" "$out"
}

run_ios() {
  local lang="$1" suffix="$2"
  for shot in $IOS_SHOTS; do
    run_ios_test "$IPHONE_UDID" "test${shot}${suffix}" \
      "$RESULTS_DIR/ios-${lang}-${shot}.xcresult" "$RAW_DIR/$lang"
  done
}

run_ipad() {
  local lang="$1" suffix="$2"
  for shot in $IOS_SHOTS; do
    run_ios_test "$IPAD_UDID" "test${shot}${suffix}" \
      "$RESULTS_DIR/ipad-${lang}-${shot}.xcresult" "$RAW_DIR/ipad-$lang"
  done
}

run_watch() {
  local lang="$1" suffix="$2"
  local result="$RESULTS_DIR/watch-$lang.xcresult"
  rm -rf "$result"
  xcodebuild test \
    -project "$XCODEPROJ" -scheme LukiFittiWatch \
    -destination "platform=watchOS Simulator,id=$WATCH_UDID" \
    "-only-testing:LukiFittiWatchUITests/MarketingScreenshotsUITests/test03WatchWorkout${suffix}" \
    -resultBundlePath "$result" \
    CODE_SIGNING_ALLOWED=NO
  export_attachments "$result" "$RAW_DIR/watch-$lang"
}

# Export into a temp dir, then merge into the raw dir: files are copied in and the
# manifest entries are merged (a re-run of the same test replaces its old entries)
# so re-runs can never overwrite or lose other tests' manifest data.
export_attachments() {
  local result="$1" out="$2"
  local tmp
  tmp=$(mktemp -d)
  mkdir -p "$out"
  if ! xcrun xcresulttool export attachments --path "$result" --output-path "$tmp" 2>/dev/null; then
    echo "warn: no attachments exported from $result"
    rm -rf "$tmp"
    return 0
  fi
  find "$tmp" -type f ! -name 'manifest.json' -exec cp {} "$out" \;
  python3 - "$tmp/manifest.json" "$out/manifest.json" <<'PY'
import json, sys, os
new_path, old_path = sys.argv[1], sys.argv[2]
try:
    new = json.load(open(new_path))
except (OSError, json.JSONDecodeError):
    new = []
try:
    old = json.load(open(old_path))
except (OSError, json.JSONDecodeError):
    old = []
rerun_ids = {e.get('testIdentifier') for e in new}
merged = [e for e in old if e.get('testIdentifier') not in rerun_ids] + new
with open(old_path, 'w') as f:
    json.dump(merged, f)
PY
  rm -rf "$tmp"
}

echo "== iPhone screenshots (en) =="
run_ios en En
echo "== iPhone screenshots (de) =="
run_ios de De
echo "== iPad screenshots =="
run_ipad en En || echo "warn: iPad en capture failed — ipad-13 outputs will be missing"
run_ipad de De || echo "warn: iPad de capture failed — ipad-13 outputs will be missing"

echo "== Watch screenshots =="
run_watch en En || echo "warn: watch en capture failed — 03-watch (en) will be missing"
run_watch de De || echo "warn: watch de capture failed — 03-watch (de) will be missing"

xcrun simctl status_bar "$IPHONE_UDID" clear || true
xcrun simctl status_bar "$IPAD_UDID" clear || true
xcrun simctl ui "$IPHONE_UDID" appearance "${PREV_APPEARANCE:-light}" || true
xcrun simctl ui "$WATCH_UDID" appearance "${PREV_APPEARANCE:-light}" || true
xcrun simctl ui "$IPAD_UDID" appearance "${PREV_APPEARANCE:-light}" || true

echo "== Compose App Store + landing images =="
node scripts/compose-marketing.mjs

# Stamp the version these images belong to (checked by `yarn marketing:check`).
grep -m1 'MARKETING_VERSION' project.yml | sed -E 's/.*"([0-9.]+)".*/\1/' > "$MARKETING_DIR/VERSION"
echo "Done. App Store: $MARKETING_DIR/appstore/{en-US,de-DE}/"
