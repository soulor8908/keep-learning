// @vitest-environment node
// schema-generator props 解析测试
//
// 背景：uiDependencies.test.js 只覆盖 UI 依赖扫描，props 解析（<script setup> /
// TS 泛型 / withDefaults / Options API / 复杂默认值）此前无测试覆盖。
// 本文件针对 P0-1 补齐：验证 @vue/compiler-sfc + @babel/parser AST 解析路径
// 对真实 Vue3/TS 组件的解析正确性（AST 不可用时由调用方回退正则，仍应通过基础用例）。
import { describe, it, expect, afterEach } from 'vitest';
import { generateSchema } from '../index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 生成临时 .vue 文件供 generateSchema 读取，统一登记以便 afterEach 清理
const tempDirs = [];
function writeTempVue(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-props-'));
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

describe('generateSchema props 解析 — <script setup> + TS 泛型 + withDefaults', () => {
  it('解析 defineProps<Props>() + withDefaults：类型/必填/默认值', () => {
    const file = writeTempVue(`<script setup lang="ts">
interface Props {
  title?: string
  count: number
  items?: string[]
  flag?: boolean | string
}
const props = withDefaults(defineProps<Props>(), {
  title: 'hi',
  items: () => ['a'],
  flag: true
})
</script>
<template><div>{{ title }}</div></template>`);
    const schema = generateSchema('bi-ts', file);
    expect(schema.properties).toEqual({
      title: { type: 'string', default: 'hi' },
      count: { type: 'number', required: true },
      items: { type: 'array', default: ['a'] },
      flag: { type: ['boolean', 'string'], default: true }
    });
    // 必填项收敛到 schema.required
    expect(schema.required).toEqual(['count']);
  });

  it('TS 泛型无 withDefaults：全部可选、无默认值', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ title?: string; count?: number }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts2', file);
    expect(schema.properties.title).toEqual({ type: 'string' });
    expect(schema.properties.count).toEqual({ type: 'number' });
    expect(schema.required).toEqual([]);
  });

  it('TS 泛型：Array<T> / Record<...> / 对象字面量类型', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ tags?: Array<string>; meta?: Record<string, unknown>; cfg?: { foo: string } }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts3', file);
    expect(schema.properties.tags.type).toBe('array');
    expect(schema.properties.meta.type).toBe('object');
    expect(schema.properties.cfg.type).toBe('object');
  });
});

