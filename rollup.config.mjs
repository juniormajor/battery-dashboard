// Toolchain (A01d AU2, E25): esbuild transpiles TypeScript per file using tsconfig.json
// (useDefineForClassFields: false for Lit), type checking runs separately with tsc --noEmit
// (npm run typecheck); lit is bundled, terser minifies; output as ES module for the Lovelace resource.
import { readFileSync } from 'node:fs';
import esbuild from 'rollup-plugin-esbuild';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// replaces __VERSION__ after the esbuild run with the version from package.json
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
    esbuild({ target: 'es2021', tsconfig: 'tsconfig.json' }),
    versionStamp,
    terser({ ecma: 2020 }),
  ],
};
