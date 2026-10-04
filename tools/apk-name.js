// Single source of truth for release APK naming: <GameName>-v<versionName>.apk
const fs = require('fs');
const path = require('path');

function apkFileName(expo) {
  const safe = expo.name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${safe}-v${expo.version}.apk`;
}

if (require.main === module) {
  const expo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;
  const [src, destDir] = process.argv.slice(2);
  if (!src || !destDir) {
    console.log(apkFileName(expo));
  } else {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, apkFileName(expo));
    fs.copyFileSync(src, dest);
    console.log(dest);
  }
}

module.exports = { apkFileName };
