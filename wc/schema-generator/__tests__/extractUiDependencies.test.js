// @vitest-environment node
// extractUiDependencies 负向测试
//
// 现有 uiDependencies.test.js 已覆盖正向扫描（el-* 标签提取、去重、注释排除、
// script 排除、空源码、vueVersion/uiLib/uiVersion/uiFull options）。
// 本文件补充负向场景：动态组件 <component :is>、渲染函数 h('el-button')、
// Vue.component 注册等不应被计入 uiDependencies.components 的引用方式。
//
// 实现依据：extractUiDependencies 仅扫描 <template> 块内的 <el- 开标签，
// 不解析动态组件、不扫描 script、不识别字符串形式的组件引用。
import { describe, it, expect } from 'vitest';
import { extractUiDependencies } from '../index.js';

describe('extractUiDependencies 负向测试 — 不应计入的引用方式', () => {
  it('动态组件 <component :is="..."> 中的 el-button 字符串不计入', () => {
    // <component :is="'el-button'"> 不是 <el- 开标签，正则无法匹配；
    // 同模板内的 <el-card> 仍正常计入。
    const src = `<template>
  <component :is="'el-button'" />
  <el-card />
</template>`;
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it("渲染函数 h('el-button') 调用不计入（在 script 中且非标签形式）", () => {
    const src = `<template><div>{{ x }}</div></template>
<script>const vnode = h('el-button', { type: 'primary' });</script>`;
    // template 内无 el-* 标签，script 中的 h('el-button') 不被扫描
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it("Vue.component('el-button', ...) 注册不计入（在 script 中）", () => {
    const src = `<template><div>hi</div></template>
<script>Vue.component('el-button', { template: '<button/>' });</script>`;
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it('模板含 el-* 标签但 script 中也有 el- 字符串：仅计模板中的标签', () => {
    // 仅 <el-card> 计入；script 中的 'el-button'、'el-table' 字符串不计入
    const src = `<template><el-card /></template>
<script>const lib = 'el-button'; const cfg = { el: 'el-table' };</script>`;
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it('动态组件 <component :is> + 模板无 el-* 标签：返回空数组', () => {
    const src = `<template>
  <component :is="dynamicComp" />
</template>`;
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it('闭合标签 </el-card> 不计入（仅匹配开标签 <el-）', () => {
    // 已在 uiDependencies.test.js 覆盖单标签场景，此处补充含动态组件的复合场景
    const src = `<template>
  <component :is="'el-table'" />
  <el-button>ok</el-button>
</template>`;
    // <component 不匹配，<el-button 开标签匹配，</el-button> 闭合不匹配
    expect(extractUiDependencies(src)).toEqual(['button']);
  });
});
