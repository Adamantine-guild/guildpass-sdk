import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client/index.ts',
    errors: 'src/errors/index.ts',
    utils: 'src/utils/index.ts',
    types: 'src/types/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: true,
  treeshake: true,
  outDir: 'dist',
});
