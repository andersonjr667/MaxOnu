const fs = require('fs');
const path = require('path');

// Gera nova versão baseada no timestamp
const version = Date.now().toString();
const buildTime = new Date().toISOString();

const versionData = {
  version,
  buildTime
};

// Salva no arquivo version.json
fs.writeFileSync(
  path.join(__dirname, 'version.json'),
  JSON.stringify(versionData, null, 2)
);

console.log(`✅ Nova versão gerada: ${version}`);
console.log(`📅 Build time: ${buildTime}`);
