const fs = require('fs');
const path = require('path');

const root = process.cwd();
const output = [];
const skip = ['node_modules', '.git', '.next', '.vercel', 'package-lock.json'];
const exts = ['.ts', '.tsx', '.js', '.json', '.css', '.md'];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (skip.some(s => rel.includes(s))) continue;
    if (entry.isDirectory()) {
      walk(full);
    } else if (exts.includes(path.extname(entry.name))) {
      const content = fs.readFileSync(full, 'utf8');
      output.push(`// FILE: ${rel}\n${content}\n\n`);
    }
  }
}

walk(root);
fs.writeFileSync('erp-export.txt', output.join(''), 'utf8');
console.log(`Exportado: ${output.length} arquivos`);