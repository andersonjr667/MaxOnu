const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const skip = new Set(['header.html', 'footer.html']);
const tag = '<script src="/js/session.js"></script>';
const re = /<script\s+src="\/js\/includes\.js[^"]*"[^>]*>\s*<\/script>/i;

let patched = 0;
for (const name of fs.readdirSync(publicDir)) {
  if (!name.endsWith('.html') || skip.has(name)) continue;
  const fp = path.join(publicDir, name);
  let c = fs.readFileSync(fp, 'utf8');
  if (c.includes('/js/session.js')) continue;
  if (!re.test(c)) continue;
  const next = c.replace(re, `${tag}$&`);
  if (next === c) continue;
  fs.writeFileSync(fp, next, 'utf8');
  patched += 1;
}

console.log(`inject-session-script: patched ${patched} file(s).`);
