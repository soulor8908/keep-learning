/**
 * UI 分组按需加载——共享工具层
 *
 * 本文件是分组策略的唯一消费入口，三种用途都从这里取数据：
 *   1. generateImportmap()      → 生成 importmap（host 的 vite 插件注入 index.html）
 *   2. createGroupResolver()    → auto 模式的 unplugin-vue-components resolver（build.mjs）
 *   3. createManualCheckPlugin()→ manual 模式的 rollup 校验插件（build.mjs）
 *
 * 分组策略本身在 ui-groups.json，用户改那里即可，本文件不写死任何组件名。
 */
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GROUPS_FILE = resolve(__dirname, 'ui-groups.json');

/** 读取并解析分组策略（每次调用都读盘，便于 dev 热更新） */
export function loadUiGroups(file = GROUPS_FILE) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * 构建组件 → 组 反查表
 * @returns {Record<string, string>} key 形如 'element-plus:ElButton'，value 为组名 'common'
 */
export function buildComponentToGroup(groups) {
  const map = {};
  for (const [lib, cfg] of Object.entries(groups)) {
    if (lib.startsWith('_')) continue;
    for (const [groupName, components] of Object.entries(cfg.groups)) {
      for (const comp of components) {
        map[`${lib}:${comp}`] = groupName;
      }
    }
  }
  return map;
}

/**
 * 生成 importmap 的 imports 与 scopes
 *
 * 关键设计：组 specifier（element-plus/common 等）放在顶层 imports，全项目唯一 URL。
 * 任何物料 import 'element-plus/common' 都解析到同一 URL，浏览器模块图自动去重——
 * 这正是替代 ?exports= 并集方案"跨物料不去重"缺陷的核心。
 *
 * vue 仍按 URL 前缀 scope 分流（/widgets/vue2/* → Vue2，/widgets/vue3/* → Vue3），
 * 与原 ESM 方案一致，保证 Vue2/Vue3 物料依赖隔离。
 *
 * @param {object} groups loadUiGroups() 的返回
 * @param {object} [opts]
 * @param {string} [opts.cdnBase='https://esm.sh']  离线/内网时改成自托管 ESM 产物前缀
 */
export function generateImportmap(groups, opts = {}) {
  const { cdnBase = 'https://esm.sh' } = opts;

  const imports = {};
  const scopes = {
    // Vue2 物料：bare 'vue' 解析到 Vue2
    '/widgets/vue2/': { vue: `${cdnBase}/vue@${groups['element-ui'].vueDep.split('@')[1]}` },
    // Vue3 物料：bare 'vue' 解析到 Vue3
    '/widgets/vue3/': { vue: `${cdnBase}/vue@${groups['element-plus'].vueDep.split('@')[1]}` }
  };

  // 基座默认（顶层）：vue → Vue3（基座是 Vue3），以及共享的 lodash/axios
  imports.vue = `${cdnBase}/vue@${groups['element-plus'].vueDep.split('@')[1]}`;
  imports.lodash = `${cdnBase}/lodash@4.17.21`;
  imports.axios = `${cdnBase}/axios@1.7.7`;

  // 每个组一个 canonical URL，放进顶层 imports
  // 同一组件全项目只属于一组 → 同组 specifier 全项目同一 URL → 浏览器去重
  for (const [lib, cfg] of Object.entries(groups)) {
    if (lib.startsWith('_')) continue;
    for (const [groupName, components] of Object.entries(cfg.groups)) {
      const exports = components.join(',');
      imports[`${lib}/${groupName}`] =
        `${cdnBase}/${lib}@${cfg.version}?exports=${exports}&deps=${cfg.vueDep}`;
    }
  }

  return { imports, scopes };
}

/**
 * auto 模式：unplugin-vue-components resolver
 *
 * 物料 SFC 模板里写 <el-table>，本 resolver 把它解析成
 *   import { ElTable } from 'element-plus/table'
 * 而非默认的 from 'element-plus'（全量）。
 *
 * 命名转换：
 * - element-plus：<el-button> → ElButton（带 El 前缀，与导出名一致）
 * - element-ui  ：<el-button> → ElButton → 去掉 El 前缀得到 Button（element-ui 导出名）
 *
 * @param {object} groups  loadUiGroups() 的返回
 * @param {'vue2'|'vue3'} stack  当前构建的技术栈
 */
export function createGroupResolver(groups, stack) {
  const lib = stack === 'vue2' ? 'element-ui' : 'element-plus';
  const cfg = groups[lib];
  const compToGroup = {};
  for (const [groupName, components] of Object.entries(cfg.groups)) {
    for (const comp of components) compToGroup[comp] = groupName;
  }

  return {
    type: 'component',
    resolve(name) {
      // element-plus：name 已是 ElButton，直接查
      // element-ui：name 是 ElButton，需去掉 El 前缀查 Button（element-ui 的导出名不带 El）
      const lookupName = stack === 'vue2' ? name.replace(/^El/, '') : name;
      const group = compToGroup[lookupName];
      if (!group) return null; // 不在分组里的组件，交回其他 resolver 或报运行时错
      // element-ui 关键：import { Button } 但注册名必须是 ElButton（模板 <el-button> 才能匹配）
      // 用 as 字段让 unplugin-vue-components 生成 import { Button as ElButton }
      return stack === 'vue2'
        ? { name: lookupName, from: `${lib}/${group}`, as: name }
        : { name: lookupName, from: `${lib}/${group}` };
    }
  };
}

/**
 * manual 模式：rollup 校验插件
 *
 * 物料作者手动写 import { ElButton } from 'element-plus/common'，本插件只校验：
 *   1. 禁止裸 import from 'element-plus' / 'element-ui'（会全量加载，违背分组初衷）
 *   2. 组 specifier 必须是 ui-groups.json 里声明的组（防拼写错）
 * 不做任何改写，源码即产物。
 *
 * @param {object} groups  loadUiGroups() 的返回
 * @param {'vue2'|'vue3'} stack  当前构建的技术栈
 */
export function createManualCheckPlugin(groups, stack) {
  const lib = stack === 'vue2' ? 'element-ui' : 'element-plus';
  const cfg = groups[lib];
  const validGroups = new Set(Object.keys(cfg.groups).map((g) => `${lib}/${g}`));

  return {
    name: 'ui-groups-manual-check',
    transform(code, id) {
      if (!/\.(js|vue|ts)$/.test(id)) return null;
      // 匹配 from 'element-plus' / from "element-ui" 等裸导入（不含子路径）
      const bareRe = new RegExp(`from\\s+['"]${lib}['"]`, 'g');
      const scopedRe = new RegExp(`from\\s+['"](${lib}/[^'"]+)['"]`, 'g');

      const errors = [];
      let m;
      while ((m = bareRe.exec(code)) !== null) {
        errors.push(
          `manual 模式禁止裸 import '${lib}'（会全量加载）。请改用组 specifier，如 '${lib}/common'。`
        );
      }
      while ((m = scopedRe.exec(code)) !== null) {
        if (!validGroups.has(m[1])) {
          errors.push(
            `未声明的组 specifier '${m[1]}'。ui-groups.json 中 ${lib} 的有效组为：${[...validGroups].join(', ')}。`
          );
        }
      }
      if (errors.length) {
        this.error(`[ui-groups] ${id}\n  ${errors.join('\n  ')}`);
      }
      return null;
    }
  };
}
