// @vitest-environment node
// extractUiDependencies 负向测试
//
// 现有 uiDependencies.test.js 已覆盖正向扫描（el-* 标签提取、去重、注释排除、
// script 排除、空源码、vueVersion/uiLib/uiVersion/uiFull options）。
// 本文件补充边界场景：动态组件 <component :is>、渲染函数 h()、
// Vue.component 注册、变量引用等。
//
// M3 增强后扫描范围：
// - <el-xxx> kebab 标签 ✅ 计入
// - <ElXxx> PascalCase 标签 ✅ 计入
// - <component :is="'el-xxx'"> 字符串动态组件 ✅ 计入
// - h('el-xxx') / resolveComponent('el-xxx') ✅ 计入
// - Vue.component('el-xxx', ...) ❌ 不计入（非 resolveComponent）
// - :is="dynamicVar" 变量引用 ❌ 不计入（非字符串字面量）
// - script 中裸字符串 'el-xxx' ❌ 不计入（非 h()/resolveComponent 调用）
import { describe, it, expect } from 'vitest';
import { extractUiDependencies } from '../index.js';

describe('extractUiDependencies 边界场景', () => {
  it('动态组件 <component :is="\'el-button\'"> 字符串计入（M3 增强）', () => {
    // <component :is="'el-button'"> 现在会被扫描到 button
    // 同模板内的 <el-card> 也正常计入
    const src = `<template>
  <component :is="'el-button'" />
  <el-card />
</template>`;
    expect(extractUiDependencies(src).sort()).toEqual(['button', 'card']);
  });

  it("渲染函数 h('el-button') 调用计入（M3 增强）", () => {
    const src = `<template><div>{{ x }}</div></template>
<script>const vnode = h('el-button', { type: 'primary' });</script>`;
    // template 内无 el-* 标签，但 script 中 h('el-button') 现在会被扫描
    expect(extractUiDependencies(src)).toEqual(['button']);
  });

  it("Vue.component('el-button', ...) 注册不计入（非 resolveComponent）", () => {
    const src = `<template><div>hi</div></template>
<script>Vue.component('el-button', { template: '<button/>' });</script>`;
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it('模板含 el-* 标签但 script 中也有 el- 裸字符串：仅计模板中的标签', () => {
    // 仅 <el-card> 计入；script 中的 'el-button'、'el-table' 裸字符串不计入
    // （不是 h() 或 resolveComponent 调用）
    const src = `<template><el-card /></template>
<script>const lib = 'el-button'; const cfg = { el: 'el-table' };</script>`;
    expect(extractUiDependencies(src)).toEqual(['card']);
  });

  it('动态组件 <component :is="变量"> + 模板无 el-* 标签：返回空数组', () => {
    // :is="dynamicComp" 是变量引用而非字符串字面量，不被扫描
    const src = `<template>
  <component :is="dynamicComp" />
</template>`;
    expect(extractUiDependencies(src)).toEqual([]);
  });

  it('闭合标签 </el-card> 不计入 + 动态组件字符串计入（M3）', () => {
    const src = `<template>
  <component :is="'el-table'" />
  <el-button>ok</el-button>
</template>`;
    // <component :is="'el-table'"> → table 计入
    // <el-button> 开标签 → button 计入
    // </el-button> 闭合不匹配
    expect(extractUiDependencies(src).sort()).toEqual(['button', 'table']);
  });
});
