/**
 * 声明式物料使用插件 —— Babel AST 转换
 *
 * 目标：让物料使用像普通组件/函数调用一样。用户写声明式语法，构建期由 Babel
 * 把它转换成 loadWidget()/mountWidget() 调用，物料元信息（js/css/vueVersion）
 * 在构建期从 registry 静态解析内联，运行时无需查注册表。
 *
 * 支持两种声明式写法：
 *
 * 1) 宏调用（JS/JSX/TS 中均可）：
 *    $widget('bi-sales-panel', config)                       // 自动创建容器
 *    $widget('bi-sales-panel', containerEl, config)          // 指定容器
 *    转换为：
 *    widgetMount({ name, js, css, vueVersion }, containerEl, config)
 *
 * 2) JSX 元素（.jsx/.tsx）：
 *    <Widget name="bi-sales-panel" config={cfg} />           // 自动创建容器
 *    <Widget name="bi-sales-panel" config={cfg} container={el} />
 *    转换为：
 *    widgetMount({ name, js, css, vueVersion }, el, cfg)
 *
 * 物料元信息来源：插件选项 registry = { 'bi-sales-panel': { js, css, vueVersion } }
 * 若 registry 未声明该物料，则把 name 原样传入，运行时再从远程注册表解析
 * （widgetMount 内部支持只给 name 的情况）。
 *
 * Babel 插件用法：
 *   // babel.config.js
 *   module.exports = {
 *     plugins: [
 *       ['wc/widget-declarative-plugin/babel-plugin', {
 *         registry: { 'bi-sales-panel': { js: 'https://.../x.js', css: '.../x.css', vueVersion: '2' } },
 *         helperModule: 'wc/widget-declarative-plugin/runtime',
 *         helperName: 'widgetMount',
 *         macroName: '$widget',      // 默认 '$widget'
 *         jsxTag: 'Widget'           // 默认 'Widget'
 *       }]
 *     ]
 *   };
 */

const DEFAULT_OPTS = {
  registry: {},
  helperModule: 'wc/widget-declarative-plugin/runtime',
  helperName: 'widgetMount',
  macroName: '$widget',
  jsxTag: 'Widget'
};

/**
 * 构造物料元信息对象表达式
 * 若 registry 含该物料，内联 js/css/vueVersion；否则只放 name（运行时远程解析）
 * @param {object} t Babel types
 * @param {string} widgetName
 * @param {object} registry
 * @returns {object} ObjectExpression
 */
function buildMetaExpression(t, widgetName, registry) {
  const meta = registry[widgetName];
  if (meta) {
    const props = [t.objectProperty(t.identifier('name'), t.stringLiteral(widgetName))];
    if (meta.js) props.push(t.objectProperty(t.identifier('js'), t.stringLiteral(meta.js)));
    if (meta.css) props.push(t.objectProperty(t.identifier('css'), t.stringLiteral(meta.css)));
    if (meta.vueVersion) props.push(t.objectProperty(t.identifier('vueVersion'), t.stringLiteral(String(meta.vueVersion))));
    return t.objectExpression(props);
  }
  // 未在 registry 声明：只传 name，运行时 widgetMount 会通过远程 registry 解析
  return t.objectExpression([
    t.objectProperty(t.identifier('name'), t.stringLiteral(widgetName))
  ]);
}

/**
 * 确保 helper 已被 import，返回 helper 的 callee 表达式
 * 利用 Babel 的 program inject 机制，按需注入 import 语句（去重）
 * 通过当前 path 向上查找 Program 节点，避免依赖 pluginState.file.path 的版本差异
 */
function ensureHelperImport(t, path, pluginState) {
  const { helperModule, helperName } = { ...DEFAULT_OPTS, ...(pluginState.opts || {}) };
  // 用 pluginState 上的 Set 做去重标记（同一文件只注入一次 import）
  if (!pluginState._widgetHelperImported) {
    pluginState._widgetHelperImported = new Set();
  }
  if (pluginState._widgetHelperImported.has(helperModule + ':' + helperName)) {
    return t.identifier(helperName);
  }

  const programPath = path.findParent(p => p.isProgram()) || (path.isProgram() ? path : null);
  if (!programPath) {
    // 找不到 Program，回退：直接用 helperName 标识符（假定运行时已全局可用）
    return t.identifier(helperName);
  }
  const program = programPath.node;

  // 检查是否已存在同名 import（用户手写或多次转换）
  for (const stmt of program.body) {
    if (stmt.type !== 'ImportDeclaration') continue;
    if (stmt.source.value !== helperModule) continue;
    for (const spec of stmt.specifiers) {
      if (spec.type === 'ImportSpecifier' && spec.imported.name === helperName) {
        pluginState._widgetHelperImported.add(helperModule + ':' + helperName);
        return t.identifier(spec.local.name);
      }
    }
  }
  // 注入 import { widgetMount } from 'wc/widget-declarative-plugin/runtime';
  const importDecl = t.importDeclaration(
    [t.importSpecifier(t.identifier(helperName), t.identifier(helperName))],
    t.stringLiteral(helperModule)
  );
  programPath.unshiftContainer('body', importDecl);
  pluginState._widgetHelperImported.add(helperModule + ':' + helperName);
  return t.identifier(helperName);
}

