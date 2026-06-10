#!/bin/bash
set -e

echo "Updating Flowdroid from Desktop source..."

FLOW_DIR="../flow"
FLOWDROID_DIR="."

if [ ! -d "$FLOW_DIR" ]; then
    echo "Error: Could not find flow directory at $FLOW_DIR"
    exit 1
fi

echo "Copying dist directory..."
rm -rf "$FLOWDROID_DIR/dist"
cp -r "$FLOW_DIR/dist" "$FLOWDROID_DIR/"

echo "Syncing capacitor..."
cd "$FLOWDROID_DIR"
npx cap sync android

echo "Building APK..."
cd android
./gradlew assembleDebug

echo "Deploying to connected device..."
adb install -r app/build/outputs/apk/debug/app-debug.apk

echo "Update complete! You can run the app on your device."
