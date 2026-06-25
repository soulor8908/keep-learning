// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const widgetDeclarativeBabelPlugin = require('../babel-plugin.js');
const { buildMetaExpression, DEFAULT_OPTS } = widgetDeclarativeBabelPlugin;

/**
 * 构造一个 mock babel.types：
 * - 构造器返回带 type 标签的普通对象（便于断言结构）
 * - 类型守卫检查 node.type 字段
 * 这样可在不依赖 @babel/core 的情况下，对 visitor 逻辑做单元测试。
 */
function createMockTypes() {
  const t = {
    identifier(name) { return { type: 'Identifier', name }; },
    stringLiteral(value) { return { type: 'StringLiteral', value }; },
    objectProperty(key, value) { return { type: 'ObjectProperty', key, value, shorthand: false }; },
    objectExpression(properties) { return { type: 'ObjectExpression', properties }; },
    callExpression(callee, args) { return { type: 'CallExpression', callee, arguments: args }; },
    importDeclaration(specifiers, source) {
      return { type: 'ImportDeclaration', specifiers, source };
    },
    importSpecifier(local, imported) {
      return { type: 'ImportSpecifier', local, imported };
    },
    jsxExpressionContainer(expression) {
      return { type: 'JSXExpressionContainer', expression };
    },
    isIdentifier(node) { return !!(node && node.type === 'Identifier'); },
    isStringLiteral(node) { return !!(node && node.type === 'StringLiteral'); },
    isJSXIdentifier(node) { return !!(node && node.type === 'JSXIdentifier'); },
    isJSXAttribute(node) { return !!(node && node.type === 'JSXAttribute'); },
    isJSXExpressionContainer(node) { return !!(node && node.type === 'JSXExpressionContainer'); }
  };
  return t;
}

/**
 * 构造一个 mock path：
 * - node：当前访问的 AST 节点
 * - parent：父节点（决定 JSX 替换形态）
 * - replaceWith：记录替换结果
 * - findParent：返回 mock Program path（用于 import 注入）
 */
function createMockPath(node, parent = null, programBody = []) {
  const programPath = {
    isProgram: () => true,
    node: { type: 'Program', body: programBody },
    unshiftContainer(key, item) { if (key === 'body') programBody.unshift(item); }
  };
  const path = {
    node,
    parent,
    isProgram: () => false,
    findParent(pred) { return pred(programPath) ? programPath : null; },
    replaceWith(replacement) { this._replacement = replacement; }
  };
  return path;
}

/** 构造 $widget(...) 调用的 CallExpression 节点 */
function makeCallNode(calleeName, args) {
  return { type: 'CallExpression', callee: { type: 'Identifier', name: calleeName }, arguments: args };
}

/** 构造 <Widget .../> JSXElement 节点 */
function makeJsxNode(attributes, parent = null) {
  const opening = {
    type: 'JSXOpeningElement',
    name: { type: 'JSXIdentifier', name: 'Widget' },
    attributes,
    selfClosing: true
  };
  return {
    type: 'JSXElement',
    openingElement: opening,
    closingElement: null,
    children: []
  };
}

function jsxAttr(name, value) {
  return { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name }, value };
}

/** 从 ObjectExpression 节点提取 { key: value } 的字面量映射，便于断言 */
function objectExprToObj(objExpr) {
  const out = {};
  if (!objExpr || objExpr.type !== 'ObjectExpression') return out;
  objExpr.properties.forEach(p => {
    if (p.type === 'ObjectProperty' && p.key.type === 'Identifier') {
      const v = p.value;
      out[p.key.name] = v.type === 'StringLiteral' ? v.value : v;
    }
  });
  return out;
}

