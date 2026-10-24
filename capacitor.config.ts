CAP_V=$(npm view @capacitor/core version)

npm install --no-audit --no-fund --legacy-peer-deps \
  @capacitor/core@"$CAP_V" \
  @capacitor/cli@"$CAP_V" \
  @capacitor/android@"$CAP_V" \
  @capacitor/camera@"$CAP_V" \
  @capacitor/share@"$CAP_V" \
  @capacitor/filesystem@"$CAP_V" \
  @capacitor/app@"$CAP_V"
