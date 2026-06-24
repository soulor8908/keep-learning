import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

const widgetName = process.env.VITE_WIDGET_NAME;
const widgetComponent = process.env.VITE_WIDGET_COMPONENT;

if (!widgetName || !widgetComponent) {
  throw new Error('请设置环境变量 VITE_WIDGET_NAME 和 VITE_WIDGET_COMPONENT');
}

export default defineConfig({
  plugins: [vue({
    template: {
      compilerOptions: {
        // 告诉 Vue3 编译器 aui-* 是自定义元素，不要当 Vue 组件解析
        isCustomElement: (tag) => tag.startsWith('aui-')
      }
    }
  })],
  build: {
    lib: {
      entry: path.resolve(__dirname, './widget-wrapper.js'),
      name: widgetName,
      fileName: () => `${widgetName}.js`,
      formats: ['umd']
    },
    rollupOptions: {
      external: ['vue', 'aui'],
      output: {
        globals: {
          vue: 'Vue',
          aui: 'aui'
        }
      }
    }
  },
  resolve: {
    alias: {
      // wrapper 里用绝对路径定位业务组件
      __WIDGET_COMPONENT__: path.resolve(process.cwd(), widgetComponent)
    }
  },
  define: {
    // 注入全局变量供 widget-wrapper.js 使用（不依赖 Vite 特有的 import.meta.env，
    // 使 wrapper 文件可被 webpack 等其他工具处理）
    __WIDGET_NAME__: JSON.stringify(widgetName),
    __WIDGET_COMPONENT__: JSON.stringify('__WIDGET_COMPONENT__')
  }
});
