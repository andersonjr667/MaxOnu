const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const publicDir = path.join(__dirname, '..', 'public');
const imagesDir = path.join(publicDir, 'images');

if (!fs.existsSync(imagesDir)) {
  console.log('Diretório de imagens não encontrado.');
  process.exit(0);
}

const candidates = fs.readdirSync(imagesDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(imagesDir, entry.name))
  .filter((filePath) => /\.(jpe?g|png|webp)$/i.test(filePath));

(async () => {
  for (const filePath of candidates) {
    const ext = path.extname(filePath).toLowerCase();
    const outPath = filePath.replace(new RegExp(`${ext}$`, 'i'), '.webp');
    if (fs.existsSync(outPath)) continue;

    try {
      await sharp(filePath)
        .webp({ quality: 80 })
        .toFile(outPath);
      console.log(`Convertido: ${path.relative(publicDir, filePath)} -> ${path.relative(publicDir, outPath)}`);
    } catch (error) {
      console.error(`Falha ao processar ${filePath}:`, error.message);
    }
  }

  console.log('Processo de otimização concluído.');
})();
