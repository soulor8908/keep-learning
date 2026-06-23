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
    'import.meta.env.VITE_WIDGET_NAME': JSON.stringify(widgetName),
    'import.meta.env.VITE_WIDGET_COMPONENT': JSON.stringify('__WIDGET_COMPONENT__')
  }
});