describe('generateSchema props 解析 — <script setup> 运行时 defineProps({...})', () => {
  it('解析 defineProps 对象形式（类型/默认值/必填）', () => {
    const file = writeTempVue(`<script setup>
const props = defineProps({
  title: { type: String, default: '默认标题' },
  count: { type: Number, required: true },
  show: { type: Boolean, default: false }
})
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-setup-runtime', file);
    expect(schema.properties).toEqual({
      title: { type: 'string', default: '默认标题' },
      count: { type: 'number', required: true },
      show: { type: 'boolean', default: false }
    });
    expect(schema.required).toEqual(['count']);
  });
});

describe('generateSchema props 解析 — Options API', () => {
  it('对象形式：数组类型 / 函数默认值 / 负数默认值', () => {
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
    const schema = generateSchema('bi-options', file);
    expect(schema.properties.tags).toEqual({ type: 'array', default: [] });
    expect(schema.properties.n).toEqual({ type: 'number', default: -1 });
    expect(schema.properties.mixed).toEqual({ type: ['string', 'number'], required: true });
    expect(schema.required).toEqual(['mixed']);
  });

  it('简写形式：props: { title: String, count: Number }', () => {
    const file = writeTempVue(`<script>
export default { props: { title: String, count: Number } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-shorthand', file);
    expect(schema.properties.title).toEqual({ type: 'string' });
    expect(schema.properties.count).toEqual({ type: 'number' });
  });

  it('复杂默认值：对象/数组字面量', () => {
    const file = writeTempVue(`<script>
export default {
  props: {
    cfg: { type: Object, default: () => ({ a: 1, b: 'x' }) },
    list: { type: Array, default: () => [1, 2, 3] }
  }
}
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-complex-default', file);
    expect(schema.properties.cfg.default).toEqual({ a: 1, b: 'x' });
    expect(schema.properties.list.default).toEqual([1, 2, 3]);
  });

  it('无 props 的组件：properties 为空对象、required 为空数组', () => {
    const file = writeTempVue(`<script>
export default { name: 'NoProps' }
</script>
<template><div>hello</div></template>`);
    const schema = generateSchema('bi-no-props', file);
    expect(schema.properties).toEqual({});
    expect(schema.required).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 以下为补充覆盖：默认值字面量边界、parseDefault 缺口、extractPropsScript 优先级、
// splitTopLevelFields 多行联合、tsTypeToJsonType 映射、无 script / 畸形输入。
// 注意：generateSchema 优先 AST（@vue/compiler-sfc + @babel/parser 已安装），
// 多数用例经 AST 路径（evalNode/normalizeAstProp）间接验证默认值与类型映射；
// 当 AST 提取失败（如 <script> 与 <script setup> 并存导致 Object.assign 形态）
// 时回退正则路径（parseDefault/tsTypeToJsonType/extractPropsScript），同样被覆盖。
// ---------------------------------------------------------------------------

describe('默认值字面量边界 — parseDefault 各类字面量（间接验证）', () => {
  it('undefined 字面量：默认值被跳过，不写入 default 键', () => {
    // AST 路径：evalNode(Identifier 'undefined') → undefined，normalizeAstProp 跳过；
    // 正则路径：parseDefault('undefined') → undefined。toEqual 视 undefined 键与缺键等价。
    const file = writeTempVue(`<script>
export default { props: { a: { type: String, default: undefined } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-undefined', file);
    expect(schema.properties.a).toEqual({ type: 'string' });
  });

  it('null 字面量：default 为 null', () => {
    const file = writeTempVue(`<script>
export default { props: { a: { type: String, default: null } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-null', file);
    expect(schema.properties.a).toEqual({ type: 'string', default: null });
  });

  it('负数默认值', () => {
    // AST：evalNode(UnaryExpression { operator:'-', argument:NumericLiteral }) → -42
    const file = writeTempVue(`<script>
export default { props: { a: { type: Number, default: -42 } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-negative', file);
    expect(schema.properties.a).toEqual({ type: 'number', default: -42 });
  });

  it('对象字面量默认值', () => {
    // AST：evalNode(ObjectExpression) → 对象
    const file = writeTempVue(`<script>
export default { props: { a: { type: Object, default: { x: 1 } } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-object', file);
    expect(schema.properties.a).toEqual({ type: 'object', default: { x: 1 } });
  });

  it('数组字面量默认值', () => {
    // AST：evalNode(ArrayExpression) → 数组
    const file = writeTempVue(`<script>
export default { props: { a: { type: Array, default: [1, 2, 3] } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-array', file);
    expect(schema.properties.a).toEqual({ type: 'array', default: [1, 2, 3] });
  });

  it('({ ... }) 包裹的箭头函数返回对象', () => {
    // AST：ArrowFunctionExpression → evalFunctionReturn → 表达式体（可能被括号包裹）
    // → evalNode(ObjectExpression) → 对象
    const file = writeTempVue(`<script>
export default { props: { a: { type: Object, default: () => ({ x: 1 }) } } }
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-default-paren-wrap', file);
    expect(schema.properties.a).toEqual({ type: 'object', default: { x: 1 } });
  });
});

describe('parseDefault 未覆盖的真实缺口（正则路径限制，AST 可处理）', () => {
  // 以下场景 AST 路径的 evalNode/evalFunctionReturn 可正确处理，
  // 但正则路径的 parseDefault 无法解析，标注为 parseDefault 的真实缺口。
  it.todo('模板字符串默认值(反引号)：parseDefault 不识别反引号字符串，AST evalNode(TemplateLiteral) 可处理');
  it.todo('function(){} 工厂：parseDefault 不解析普通函数体，AST evalFunctionReturn 可处理 BlockStatement return');
  it.todo('块体箭头 ()=>{return ...}：parseDefault 仅识别 () => 表达式体，AST 可处理块体 return');
  it.todo('带参箭头 (x)=>...：parseDefault 仅匹配无参 () => 前缀，AST 不限箭头函数参数');
});

describe('extractPropsScript 的 setup 优先级', () => {
  it('同时有 <script> 和 <script setup> 时优先取 setup 块的 props', () => {
    // 构造同时含 <script>（含 legacyProp）和 <script setup>（含 newProp）的组件。
    // 并存时 compileScript 输出 Object.assign(__default__, {...}) 形态，
    // findPropsOptionNode 仅检查首个参数为 ObjectExpression，提取失败回退正则；
    // 正则路径 extractPropsScript 优先匹配 <script setup>，故 newProp 被提取、legacyProp 被忽略。
    const file = writeTempVue(`<script>
export default { name: 'X', props: { legacyProp: String } }
</script>
<script setup>
defineProps({ newProp: String })
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-setup-priority', file);
    expect(schema.properties).toHaveProperty('newProp');
    expect(schema.properties).not.toHaveProperty('legacyProp');
    expect(schema.properties.newProp).toEqual({ type: 'string' });
  });
});

describe('splitTopLevelFields 多行联合类型不被误切', () => {
  it('flag?: 跨行联合类型 | string | number 不被换行分隔', () => {
    // splitTopLevelFields 仅在换行后下一段形如 "标识符 ?:" 时才切分，
    // 联合类型续行（以 | 开头）不会被误判为新字段。
    // AST 路径下 compileScript 归一化为 [String, Number]，结果一致。
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{
  flag?:
    | string
    | number
  count?: number
}>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-multiline-union', file);
    expect(schema.properties.flag).toEqual({ type: ['string', 'number'] });
    expect(schema.properties.count).toEqual({ type: 'number' });
  });
});

describe('tsTypeToJsonType 类型映射（间接验证）', () => {
  it('string[] / number[] → array', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: string[]; b?: number[] }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-string-arr', file);
    expect(schema.properties.a.type).toBe('array');
    expect(schema.properties.b.type).toBe('array');
  });

  it('Array<T> → array', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: Array<string> }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-array-generic', file);
    expect(schema.properties.a.type).toBe('array');
  });

  it('Record<...> → object', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: Record<string, unknown> }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-record', file);
    expect(schema.properties.a.type).toBe('object');
  });

  it('对象字面量类型 { foo: string } → object', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: { foo: string } }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-object-literal', file);
    expect(schema.properties.a.type).toBe('object');
  });

  it('boolean → boolean', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: boolean }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-boolean', file);
    expect(schema.properties.a.type).toBe('boolean');
  });

  it('联合类型去重：string | string → string（长度 1 退化为单值）', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: string | string }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-union-dedup', file);
    expect(schema.properties.a.type).toBe('string');
  });

  it('联合类型去重：string | number | string → ["string","number"]', () => {
    const file = writeTempVue(`<script setup lang="ts">
defineProps<{ a?: string | number | string }>()
</script>
<template><div/></template>`);
    const schema = generateSchema('bi-ts-union-mixed', file);
    expect(schema.properties.a.type).toEqual(['string', 'number']);
  });

  // 以下类型在 AST 路径下 compileScript 不产生运行时构造器（null/any/unknown 无对应 JS 构造器，
  // bool 非合法 TS 类型），normalizeAstProp 不写入 type；仅正则路径 tsTypeToJsonType 能映射。
  // 标注为缺口，待正则路径专门测试或 generateSchema 透传 fs 选项后补全。
  it.todo('bool → boolean（AST 不识别 bool 别名，需正则路径 tsTypeToJsonType）');
  it.todo('any/unknown → string（AST 不产生类型，需正则路径）');
  it.todo('null → null（AST 不产生类型，需正则路径）');
});

describe('无 script 块与畸形输入', () => {
  it('只有 template 无 script：properties 为空对象', () => {
    const file = writeTempVue(`<template><div>hello</div></template>`);
    const schema = generateSchema('bi-no-script', file);
    expect(schema.properties).toEqual({});
    expect(schema.required).toEqual([]);
  });

  it('空字符串源码不抛错', () => {
    const file = writeTempVue(``);
    expect(() => generateSchema('bi-empty-source', file)).not.toThrow();
    const schema = generateSchema('bi-empty-source', file);
    expect(schema.properties).toEqual({});
  });

  it('畸形输入不抛错', () => {
    const file = writeTempVue(`<<<not valid>>>>`);
    expect(() => generateSchema('bi-malformed', file)).not.toThrow();
    const schema = generateSchema('bi-malformed', file);
    expect(schema.properties).toEqual({});
  });
});
