#!/bin/zsh
# Makes a release of the Mac app that every installed copy will offer as an update.
#
#   ./release.sh 1.2 notes.md             build it into dist/: the zip and its appcast.xml
#   ./release.sh 1.2 notes.md --publish   the same, then commit the version, push, and publish the GitHub release
#
# notes.md is what's new, in Markdown; it goes in the update window and on the release page.
# The version goes into Info.plist with the next build number (Sparkle compares build numbers).
# The zip is signed with the update key in ~/Library/Application Support/Phosphene Wallpaper/sparkle-private-key;
# installed copies only accept updates signed with it (SUPublicEDKey in Info.plist). Keep a backup of that file:
# without it no existing install can ever be updated again.
# FEED_BASE=http://127.0.0.1:8799 ./release.sh ... points the appcast at a local server, for testing.
set -e
cd "$(dirname "$0")"
VERSION="$1"; NOTES="$2"; PUBLISH=0; [[ "$3" == "--publish" ]] && PUBLISH=1
[[ "$VERSION" =~ '^[0-9]+\.[0-9]+(\.[0-9]+)?$' && -f "$NOTES" ]] || { echo "usage: ./release.sh 1.2 notes.md [--publish]" >&2; exit 1; }
KEY="$HOME/Library/Application Support/Phosphene Wallpaper/sparkle-private-key"
[[ -f "$KEY" ]] || { echo "No update signing key at $KEY" >&2; exit 1; }
REPO=maxsorto/phosphene
if (( PUBLISH )); then
  [[ -z "$(git -C .. status --porcelain -- . ':!wallpaper/Info.plist')" ]] \
    || { echo "Commit your other changes first: a release is built from what is committed." >&2; exit 1; }
  gh release view "v$VERSION" --repo $REPO >/dev/null 2>&1 && { echo "v$VERSION is already released." >&2; exit 1; }
fi

PB=/usr/libexec/PlistBuddy
BUILD=$(( $($PB -c "Print :CFBundleVersion" Info.plist) + 1 ))
$PB -c "Set :CFBundleShortVersionString $VERSION" -c "Set :CFBundleVersion $BUILD" Info.plist
./build.sh --release

ZIP=dist/Phosphene-Wallpaper.zip
SIG=$(vendor/Sparkle-*/bin/sign_update --ed-key-file "$KEY" "$ZIP")          # sparkle:edSignature="..." length="..."
URL="${FEED_BASE:-https://github.com/$REPO/releases/download/v$VERSION}/Phosphene-Wallpaper.zip"
MIN=$($PB -c "Print :LSMinimumSystemVersion" Info.plist)
cat > dist/appcast.xml <<XML
<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Phosphene Wallpaper</title>
    <item>
      <title>Phosphene Wallpaper $VERSION</title>
      <link>https://github.com/$REPO/releases/tag/v$VERSION</link>
      <sparkle:version>$BUILD</sparkle:version>
      <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>$MIN.0</sparkle:minimumSystemVersion>
      <pubDate>$(LC_ALL=C date -u "+%a, %d %b %Y %H:%M:%S +0000")</pubDate>
      <description sparkle:format="markdown"><![CDATA[
$(cat "$NOTES")
]]></description>
      <enclosure url="$URL" $SIG type="application/octet-stream"/>
    </item>
  </channel>
</rss>
XML
echo "Built dist/appcast.xml for $VERSION (build $BUILD)"

if (( PUBLISH )); then
  git add Info.plist && git commit -q -m "Mac app $VERSION"
  git push -q origin HEAD
  gh release create "v$VERSION" "$ZIP" dist/appcast.xml --repo $REPO --target "$(git rev-parse HEAD)" \
    --title "Phosphene for Mac $VERSION" --notes-file "$NOTES"
  echo "Published v$VERSION. Installed copies will see it within a day, or at once with Check for Updates."
fi
