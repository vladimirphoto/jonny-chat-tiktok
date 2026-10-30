// node tools/make-template.js <out.shortcut> — неподписанный шаблон; подпись делает macOS (shortcuts sign) в CI
require('fs').writeFileSync(process.argv[2] || 'template.shortcut', require('../shortcut').buildTemplate());
