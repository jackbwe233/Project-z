#!/usr/bin/env bash
# Set the native app name, permissions and existing Z icon. No secrets used.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_DIR="$ROOT/native-ios/ios/App/App"
INFO_PLIST="$APP_DIR/Info.plist"
ASSETS="$APP_DIR/Assets.xcassets/AppIcon.appiconset"
SOURCE_ICON="$ROOT/z-logo.png"
[[ -f "$INFO_PLIST" ]] || { echo "iOS Info.plist was not generated" >&2; exit 1; }
[[ -f "$SOURCE_ICON" ]] || { echo "Project Z brand icon is missing" >&2; exit 1; }
[[ -f "$ASSETS/Contents.json" ]] || { echo "Native AppIcon set was not generated" >&2; exit 1; }
plist_set() {
  local key="$1" value="$2"
  /usr/libexec/PlistBuddy -c "Set :$key $value" "$INFO_PLIST" 2>/dev/null ||
    /usr/libexec/PlistBuddy -c "Add :$key string $value" "$INFO_PLIST"
}
plist_set "CFBundleDisplayName" "Z"
plist_set "NSMicrophoneUsageDescription" "Z uses your microphone only when you choose to dictate or talk to Z."
plist_set "NSSpeechRecognitionUsageDescription" "Z transcribes speech when you choose to use voice features."
ICON_FILE="$(node -e '
  const fs = require("node:fs");
  const file = process.argv[1];
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const image = (json.images || []).find(x => x.filename && (!x.size || x.size === "1024x1024"))
    || (json.images || []).find(x => x.filename);
  if (!image) process.exit(1);
  process.stdout.write(image.filename);
' "$ASSETS/Contents.json")"
if [[ "$ICON_FILE" == */* || -z "$ICON_FILE" ]]; then
  echo "Invalid AppIcon asset filename" >&2
  exit 1
fi
sips -s format png -z 1024 1024 "$SOURCE_ICON" --out "$ASSETS/$ICON_FILE" >/dev/null
echo "Prepared Z iPhone branding and microphone permission descriptions."
