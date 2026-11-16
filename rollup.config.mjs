// Toolchain following the jk-bms-card fork (A01d AU2): rollup-plugin-typescript2 with
// include pattern, lit is bundled; output as ES module for the Lovelace resource.
import { readFileSync } from 'node:fs';
import typescript from 'rollup-plugin-typescript2';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// replaces __VERSION__ after the TypeScript run with the version from package.json
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
