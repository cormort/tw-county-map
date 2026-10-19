import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 這個站是純靜態的：資料在 public/data/*.json（用 scripts/snapshot.mjs 從 ly-dashboard 產生）。
 * base 用相對路徑，所以丟到 GitHub Pages 的子路徑或任何資料夾都能跑。
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist' },
});
