// 老项目 vite.config.js（迁移前）：
// 普通 Vite 配置，仅做本地预览，不涉及 wc 物料打包。
// 迁移后会引入 wc/widget-wrapper-plugin/vite-plugin.js 输出 UMD 物料（见 README 迁移后说明）。
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()]
});
