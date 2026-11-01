// Werkzeugkette nach dem Fork jk-bms-card (A01d AU2): rollup-plugin-typescript2 mit
// include-Muster, lit wird mitgebuendelt; Ausgabe als ES-Modul fuer die Lovelace-Ressource.
import { readFileSync } from 'node:fs';
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// ersetzt __VERSION__ nach dem TypeScript-Lauf durch die Version aus package.json
const versionStamp = {
  name: 'version-stamp',
  transform(code) {
    return code.includes('__VERSION__') ? { code: code.split('__VERSION__').join(JSON.stringify(version)), map: null } : null;
  },
};

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/battery-dashboard.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve(),
    typescript({ include: ['**/*.ts'] }),
    versionStamp,
    terser({ ecma: 2020 }),
  ],
};