describe('widget-declarative-plugin babel-plugin', () => {
  let t;
  beforeEach(() => {
    t = createMockTypes();
  });

  describe('T3.2a $widget 宏转换（CallExpression visitor）', () => {
    it('$widget(name, config) 内联 registry → widgetMount(meta, undefined, config)', () => {
      const registry = {
        'bi-sales-panel': { js: 'https://cdn/x.js', css: 'https://cdn/x.css', vueVersion: '2' }
      };
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const configArg = { type: 'ObjectExpression', properties: [] };
      const node = makeCallNode('$widget', [
        { type: 'StringLiteral', value: 'bi-sales-panel' },
        configArg
      ]);
      const path = createMockPath(node);
      const state = { opts: { registry } };
      plugin.visitor.CallExpression(path, state);

      expect(path._replacement).toBeDefined();
      const rep = path._replacement;
      expect(rep.type).toBe('CallExpression');
      expect(rep.callee.name).toBe('widgetMount');
      // 第一个参数是 meta（含 js/css/vueVersion）
      expect(rep.arguments[0].type).toBe('ObjectExpression');
      const meta = objectExprToObj(rep.arguments[0]);
      expect(meta.name).toBe('bi-sales-panel');
      expect(meta.js).toBe('https://cdn/x.js');
      expect(meta.css).toBe('https://cdn/x.css');
      expect(meta.vueVersion).toBe('2');
      // 第二个参数是 undefined（自动容器）
      expect(rep.arguments[1].type).toBe('Identifier');
      expect(rep.arguments[1].name).toBe('undefined');
      // 第三个参数是 config
      expect(rep.arguments[2]).toBe(configArg);
    });

    it('$widget(name, container, config) 三参数：container 透传', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const containerArg = { type: 'Identifier', name: 'hostEl' };
      const configArg = { type: 'ObjectExpression', properties: [] };
      const node = makeCallNode('$widget', [
        { type: 'StringLiteral', value: 'bi-x' },
        containerArg,
        configArg
      ]);
      const path = createMockPath(node);
      const state = { opts: { registry: {} } };
      plugin.visitor.CallExpression(path, state);

      const rep = path._replacement;
      expect(rep.arguments[1]).toBe(containerArg);
      expect(rep.arguments[2]).toBe(configArg);
      // meta 仅含 name（registry 无此物料）
      const meta = objectExprToObj(rep.arguments[0]);
      expect(meta.name).toBe('bi-x');
      expect(meta.js).toBeUndefined();
    });

    it('$widget(name) 单参数：container 与 config 均为 undefined', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$widget', [{ type: 'StringLiteral', value: 'bi-x' }]);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: { registry: {} } });

      const rep = path._replacement;
      expect(rep.arguments[1].name).toBe('undefined');
      expect(rep.arguments[2].name).toBe('undefined');
    });

    it('非 $widget 的普通调用不被转换', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('ordinaryFn', [{ type: 'StringLiteral', value: 'x' }]);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('第一个参数非字符串字面量（动态物料名）→ 跳过不转换', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$widget', [{ type: 'Identifier', name: 'dynamicName' }]);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('无参数调用 $widget() → 跳过', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$widget', []);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('自定义 macroName：$w 替代 $widget 也能被识别', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$w', [{ type: 'StringLiteral', value: 'bi-x' }]);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: { macroName: '$w' } });
      expect(path._replacement).toBeDefined();
      expect(path._replacement.callee.name).toBe('widgetMount');
    });

    it('import 注入：首次调用注入 import { widgetMount }，再次调用不重复注入', () => {
      const programBody = [];
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$widget', [{ type: 'StringLiteral', value: 'bi-x' }]);
      const path = createMockPath(node, null, programBody);
      const state = { opts: { registry: {} } };
      plugin.visitor.CallExpression(path, state);

      // 注入了一条 import 声明
      const imports = programBody.filter(s => s.type === 'ImportDeclaration');
      expect(imports.length).toBe(1);
      expect(imports[0].source.value).toBe('wc/widget-declarative-plugin/runtime');
      expect(imports[0].specifiers[0].imported.name).toBe('widgetMount');

      // 第二次调用（同文件）：不重复注入
      const node2 = makeCallNode('$widget', [{ type: 'StringLiteral', value: 'bi-y' }]);
      const path2 = createMockPath(node2, null, programBody);
      plugin.visitor.CallExpression(path2, state);
      const imports2 = programBody.filter(s => s.type === 'ImportDeclaration');
      expect(imports2.length).toBe(1); // 仍只有一条
    });

    it('已存在同名 import 时不重复注入（复用现有 specifier）', () => {
      const existingImport = {
        type: 'ImportDeclaration',
        source: { type: 'StringLiteral', value: 'wc/widget-declarative-plugin/runtime' },
        specifiers: [{
          type: 'ImportSpecifier',
          imported: { type: 'Identifier', name: 'widgetMount' },
          local: { type: 'Identifier', name: 'widgetMount' }
        }]
      };
      const programBody = [existingImport];
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeCallNode('$widget', [{ type: 'StringLiteral', value: 'bi-x' }]);
      const path = createMockPath(node, null, programBody);
      plugin.visitor.CallExpression(path, { opts: { registry: {} } });

      const imports = programBody.filter(s => s.type === 'ImportDeclaration');
      expect(imports.length).toBe(1); // 未新增
    });
  });

  describe('T3.2b JSX <Widget> 元素转换（JSXElement visitor）', () => {
    it('JSX 子节点位置：<Widget name="bi-x" config={cfg} /> → JSXExpressionContainer', () => {
      const registry = { 'bi-x': { js: 'https://x.js', vueVersion: '3' } };
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const cfgExpr = { type: 'Identifier', name: 'cfg' };
      const attrs = [
        jsxAttr('name', { type: 'StringLiteral', value: 'bi-x' }),
        jsxAttr('config', { type: 'JSXExpressionContainer', expression: cfgExpr })
      ];
      // parent 是 JSXElement → 应包裹为 JSXExpressionContainer
      const parent = { type: 'JSXElement' };
      const node = makeJsxNode(attrs, parent);
      const path = createMockPath(node, parent);
      plugin.visitor.JSXElement(path, { opts: { registry } });

      expect(path._replacement).toBeDefined();
      expect(path._replacement.type).toBe('JSXExpressionContainer');
      const call = path._replacement.expression;
      expect(call.type).toBe('CallExpression');
      expect(call.callee.name).toBe('widgetMount');
      const meta = objectExprToObj(call.arguments[0]);
      expect(meta.name).toBe('bi-x');
      expect(meta.js).toBe('https://x.js');
      expect(meta.vueVersion).toBe('3');
      expect(call.arguments[2]).toBe(cfgExpr); // config
      expect(call.arguments[1].name).toBe('undefined'); // container 未传
    });

    it('表达式位置（const el = <Widget/>）→ 直接 CallExpression（不包裹）', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const attrs = [
        jsxAttr('name', { type: 'StringLiteral', value: 'bi-x' })
      ];
      // parent 是 VariableDeclarator → 表达式位置
      const parent = { type: 'VariableDeclarator' };
      const node = makeJsxNode(attrs, parent);
      const path = createMockPath(node, parent);
      plugin.visitor.JSXElement(path, { opts: { registry: {} } });

      expect(path._replacement.type).toBe('CallExpression');
    });

    it('<Widget name="bi-x" config={cfg} container={el} /> container 透传', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const cfgExpr = { type: 'Identifier', name: 'cfg' };
      const elExpr = { type: 'Identifier', name: 'myEl' };
      const attrs = [
        jsxAttr('name', { type: 'StringLiteral', value: 'bi-x' }),
        jsxAttr('config', { type: 'JSXExpressionContainer', expression: cfgExpr }),
        jsxAttr('container', { type: 'JSXExpressionContainer', expression: elExpr })
      ];
      const node = makeJsxNode(attrs);
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: { registry: {} } });

      const call = path._replacement;
      expect(call.arguments[1]).toBe(elExpr); // container
      expect(call.arguments[2]).toBe(cfgExpr); // config
    });

    it('<Widget name={"bi-x"} /> JSXExpressionContainer 包裹字符串字面量 → 正常解析', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const attrs = [
        jsxAttr('name', {
          type: 'JSXExpressionContainer',
          expression: { type: 'StringLiteral', value: 'bi-x' }
        })
      ];
      const node = makeJsxNode(attrs);
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: { registry: {} } });
      expect(path._replacement).toBeDefined();
      const meta = objectExprToObj(path._replacement.arguments[0]);
      expect(meta.name).toBe('bi-x');
    });

    it('<Widget /> 缺少 name → 跳过不转换', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = makeJsxNode([]);
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('<Widget name={variable} /> 非静态 name → 跳过', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const attrs = [
        jsxAttr('name', {
          type: 'JSXExpressionContainer',
          expression: { type: 'Identifier', name: 'dynamicName' }
        })
      ];
      const node = makeJsxNode(attrs);
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('非 Widget 的 JSX 元素（如 <Div/>）→ 跳过', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'Div' },
          attributes: [],
          selfClosing: true
        },
        closingElement: null,
        children: []
      };
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: {} });
      expect(path._replacement).toBeUndefined();
    });

    it('自定义 jsxTag：<W> 替代 <Widget> 也能识别', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const node = {
        type: 'JSXElement',
        openingElement: {
          type: 'JSXOpeningElement',
          name: { type: 'JSXIdentifier', name: 'W' },
          attributes: [jsxAttr('name', { type: 'StringLiteral', value: 'bi-x' })],
          selfClosing: true
        },
        closingElement: null,
        children: []
      };
      const path = createMockPath(node);
      plugin.visitor.JSXElement(path, { opts: { jsxTag: 'W' } });
      expect(path._replacement).toBeDefined();
    });
  });

  describe('T3.2c .vue script 块转换场景', () => {
    it('.vue <script> 中 $widget 调用走 CallExpression visitor（与 .js 一致）', () => {
      // .vue 的 <script> 块经 vite-plugin extractVueScript 后是纯 JS，
      // babel-plugin 对其应用相同的 CallExpression visitor。
      // 这里模拟 .vue script 中常见的 export default { mounted() { $widget(...) } }
      const registry = { 'bi-vue-widget': { js: 'https://vw.js', vueVersion: '2' } };
      const plugin = widgetDeclarativeBabelPlugin({ types: t });
      const configArg = { type: 'ObjectExpression', properties: [] };
      const node = makeCallNode('$widget', [
        { type: 'StringLiteral', value: 'bi-vue-widget' },
        configArg
      ]);
      const path = createMockPath(node);
      plugin.visitor.CallExpression(path, { opts: { registry } });

      expect(path._replacement).toBeDefined();
      const meta = objectExprToObj(path._replacement.arguments[0]);
      expect(meta.name).toBe('bi-vue-widget');
      expect(meta.js).toBe('https://vw.js');
      expect(meta.vueVersion).toBe('2');
    });
  });

  describe('T3.2d buildMetaExpression 单元 & DEFAULT_OPTS', () => {
    it('registry 含完整 meta → objectExpression 含 name/js/css/vueVersion', () => {
      const registry = {
        'bi-full': { js: 'https://a.js', css: 'https://a.css', vueVersion: '2' }
      };
      const expr = buildMetaExpression(t, 'bi-full', registry);
      expect(expr.type).toBe('ObjectExpression');
      const meta = objectExprToObj(expr);
      expect(meta.name).toBe('bi-full');
      expect(meta.js).toBe('https://a.js');
      expect(meta.css).toBe('https://a.css');
      expect(meta.vueVersion).toBe('2');
    });

    it('registry 仅含 js → meta 仅含 name + js', () => {
      const registry = { 'bi-partial': { js: 'https://b.js' } };
      const expr = buildMetaExpression(t, 'bi-partial', registry);
      const meta = objectExprToObj(expr);
      expect(meta.name).toBe('bi-partial');
      expect(meta.js).toBe('https://b.js');
      expect(meta.css).toBeUndefined();
      expect(meta.vueVersion).toBeUndefined();
    });

    it('registry 不含该物料 → meta 仅含 name（运行时远程解析）', () => {
      const expr = buildMetaExpression(t, 'bi-unknown', {});
      const meta = objectExprToObj(expr);
      expect(meta.name).toBe('bi-unknown');
      expect(meta.js).toBeUndefined();
    });

    it('vueVersion 为数字 → 转为字符串字面量', () => {
      const registry = { 'bi-num': { vueVersion: 3 } };
      const expr = buildMetaExpression(t, 'bi-num', registry);
      const meta = objectExprToObj(expr);
      expect(meta.vueVersion).toBe('3'); // 数字被 String() 转字符串
    });

    it('DEFAULT_OPTS 导出正确默认值', () => {
      expect(DEFAULT_OPTS.registry).toEqual({});
      expect(DEFAULT_OPTS.helperModule).toBe('wc/widget-declarative-plugin/runtime');
      expect(DEFAULT_OPTS.helperName).toBe('widgetMount');
      expect(DEFAULT_OPTS.macroName).toBe('$widget');
      expect(DEFAULT_OPTS.jsxTag).toBe('Widget');
    });
  });

  describe('T3.2e 插件元信息', () => {
    it('plugin 返回 name 与 visitor', () => {
      const plugin = widgetDeclarativeBabelPlugin({ types: createMockTypes() });
      expect(plugin.name).toBe('widget-declarative-transform');
      expect(plugin.visitor).toBeDefined();
      expect(typeof plugin.visitor.CallExpression).toBe('function');
      expect(typeof plugin.visitor.JSXElement).toBe('function');
    });
  });
});
