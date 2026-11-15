#!/bin/zsh
# Builds "Phosphene Wallpaper.app" next to this script (in build/). Needs Xcode's
# command line tools. The engine is copied in from the repository: the app runs
# exactly the files the website serves.   ./build.sh [--run]
set -e
cd "$(dirname "$0")"
APP="build/Phosphene Wallpaper.app"
rm -rf build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos14.2" Sources/*.swift \
  -framework AppKit -framework WebKit -framework CoreAudio -framework AudioToolbox -framework ServiceManagement \
  -o "$APP/Contents/MacOS/PhospheneWallpaper"
cp Info.plist "$APP/Contents/Info.plist"
cp -R ../index.html ../favicon.svg ../apple-touch-icon.png ../src "$APP/Contents/Resources/web/"
# an icon from the site's touch icon
ICONS=build/AppIcon.iconset; mkdir -p $ICONS
for s in 16 32 128 256; do
  sips -z $s $s ../apple-touch-icon.png --out $ICONS/icon_${s}x${s}.png >/dev/null
  sips -z $((s*2)) $((s*2)) ../apple-touch-icon.png --out $ICONS/icon_${s}x${s}@2x.png >/dev/null
done
iconutil -c icns $ICONS -o "$APP/Contents/Resources/AppIcon.icns" 2>/dev/null || true
rm -rf $ICONS
codesign --force -s - "$APP" >/dev/null 2>&1
echo "Built $APP"
[[ "$1" == "--run" ]] && open "$APP"
exit 0
