// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractUiDependencies, generateSchema } from '../index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

// 生成临时 .vue 文件供 generateSchema 读取
function writeTempVue(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-test-'));
  const file = path.join(dir, 'Comp.vue');
  fs.writeFileSync(file, content);
  return file;
}

describe('extractUiDependencies', () => {
  it('扫描 <el-card> <el-button> <el-table-column>', () => {
    const src = `<template><div><el-card><el-button>ok</el-button></el-card><el-table-column /></div></template>`;
    expect(extractUiDependencies(src).sort()).toEqual(['button', 'card', 'table-column']);
  });

  it('去重：<el-card> 出现两次只返回一次', () => {
    const src = `<template><el-card><el-card>nested</el-card></el-card></template>`;
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it('排除闭合标签 </el-card>', () => {
    const src = `<template><el-card>x</el-card></template>`;
    // 闭合标签 </el- 不匹配开标签正则 <el-，只应得到一个 card
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it('排除 HTML 注释中的标签', () => {
    const src = `<template><!-- <el-card> --><el-button /></template>`;
    expect(extractUiDependencies(src)).toEqual(['button']);
  });

  it('不扫描 <script> 中的 el- 字符串', () => {
    const src = `<template><el-card /></template><script>const x = 'el-button';</script>`;
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it('无 el-* 返回空数组', () => {
    const src = `<template><div><span>hello</span></div></template>`;
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it('空源码返回空数组', () => {
    expect(extractUiDependencies('')).toEqual([]);
  });
});

describe('generateSchema 集成 uiDependencies', () => {
  it("vueVersion='3' 推断 element-plus", () => {
    const file = writeTempVue(`<template><el-card><el-button /></el-card></template>`);
    const schema = generateSchema('bi-test', file, { vueVersion: '3' });
    expect(schema.uiDependencies).toBeDefined();
    expect(schema.uiDependencies.lib).toBe('element-plus');
    expect(schema.uiDependencies.version).toBe('^2.7.0');
    expect(schema.uiDependencies.components.sort()).toEqual(['button', 'card']);
    expect(schema.uiDependencies.styles).toEqual(['base']);
  });

  it("vueVersion='2' 推断 element-ui", () => {
    const file = writeTempVue(`<template><el-table-column /></template>`);
    const schema = generateSchema('bi-test', file, { vueVersion: '2' });
    expect(schema.uiDependencies.lib).toBe('element-ui');
    expect(schema.uiDependencies.version).toBe('^2.15.0');
    expect(schema.uiDependencies.components).toEqual(['table-column']);
  });

  it('无 el-* 时 schema 不含 uiDependencies 字段', () => {
    const file = writeTempVue(`<template><div><span>hi</span></div></template><script>export default { props: { title: String } }</script>`);
    const schema = generateSchema('bi-test', file);
    expect(schema.uiDependencies).toBeUndefined();
  });

  it('options.uiLib 覆盖推断', () => {
    const file = writeTempVue(`<template><el-card /></template>`);
    const schema = generateSchema('bi-test', file, { vueVersion: '3', uiLib: 'element-ui' });
    expect(schema.uiDependencies.lib).toBe('element-ui');
  });

  it('options.uiVersion 覆盖默认版本', () => {
    const file = writeTempVue(`<template><el-card /></template>`);
    const schema = generateSchema('bi-test', file, { vueVersion: '3', uiVersion: '^2.10.0' });
    expect(schema.uiDependencies.version).toBe('^2.10.0');
  });

  it('options.uiFull=true 写入 full 字段', () => {
    const file = writeTempVue(`<template><el-card /></template>`);
    const schema = generateSchema('bi-test', file, { vueVersion: '3', uiFull: true });
    expect(schema.uiDependencies.full).toBe(true);
  });

  it('向后兼容：vueVersion 未传不报错（默认按 3 推断）', () => {
    const file = writeTempVue(`<template><el-card /></template>`);
    expect(() => generateSchema('bi-test', file)).not.toThrow();
    const schema = generateSchema('bi-test', file);
    expect(schema.uiDependencies.lib).toBe('element-plus');
  });
});
