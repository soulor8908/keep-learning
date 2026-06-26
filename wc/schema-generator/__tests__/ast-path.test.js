// @vitest-environment node
// AST 路径测试
//
// 当 @vue/compiler-sfc 可用时，generateSchema 内部 extractPropsViaAST 优先执行：
// compileScript 把 <script setup> 的 defineProps / defineProps<泛型> / withDefaults
// 以及 Options API 的 props 归一化编译为统一形态，再用 @babel/parser 解析编译后代码
// 定位 props 选项对象并逐字段求值（evalNode/normalizeAstProp）。
// 本文件用例通过 generateSchema 间接验证 AST 解析结果正确。
//
// 依赖：@vue/compiler-sfc + @babel/parser 已安装（require.resolve 可找到）。
// 临时 .vue 文件写入 os.tmpdir()，afterEach 清理。
import { describe, it, expect, afterEach } from 'vitest';
import { generateSchema } from '../index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs = [];
function writeTempVue(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-ast-'));
  const file = path.join(dir, 'Comp.vue');
  fs.writeFileSync(file, content);
  tempDirs.push(dir);
  return file;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});

describe('AST 路径 — withDefaults 默认值合并', () => {
  it('withDefaults(defineProps<{...}>(), {...}) 合并默认值到泛型 props', () => {
    // compileScript 会把 withDefaults 的默认值合并进归一化后的 props，
    // extractPropsFromCompiledCode 直接读到含 default 的定义，无需 extractWithDefaultsBody。
    const file = writeTempVue(`<script setup lang="ts">
withDefaults(defineProps<{ title?: string; count?: number }>(), { title: 't' })
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-withdefaults', file);
    expect(schema.properties).toEqual({
      title: { type: 'string', default: 't' },
      count: { type: 'number' }
    });
  });
});

describe('AST 路径 — Options API', () => {
  it('对象形式 + 数组类型 + 函数默认值 + 负数默认值', () => {
    // evalNode 处理：ArrayExpression(默认值工厂返回 [])、UnaryExpression(-1)、
    // ArrayExpression type([String,Number]) 经 mapConstructorName 映射。
    const file = writeTempVue(`<script>
export default {
  props: {
    tags: { type: Array, default: () => [] },
    n: { type: Number, default: -1 },
    mixed: { type: [String, Number], required: true }
  }
}
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-options-complex', file);
    expect(schema.properties.tags).toEqual({ type: 'array', default: [] });
    expect(schema.properties.n).toEqual({ type: 'number', default: -1 });
    expect(schema.properties.mixed).toEqual({ type: ['string', 'number'], required: true });
    expect(schema.required).toEqual(['mixed']);
  });

  it('简写 props: { title: String }', () => {
    // evalPropDef 命中 Identifier 分支，返回 { type: 'String' }，mapConstructorName 映射为 'string'。
    const file = writeTempVue(`<script>
export default { props: { title: String } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-shorthand', file);
    expect(schema.properties.title).toEqual({ type: 'string' });
  });

  it('复杂默认值：对象/数组字面量工厂', () => {
    // evalFunctionReturn 求值箭头函数表达式体：
    //   () => ({ a: 1, b: 'x' }) → evalNode(ObjectExpression) → { a:1, b:'x' }
    //   () => [1, 2, 3]           → evalNode(ArrayExpression) → [1,2,3]
    const file = writeTempVue(`<script>
export default {
  props: {
    cfg: { type: Object, default: () => ({ a: 1, b: 'x' }) },
    list: { type: Array, default: () => [1, 2, 3] }
  }
}
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-complex-defaults', file);
    expect(schema.properties.cfg.default).toEqual({ a: 1, b: 'x' });
    expect(schema.properties.list.default).toEqual([1, 2, 3]);
  });

  it('type: [String, Number] 数组类型', () => {
    const file = writeTempVue(`<script>
export default { props: { a: { type: [String, Number], default: 0 } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-type-array', file);
    expect(schema.properties.a).toEqual({ type: ['string', 'number'], default: 0 });
  });
});

describe('AST 路径 — <script setup> 运行时 defineProps({...})', () => {
  it('defineProps({...}) 运行时对象形式：类型/默认值/必填', () => {
    const file = writeTempVue(`<script setup>
defineProps({ title: { type: String, default: 't' }, count: { type: Number, required: true } })
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-runtime-defineprops', file);
    expect(schema.properties).toEqual({
      title: { type: 'string', default: 't' },
      count: { type: 'number', required: true }
    });
    expect(schema.required).toEqual(['count']);
  });
});

describe('AST 路径 — 复杂默认值表达式', () => {
  it('TemplateLiteral 无插值默认值', () => {
    // evalNode(TemplateLiteral)：expressions 为空且 quasis 单段时取 cooked 值。
    // 正则路径 parseDefault 不识别反引号字符串，本用例可区分 AST 是否被触发。
    const file = writeTempVue(`<script>
export default { props: { a: { type: String, default: \`hello\` } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-template-literal', file);
    expect(schema.properties.a).toEqual({ type: 'string', default: 'hello' });
  });

  it('箭头函数工厂 () => ({...}) 返回对象', () => {
    // evalNode(ArrowFunctionExpression) → evalFunctionReturn → 表达式体
    // （可能被 babel 包裹为 ParenthesizedExpression，evalNode 已处理）
    const file = writeTempVue(`<script>
export default { props: { a: { type: Object, default: () => ({ x: 1 }) } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-arrow-factory', file);
    expect(schema.properties.a).toEqual({ type: 'object', default: { x: 1 } });
  });

  it('function(){} 工厂默认值：AST 取块体 return 表达式', () => {
    // evalFunctionReturn 处理 FunctionExpression 的 BlockStatement，取首个 ReturnStatement。
    // 正则路径 parseDefault 无法解析普通函数体（仅识别 () => 前缀），本用例验证 AST 能力。
    const file = writeTempVue(`<script>
export default { props: { a: { type: Object, default: function() { return { x: 1 } } } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-function-factory', file);
    expect(schema.properties.a).toEqual({ type: 'object', default: { x: 1 } });
  });

  it('块体箭头 ()=>{return ...} 默认值', () => {
    // evalFunctionReturn 处理 ArrowFunctionExpression 的 BlockStatement，取首个 ReturnStatement。
    const file = writeTempVue(`<script>
export default { props: { a: { type: Array, default: () => { return [1, 2] } } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('ast-block-arrow', file);
    expect(schema.properties.a).toEqual({ type: 'array', default: [1, 2] });
  });
});

describe('AST 路径 — 外部类型导入（需 fs，generateSchema 未传 fs 选项）', () => {
  it.skip('defineProps<外部导入类型>() 需多文件 fixture + fs 选项', () => {
    // compileScript 解析 import type { Props } from './types' 需要 { fs } 选项，
    // generateSchema 调用 compileScript(descriptor, { id: 'schema-gen' }) 未传 fs，
    // 故外部类型导入抛错 "[@vue/compiler-sfc] No fs option provided..."，AST 回退正则；
    // 正则路径 extractTsPropsBody 匹配 defineProps<{ 失败（泛型里是标识符而非 {），
    // 最终 properties 为空。需多文件 fixture 并改造 generateSchema 透传 fs 后补全。
  });
});
