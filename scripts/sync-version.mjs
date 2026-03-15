import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const version = pkg.version;
const srcDir = 'src';

const pluginFolders = fs.readdirSync(srcDir).filter(f => {
  const folderPath = path.join(srcDir, f);
  return fs.statSync(folderPath).isDirectory() && fs.existsSync(path.join(folderPath, 'header.json'));
});

pluginFolders.forEach(folder => {
  const headerPath = path.join(srcDir, folder, 'header.json');
  const header = JSON.parse(fs.readFileSync(headerPath, 'utf8'));
  
  // Update version
  header.version = version;
  
  // Update name if it contains " vX.X.X" for debugging (as previously requested)
  if (header.name && header.name.match(/ v\d+\.\d+\.\d+/)) {
    header.name = header.name.replace(/ v\d+\.\d+\.\d+/, ` v${version}`);
  }
  
  fs.writeFileSync(headerPath, JSON.stringify(header, null, 2) + '\n');
  console.log(`Updated ${headerPath} to v${version}`);
});
