/**
 * element-plus 按需引入配置
 *
 * 基座按需引入物料实际用到的 element-plus 组件：
 * 1. 注册到基座 app 上（供基座自身使用）
 * 2. 挂载到 window.ElementPlus（供物料 external 掉 element-plus 后运行时获取）
 *
 * 物料构建时把 'element-plus' 设为 external，运行时从 window.ElementPlus 取组件。
 */
import {
  ElCard,
  ElStatistic,
  ElRow,
  ElProgress,
  ElButton,
  ElCol
} from 'element-plus';

import 'element-plus/es/components/card/style/css';
import 'element-plus/es/components/statistic/style/css';
import 'element-plus/es/components/row/style/css';
import 'element-plus/es/components/progress/style/css';
import 'element-plus/es/components/button/style/css';
import 'element-plus/es/components/col/style/css';

const components = [ElCard, ElStatistic, ElRow, ElProgress, ElButton, ElCol];

// 挂载到全局，供物料 UMD external 'element-plus' 后引用
window.ElementPlus = {
  ElCard,
  ElStatistic,
  ElRow,
  ElProgress,
  ElButton,
  ElCol
};

/**
 * 在基座 app 上按需注册 element-plus 组件
 * @param {import('vue').App} app
 */
export function setupElementPlus(app) {
  components.forEach((component) => {
    app.component(component.name, component);
  });
}

export default { setupElementPlus };
