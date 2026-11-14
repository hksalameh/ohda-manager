#!/usr/bin/env bash
set -euo pipefail

APK="android-app/app/build/outputs/apk/debug/app-debug.apk"
test -s "$APK"
adb install -r "$APK"
adb shell am start -W -n org.iccs.ohda/.MainActivity
sleep 8

pid="$(adb shell pidof org.iccs.ohda | tr -d '\r')"
if [[ -z "$pid" ]]; then
  echo "::error::Android app process exited after startup"
  adb logcat -d -s AndroidRuntime:E | tail -n 80
  exit 1
fi

echo "Application process is alive (pid=$pid)"
adb shell uiautomator dump /sdcard/ohda-ui.xml >/dev/null
adb shell cat /sdcard/ohda-ui.xml | grep -q "الاتصال" || {
  echo "::error::Native toolbar connection button missing"
  exit 1
}

echo "PASS: APK installed, native activity launched, toolbar rendered, process alive"
