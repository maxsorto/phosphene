#!/bin/zsh
# Builds "Phosphene Wallpaper.app" next to this script (in build/). Needs Xcode's
# command line tools. The engine is copied in from the repository: the app runs
# exactly the files the website serves.   ./build.sh [--run]
#   ./build.sh --release   a copy for other Macs: Apple silicon and Intel in one app, zipped to
#                          dist/Phosphene-Wallpaper.zip. ./release.sh does this and the rest of a release.
#
# Signing. With ./setup-signing.sh run once, every build (this Mac's and the releases) is signed with the
# same self-signed identity, so macOS sees each new version as the same app: it keeps its audio permission
# across rebuilds and across updates. Without it the app is signed ad hoc (fine for a quick local build,
# but each build looks new to macOS). A release refuses to build without the identity.
set -e
cd "$(dirname "$0")"
APP="build/Phosphene Wallpaper.app"
RELEASE=0; [[ "$1" == "--release" ]] && RELEASE=1

# Sparkle, the updater: a pinned release, checked against its published SHA-256, kept in vendor/ (not in git)
SPARKLE_VERSION=2.10.1
SPARKLE_SHA=1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27
SPARKLE="vendor/Sparkle-$SPARKLE_VERSION"
if [[ ! -d "$SPARKLE/Sparkle.framework" ]]; then
  mkdir -p vendor
  curl -sfL -o "vendor/Sparkle-$SPARKLE_VERSION.tar.xz" "https://github.com/sparkle-project/Sparkle/releases/download/$SPARKLE_VERSION/Sparkle-$SPARKLE_VERSION.tar.xz"
  echo "$SPARKLE_SHA  vendor/Sparkle-$SPARKLE_VERSION.tar.xz" | shasum -a 256 -c --quiet
  mkdir -p "$SPARKLE" && tar -xf "vendor/Sparkle-$SPARKLE_VERSION.tar.xz" -C "$SPARKLE"
fi

rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web" "$APP/Contents/Frameworks"
compile() { swiftc -O -swift-version 5 -target "$1-apple-macos14.2" Sources/*.swift -F "$SPARKLE" \
  -framework AppKit -framework WebKit -framework CoreAudio -framework AudioToolbox -framework ServiceManagement -framework IOKit -framework Sparkle \
  -Xlinker -rpath -Xlinker @executable_path/../Frameworks -o "$2"; }
if (( RELEASE )); then
  compile arm64 build/arm64; compile x86_64 build/x86_64
  lipo -create build/arm64 build/x86_64 -output "$APP/Contents/MacOS/PhospheneWallpaper"; rm build/arm64 build/x86_64
else
  compile "$(uname -m)" "$APP/Contents/MacOS/PhospheneWallpaper"
fi
cp Info.plist "$APP/Contents/Info.plist"
cp -R ../index.html ../favicon.svg ../apple-touch-icon.png ../src "$APP/Contents/Resources/web/"
# the framework, symlinks kept. The app is not sandboxed, so Sparkle's XPC services are not needed (its docs say so).
ditto "$SPARKLE/Sparkle.framework" "$APP/Contents/Frameworks/Sparkle.framework"
FW="$APP/Contents/Frameworks/Sparkle.framework"
rm -rf "$FW/Versions/B/XPCServices" "$FW/XPCServices"
# an icon from the site's touch icon
ICONS=build/AppIcon.iconset; mkdir -p $ICONS
for s in 16 32 128 256; do
  sips -z $s $s ../apple-touch-icon.png --out $ICONS/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) ../apple-touch-icon.png --out $ICONS/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns $ICONS -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null || true
rm -rf $ICONS
find "$APP" -name .DS_Store -delete

# Sign the inside first, the app last (never --deep: Sparkle's helpers need their own flags).
NAME="Phosphene Wallpaper Local Signing"
KEYCHAIN="$HOME/Library/Keychains/phosphene-signing.keychain-db"
PASSFILE="$HOME/Library/Application Support/Phosphene Wallpaper/signing-keychain-password"
sign_all() {   # $@: codesign's identity arguments
  codesign --force "$@" -o runtime "$FW/Versions/B/Autoupdate"
  codesign --force "$@" -o runtime "$FW/Versions/B/Updater.app"
  codesign --force "$@" -o runtime "$FW"
  codesign --force "$@" "$APP"
}
if [[ -f "$KEYCHAIN" && -f "$PASSFILE" ]] && security unlock-keychain -p "$(cat "$PASSFILE")" "$KEYCHAIN" 2>/dev/null \
   && sign_all --keychain "$KEYCHAIN" -s "$NAME" >/dev/null 2>&1; then
  SIGNED="signed with the local identity"
elif (( RELEASE )); then
  echo "A release needs the signing identity (run ./setup-signing.sh), so updates keep the audio permission." >&2; exit 1
else
  sign_all -s - >/dev/null 2>&1
  SIGNED="ad-hoc signed: run ./setup-signing.sh once to keep the audio permission across rebuilds"
fi
codesign --verify --strict "$APP"

if (( RELEASE )); then
  mkdir -p dist; rm -f dist/Phosphene-Wallpaper.zip
  ditto -c -k --sequesterRsrc --keepParent "$APP" dist/Phosphene-Wallpaper.zip
  rm -rf build                                   # so the next ./build.sh --run never picks up this copy by mistake
  echo "Built wallpaper/dist/Phosphene-Wallpaper.zip (Apple silicon and Intel, $SIGNED)"
  exit 0
fi
echo "Built $APP ($SIGNED)"
[[ "$1" == "--run" ]] && open "$APP"
exit 0
