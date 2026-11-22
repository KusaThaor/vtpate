const fs = require('fs');
const html = fs.readFileSync('d:/vtpate/manager.html', 'utf8');
const js = fs.readFileSync('d:/vtpate/manager.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const ids = new Set();
while ((match = regex.exec(js)) !== null) {
  ids.add(match[1]);
}

const missing = [];
for (const id of ids) {
  const idRegex = new RegExp('id=["\']' + id + '["\']');
  if (!idRegex.test(html)) {
    missing.push(id);
  }
}
console.log('Total getElementById queries:', ids.size);
console.log('Missing IDs in manager.html:', missing);
