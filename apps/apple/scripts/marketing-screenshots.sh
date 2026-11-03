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
[ -z "$IPHONE_UDID" ] && { echo "error: iPhone simulator '$IPHONE_SIM' not found" >&2; exit 1; }
[ -z "$WATCH_UDID" ] && { echo "error: Watch simulator '$WATCH_SIM' not found" >&2; exit 1; }
echo "iPhone: $IPHONE_SIM ($IPHONE_UDID)"
echo "Watch:  $WATCH_SIM ($WATCH_UDID)"

mkdir -p "$RAW_DIR/en" "$RAW_DIR/de" "$RAW_DIR/watch-en" "$RAW_DIR/watch-de" "$RESULTS_DIR"
xcodegen generate

# Dark marketing shots: force the appearance on both simulators; restore afterwards.
xcrun simctl boot "$IPHONE_UDID" 2>/dev/null || true
xcrun simctl boot "$WATCH_UDID" 2>/dev/null || true
PREV_APPEARANCE=$(xcrun simctl ui "$IPHONE_UDID" appearance 2>/dev/null | awk '{print $NF}' || echo "light")
xcrun simctl ui "$IPHONE_UDID" appearance dark || true
xcrun simctl ui "$WATCH_UDID" appearance dark || true

IOS_SHOTS="01ActiveWorkout 02SetSuggestion 04ExerciseLibrary 05HistoryProgress 06MealPhoto"

run_ios() {
  local lang="$1" suffix="$2"
  local result="$RESULTS_DIR/ios-$lang.xcresult"
  rm -rf "$result"
  # Re-apply the status bar right before this run — boot/erase may have cleared it.
  xcrun simctl status_bar "$IPHONE_UDID" override \
    --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
  local only=()
  for shot in $IOS_SHOTS; do
    only+=("-only-testing:LukiFittiIOSUITests/MarketingScreenshotsUITests/test${shot}${suffix}")
  done
  xcodebuild test \
    -project "$XCODEPROJ" -scheme LukiFittiIOS \
    -destination "platform=iOS Simulator,id=$IPHONE_UDID" \
    "${only[@]}" \
    -resultBundlePath "$result" \
    CODE_SIGNING_ALLOWED=NO
  export_attachments "$result" "$RAW_DIR/$lang"
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

export_attachments() {
  local result="$1" out="$2"
  mkdir -p "$out"
  xcrun xcresulttool export attachments --path "$result" --output-path "$out" 2>/dev/null || \
    echo "warn: no attachments exported from $result"
}

echo "== iPhone screenshots (en) =="
run_ios en En
echo "== iPhone screenshots (de) =="
run_ios de De
echo "== Watch screenshots =="
run_watch en En || echo "warn: watch en capture failed — 03-watch (en) will be missing"
run_watch de De || echo "warn: watch de capture failed — 03-watch (de) will be missing"

xcrun simctl status_bar "$IPHONE_UDID" clear || true
xcrun simctl ui "$IPHONE_UDID" appearance "${PREV_APPEARANCE:-light}" || true
xcrun simctl ui "$WATCH_UDID" appearance "${PREV_APPEARANCE:-light}" || true

echo "== Compose App Store + landing images =="
node scripts/compose-marketing.mjs

# Stamp the version these images belong to (checked by `yarn marketing:check`).
grep -m1 'MARKETING_VERSION' project.yml | sed -E 's/.*"([0-9.]+)".*/\1/' > "$MARKETING_DIR/VERSION"
echo "Done. App Store: $MARKETING_DIR/appstore/{en-US,de-DE}/"
