'use strict';
// macOS на Apple Silicon не запускает неподписанные приложения («повреждён»). Без сертификата Apple
// подписываем приложение «ad-hoc» после упаковки — тогда оно запускается (первый раз: правый клик → Открыть).
const { execFileSync } = require('child_process');
const path = require('path');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const app = path.join(ctx.appOutDir, ctx.packager.appInfo.productFilename + '.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