module.exports = function widgetDeclarativeBabelPlugin(babel) {
  const t = babel.types;

  return {
    name: 'widget-declarative-transform',
    visitor: {
      // ─── 宏调用转换：$widget('name', config) 或 $widget('name', container, config) ───
      CallExpression(path, pluginState) {
        const { macroName, registry } = { ...DEFAULT_OPTS, ...(pluginState.opts || {}) };
        const node = path.node;
        if (!t.isIdentifier(node.callee) || node.callee.name !== macroName) return;

        const args = node.arguments;
        if (args.length === 0) return;

        // 第一个参数必须是字符串字面量（物料名）
        const nameArg = args[0];
        if (!t.isStringLiteral(nameArg)) {
          // 非静态物料名，无法构建期解析，跳过（保留原样，运行时处理）
          return;
        }
        const widgetName = nameArg.value;

        let containerExpr, configExpr;
        if (args.length === 1) {
          containerExpr = t.identifier('undefined');
          configExpr = t.identifier('undefined');
        } else if (args.length === 2) {
          // $widget('name', config) —— 第二个参数是 config
          containerExpr = t.identifier('undefined');
          configExpr = args[1];
        } else {
          // $widget('name', container, config)
          containerExpr = args[1];
          configExpr = args[2] || t.identifier('undefined');
        }

        const helperCallee = ensureHelperImport(t, path, pluginState);
        const metaExpr = buildMetaExpression(t, widgetName, registry);
        const replacement = t.callExpression(helperCallee, [metaExpr, containerExpr, configExpr]);
        path.replaceWith(replacement);
      },

      // ─── JSX 元素转换：<Widget name="..." [config={...}] [container={...}] /> ───
      JSXElement(path, pluginState) {
        const { jsxTag, registry } = { ...DEFAULT_OPTS, ...(pluginState.opts || {}) };
        const node = path.node;
        const opening = node.openingElement;
        if (!t.isJSXIdentifier(opening.name) || opening.name.name !== jsxTag) return;

        // 收集属性
        let widgetName = null;
        let configExpr = t.identifier('undefined');
        let containerExpr = t.identifier('undefined');
        for (const attr of opening.attributes) {
          if (!t.isJSXAttribute(attr)) continue;
          const attrName = attr.name.name;
          if (attrName === 'name') {
            // name 必须是字符串字面量
            if (t.isStringLiteral(attr.value)) {
              widgetName = attr.value.value;
            } else if (t.isJSXExpressionContainer(attr.value) && t.isStringLiteral(attr.value.expression)) {
              widgetName = attr.value.expression.value;
            }
          } else if (attrName === 'config') {
            if (t.isJSXExpressionContainer(attr.value)) {
              configExpr = attr.value.expression;
            }
          } else if (attrName === 'container') {
            if (t.isJSXExpressionContainer(attr.value)) {
              containerExpr = attr.value.expression;
            }
          }
        }

        if (!widgetName) return; // 缺少 name 或非静态，跳过

        const helperCallee = ensureHelperImport(t, path, pluginState);
        const metaExpr = buildMetaExpression(t, widgetName, registry);
        const callExpr = t.callExpression(helperCallee, [metaExpr, containerExpr, configExpr]);
        // 替换节点类型需匹配上下文：
        // - 作为 JSX 子节点（parent 是 JSXElement/JSXFragment）→ 用 JSXExpressionContainer 包裹
        // - 表达式位置（如 const el = <Widget/>）→ 直接用 CallExpression
        const parent = path.parent;
        let replacement;
        if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')) {
          replacement = t.jsxExpressionContainer(callExpr);
        } else {
          replacement = callExpr;
        }
        path.replaceWith(replacement);
      }
    }
  };
};

module.exports.buildMetaExpression = buildMetaExpression;
module.exports.DEFAULT_OPTS = DEFAULT_OPTS;
