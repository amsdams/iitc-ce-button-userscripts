import typescript from '@rollup/plugin-typescript';
import metablock from 'rollup-plugin-userscript-metablock';
import fs from 'fs';
import path from 'path';

const srcDir = 'src';
const pluginFolders = fs.readdirSync(srcDir).filter(f => {
  const folderPath = path.join(srcDir, f);
  return (
    fs.statSync(folderPath).isDirectory() && 
    fs.existsSync(path.join(folderPath, 'header.json')) &&
    fs.existsSync(path.join(folderPath, 'index.ts'))
  );
});

export default pluginFolders.map(folder => ({
  input: `src/${folder}/index.ts`,
  output: {
    file: `plugins/iitc-plugin-${folder}.user.js`,
    format: 'iife',
    name: `iitc_plugin_${folder.replace(/-/g, '_')}`,
  },
  plugins: [
    typescript(),
    metablock({
      file: `src/${folder}/header.json`,
    }),
  ],
}));
