#!/usr/bin/env bash
# 编译 unity/Native/DataHallNative.m 为 Unity macOS 插件：unity/Assets/Plugins/macOS/DataHallNative.bundle（arm64 + x86_64）
# 需要 Xcode 命令行工具。产物提交进仓库（二进制走 Git LFS），没有 Xcode 的机器不需要重新编译。
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
