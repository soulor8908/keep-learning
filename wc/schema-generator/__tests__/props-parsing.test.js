// @vitest-environment node
// schema-generator props 解析测试
//
// 背景：uiDependencies.test.js 只覆盖 UI 依赖扫描，props 解析（<script setup> /
// TS 泛型 / withDefaults / Options API / 复杂默认值）此前无测试覆盖。
// 本文件针对 P0-1 补齐：验证 @vue/compiler-sfc + @babel/parser AST 解析路径
// 对真实 Vue3/TS 组件的解析正确性（AST 不可用时由调用方回退正则，仍应通过基础用例）。
import { describe, it, expect } from 'vitest';
import { generateSchema } from '../index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 生成临时 .vue 文件供 generateSchema 读取
function writeTempVue(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-props-'));
  const file = path.join(dir, 'Comp.vue');
  fs.writeFileSync(file, content);
  return file;
}

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
