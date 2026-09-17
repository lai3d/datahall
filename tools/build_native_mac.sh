#!/usr/bin/env bash
# Compile unity/Native/DataHallNative.m into the Unity macOS plugin unity/Assets/Plugins/macOS/DataHallNative.bundle (arm64 + x86_64)
# Requires the Xcode command line tools. The output is committed (binaries via Git LFS), so machines without Xcode need not rebuild it.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
bundle="$root/unity/Assets/Plugins/macOS/DataHallNative.bundle"
rm -rf "$bundle"
mkdir -p "$bundle/Contents/MacOS"
cat > "$bundle/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleDevelopmentRegion</key><string>en</string>
    <key>CFBundleExecutable</key><string>DataHallNative</string>
    <key>CFBundleIdentifier</key><string>com.datahall.native</string>
    <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
    <key>CFBundleName</key><string>DataHallNative</string>
    <key>CFBundlePackageType</key><string>BNDL</string>
    <key>CFBundleShortVersionString</key><string>1.0</string>
    <key>CFBundleVersion</key><string>1</string>
</dict>
</plist>
PLIST
xcrun clang -bundle -fobjc-arc -O2 -Wall -Werror -arch arm64 -arch x86_64 -mmacosx-version-min=12.0 \
  -framework Cocoa -framework UniformTypeIdentifiers \
  -o "$bundle/Contents/MacOS/DataHallNative" "$root/unity/Native/DataHallNative.m"
codesign --force --sign - "$bundle"
lipo -archs "$bundle/Contents/MacOS/DataHallNative"
