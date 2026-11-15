#!/bin/zsh
# One-time setup: a self-signed code-signing identity for local builds, kept in its
# own keychain. Without it the app is ad-hoc signed, every rebuild looks like a new
# app to macOS, and the "System Audio Recording" permission is asked for again.
# With it, the app's identity stays the same across rebuilds and the permission holds.
# The key never leaves this Mac and is trusted for nothing else.   ./setup-signing.sh
set -e
NAME="Phosphene Wallpaper Local Signing"
KEYCHAIN="$HOME/Library/Keychains/phosphene-signing.keychain-db"
STORE="$HOME/Library/Application Support/Phosphene Wallpaper"
PASSFILE="$STORE/signing-keychain-password"

if [[ -f "$KEYCHAIN" && -f "$PASSFILE" ]] && security find-identity -p codesigning "$KEYCHAIN" 2>/dev/null | grep -q "$NAME"; then
  echo "Signing identity already set up."; exit 0
fi

mkdir -p "$STORE"
umask 077
[[ -f "$PASSFILE" ]] || /usr/bin/openssl rand -hex 24 > "$PASSFILE"
PASS="$(cat "$PASSFILE")"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

cat > "$WORK/cert.conf" <<CONF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
CONF
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -config "$WORK/cert.conf" \
  -keyout "$WORK/key.pem" -out "$WORK/cert.pem" >/dev/null 2>&1
/usr/bin/openssl pkcs12 -export -inkey "$WORK/key.pem" -in "$WORK/cert.pem" -name "$NAME" \
  -out "$WORK/identity.p12" -passout "pass:$PASS" >/dev/null 2>&1

[[ -f "$KEYCHAIN" ]] || security create-keychain -p "$PASS" "$KEYCHAIN"
security set-keychain-settings "$KEYCHAIN"                       # no auto-lock
security unlock-keychain -p "$PASS" "$KEYCHAIN"
security import "$WORK/identity.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$PASS" "$KEYCHAIN" >/dev/null 2>&1
echo "Created \"$NAME\" in $KEYCHAIN"
