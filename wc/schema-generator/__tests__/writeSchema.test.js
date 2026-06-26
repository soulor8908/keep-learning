// @vitest-environment node
// writeSchema 与 generateSchema options 覆盖测试
//
// 覆盖：writeSchema 写出文件/返回值、默认 layout（DEFAULT_LAYOUT）、
// options 覆盖（title/description/defaultSize/minSize/uiStyles）、
// defaultSize 用 || 而非 ?? 的现状、componentPath 不存在时抛错。
// 临时文件写入 os.tmpdir()，afterEach 清理。
import { describe, it, expect, afterEach } from 'vitest';
import { writeSchema, generateSchema, DEFAULT_LAYOUT } from '../index.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

const tempDirs = [];
function writeTempVue(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-write-'));
  const file = path.join(dir, 'Comp.vue');
  fs.writeFileSync(file, content);
  tempDirs.push(dir);
  return { file, dir };
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
  }
});

describe('writeSchema', () => {
  it('写出文件：内容为 JSON.stringify(schema,null,2)，返回值等于 generateSchema 结果', () => {
    const { file, dir } = writeTempVue(`<script>export default { props: { title: String } }</script><template><div/></template>`);
    const outPath = path.join(dir, 'out.schema.json');
    const schema = writeSchema('bi-write', file, outPath);
    expect(fs.existsSync(outPath)).toBe(true);
    // 文件内容必须与 JSON.stringify(schema, null, 2) 完全一致
    expect(fs.readFileSync(outPath, 'utf-8')).toBe(JSON.stringify(schema, null, 2));
    // 返回值与 generateSchema 同入参的结果一致
    expect(schema).toEqual(generateSchema('bi-write', file));
  });

  it('写出文件内容可被 JSON.parse 还原且含基础字段', () => {
    const { file, dir } = writeTempVue(`<script>export default { props: { title: String, count: { type: Number, required: true } } }</script><template><div/></template>`);
    const outPath = path.join(dir, 'out2.schema.json');
    const schema = writeSchema('bi-write-roundtrip', file, outPath);
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf-8'));
    expect(parsed.$schema).toBe(schema.$schema);
    expect(parsed.name).toBe('bi-write-roundtrip');
    expect(parsed.properties.title).toEqual({ type: 'string' });
    expect(parsed.required).toEqual(['count']);
  });
});

describe('generateSchema layout 默认值与 options 覆盖', () => {
  it('不传 options.defaultSize/minSize 时使用 DEFAULT_LAYOUT', () => {
    const { file } = writeTempVue(`<script>export default { props: { title: String } }</script><template><div/></template>`);
    const schema = generateSchema('bi-default-layout', file);
    expect(schema.layout.defaultSize).toEqual(DEFAULT_LAYOUT.defaultSize);
    expect(schema.layout.minSize).toEqual(DEFAULT_LAYOUT.minSize);
  });

  it('options.title / description 覆盖默认值', () => {
    const { file } = writeTempVue(`<script>export default { props: { title: String } }</script><template><div/></template>`);
    const schema = generateSchema('bi-opts-meta', file, {
      title: '自定义标题',
      description: '自定义描述'
    });
    expect(schema.title).toBe('自定义标题');
    expect(schema.description).toBe('自定义描述');
  });

  it('options.defaultSize / minSize 覆盖默认值', () => {
    const { file } = writeTempVue(`<script>export default { props: { title: String } }</script><template><div/></template>`);
    const schema = generateSchema('bi-opts-size', file, {
      defaultSize: { w: 10, h: 10 },
      minSize: { w: 5, h: 5 }
    });
    expect(schema.layout.defaultSize).toEqual({ w: 10, h: 10 });
    expect(schema.layout.minSize).toEqual({ w: 5, h: 5 });
  });

  it('options.uiStyles 覆盖默认 ["base"]（仅当模板含 el-* 时生效）', () => {
    const { file } = writeTempVue(`<template><el-card/></template>`);
    const schema = generateSchema('bi-opts-styles', file, {
      vueVersion: '3',
      uiStyles: ['dark', 'compact']
    });
    expect(schema.uiDependencies.styles).toEqual(['dark', 'compact']);
  });

  it('defaultSize 用 || 而非 ??：传对象 {w:0,h:0} 仍被保留（对象本身为 truthy）', () => {
    // 代码使用 options.defaultSize || DEFAULT_LAYOUT.defaultSize。
    // 对象 {w:0,h:0} 是 truthy，|| 保留它（不会回退到默认值）。
    const { file } = writeTempVue(`<script>export default { props: { title: String } }</script><template><div/></template>`);
    const schema = generateSchema('bi-zero-size', file, { defaultSize: { w: 0, h: 0 } });
    expect(schema.layout.defaultSize).toEqual({ w: 0, h: 0 });
  });

  it.todo('defaultSize 用 || 而非 ?? 的潜在 bug：显式传 null/undefined 会被回退到默认值，?? 仅对 null/undefined 回退（语义差异，待确认是否需修）');
});

describe('writeSchema / generateSchema 异常输入', () => {
  it('componentPath 文件不存在时 generateSchema 抛错（fs.readFileSync ENOENT）', () => {
    expect(() => generateSchema('bi-missing', '/nonexistent/path/comp.vue')).toThrow();
  });

  it('componentPath 文件不存在时 writeSchema 抛错（不会创建输出文件）', () => {
    const outPath = path.join(os.tmpdir(), `should-not-exist-${Date.now()}.json`);
    expect(() => writeSchema('bi-missing', '/nonexistent/path/comp.vue', outPath)).toThrow();
    expect(fs.existsSync(outPath)).toBe(false);
  });
});
