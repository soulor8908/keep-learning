// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { analyze, collectDeps, generateVueManifest } from '../index.js';

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-deps-'));
});

afterEach(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

/**
 * 创建一个 fake 项目目录：含 package.json 与 node_modules/<dep>/package.json
 * @param {string} name 项目目录名
 * @param {object} pkg package.json 内容（dependencies 等）
 * @param {object} installed { [depName]: version } 已安装版本（写入 node_modules）
 */
function createProject(name, pkg, installed = {}) {
  const dir = path.join(tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');
  if (Object.keys(installed).length > 0) {
    const nm = path.join(dir, 'node_modules');
    fs.mkdirSync(nm, { recursive: true });
    for (const [dep, ver] of Object.entries(installed)) {
      const depDir = path.join(nm, dep);
      fs.mkdirSync(depDir, { recursive: true });
      fs.writeFileSync(path.join(depDir, 'package.json'), JSON.stringify({ name: dep, version: ver }, null, 2), 'utf-8');
    }
  }
  return dir;
}

describe('dependency-analyzer 公共依赖冲突与版本兼容', () => {
  describe('T2.4a 通过用例（无冲突）', () => {
    it('两项目相同 vue 版本 → 无 conflict，vue 在 commonDeps', () => {
      const a = createProject('a', {
        name: 'proj-a', version: '1.0.0',
        dependencies: { vue: '^2.6.14' }
      }, { vue: '2.6.14' });
      const b = createProject('b', {
        name: 'proj-b', version: '1.0.0',
        dependencies: { vue: '^2.6.14' }
      }, { vue: '2.6.14' });
      const { conflicts, commonDeps } = analyze([a, b]);
      expect(conflicts).toEqual([]);
      const vueCommon = commonDeps.find(d => d.depName === 'vue');
      expect(vueCommon).toBeTruthy();
      expect(vueCommon.installedVersions).toEqual(['2.6.14']);
    });

    it('单项目 → 无 commonDeps（无公共依赖）', () => {
      const a = createProject('solo', {
        name: 'solo', version: '1.0.0',
        dependencies: { vue: '^3.4.0', lodash: '^4.0.0' }
      }, { vue: '3.4.21', lodash: '4.17.21' });
      const { conflicts, commonDeps } = analyze([a]);
      expect(conflicts).toEqual([]);
      expect(commonDeps).toEqual([]);
    });

    it('devDependencies 不被收集（只收集运行时 dependencies）', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { vue: '^2.6.14' },
        devDependencies: { vite: '^5.0.0', eslint: '^8.0.0' }
      }, { vue: '2.6.14', vite: '5.0.0' });
      const { projectDeps } = analyze([a]);
      const deps = Object.keys(projectDeps[0].dependencies);
      expect(deps).toContain('vue');
      expect(deps).not.toContain('vite');
      expect(deps).not.toContain('eslint');
    });
  });

  describe('T2.4b 拒收用例（冲突被检测）', () => {
    it('两项目 vue 版本不同（2.x vs 3.x）→ conflict', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { vue: '^2.6.14' }
      }, { vue: '2.6.14' });
      const b = createProject('b', {
        name: 'b', version: '1.0.0',
        dependencies: { vue: '^3.4.0' }
      }, { vue: '3.4.21' });
      const { conflicts, commonDeps } = analyze([a, b]);
      expect(conflicts.length).toBe(1);
      expect(conflicts[0].depName).toBe('vue');
      expect(conflicts[0].installedVersions).toContain('2.6.14');
      expect(conflicts[0].installedVersions).toContain('3.4.21');
      const vueCommon = commonDeps.find(d => d.depName === 'vue');
      expect(vueCommon.installedVersions.length).toBe(2);
    });

    it('公共依赖版本不一致（element-ui 2.13 vs 2.15）→ conflict', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { 'element-ui': '^2.13.0' }
      }, { 'element-ui': '2.13.2' });
      const b = createProject('b', {
        name: 'b', version: '1.0.0',
        dependencies: { 'element-ui': '^2.15.0' }
      }, { 'element-ui': '2.15.14' });
      const { conflicts } = analyze([a, b]);
      expect(conflicts[0].depName).toBe('element-ui');
      expect(conflicts[0].installedVersions).toEqual(['2.13.2', '2.15.14']);
    });
  });

  describe('T2.4c 边界用例', () => {
    it('公共依赖但其中一个未安装（installed=null）→ 不算 conflict', () => {
      // 注意：getInstalledVersion 在项目自身 node_modules 未命中时会回退到
      // process.cwd()/node_modules/<dep>。为避免被工作区已安装的同名包污染，
      // 这里使用一个工作区不可能安装的虚构依赖名 wc-fake-dep-xyz。
      const FAKE_DEP = 'wc-fake-dep-xyz';
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { [FAKE_DEP]: '^1.0.0' }
      }, { [FAKE_DEP]: '1.2.3' });
      const b = createProject('b', {
        name: 'b', version: '1.0.0',
        dependencies: { [FAKE_DEP]: '^1.0.0' }
      }); // 无 node_modules，installed=null（工作区也无此包）
      const { conflicts, commonDeps } = analyze([a, b]);
      // 一个 installed=null，另一个 1.2.3，distinct 非 null 版本只有 1 个 → 不冲突
      expect(conflicts).toEqual([]);
      const fd = commonDeps.find(d => d.depName === FAKE_DEP);
      expect(fd.installedVersions).toEqual(['1.2.3']);
    });

    it('npm alias 协议：declared=npm:vue3@3.4.21，installed 取 aliasVersion', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { vue: 'npm:vue3@3.4.21' }
      });
      const { projectDeps } = analyze([a]);
      const vueInfo = projectDeps[0].dependencies.vue;
      expect(vueInfo.protocol).toBe('alias');
      expect(vueInfo.aliasName).toBe('vue3');
      expect(vueInfo.installed).toBe('3.4.21');
    });

    it('workspace 协议：declared=workspace:*，protocol=workspace', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { 'shared-lib': 'workspace:*' }
      }, { 'shared-lib': '1.2.0' });
      const { projectDeps } = analyze([a]);
      expect(projectDeps[0].dependencies['shared-lib'].protocol).toBe('workspace');
      expect(projectDeps[0].dependencies['shared-lib'].installed).toBe('1.2.0');
    });

    it('link/file 协议：declared=link:./path，protocol=link', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { 'local-pkg': 'link:../local-pkg' }
      }, { 'local-pkg': '0.0.1' });
      const { projectDeps } = analyze([a]);
      expect(projectDeps[0].dependencies['local-pkg'].protocol).toBe('link');
    });

    it('项目无 package.json → collectDeps 抛错', () => {
      const emptyDir = path.join(tmpDir, 'empty');
      fs.mkdirSync(emptyDir, { recursive: true });
      expect(() => collectDeps(emptyDir)).toThrow();
    });

    it('三项目公共依赖：A、B 同版本，C 不同版本 → conflict', () => {
      const a = createProject('a', {
        name: 'a', version: '1.0.0',
        dependencies: { lodash: '^4.0.0' }
      }, { lodash: '4.17.21' });
      const b = createProject('b', {
        name: 'b', version: '1.0.0',
        dependencies: { lodash: '^4.0.0' }
      }, { lodash: '4.17.21' });
      const c = createProject('c', {
        name: 'c', version: '1.0.0',
        dependencies: { lodash: '^3.0.0' }
      }, { lodash: '3.10.1' });
      const { conflicts, commonDeps } = analyze([a, b, c]);
      const ld = commonDeps.find(d => d.depName === 'lodash');
      expect(ld.usages.length).toBe(3);
      expect(conflicts[0].depName).toBe('lodash');
      expect(conflicts[0].installedVersions).toEqual(['4.17.21', '3.10.1']);
    });
  });

  describe('T2.4d generateVueManifest 版本兼容判定', () => {
    it('vue 2.x → vueGlobal=Vue2', () => {
      const a = createProject('a', {
        name: 'proj-v2', version: '1.0.0',
        dependencies: { vue: '^2.6.14' }
      }, { vue: '2.6.14' });
      const { projectDeps } = analyze([a]);
      const manifest = generateVueManifest(projectDeps);
      expect(manifest['proj-v2']).toEqual({ vueVersion: '2.6.14', vueGlobal: 'Vue2' });
    });

    it('vue 3.x → vueGlobal=Vue3', () => {
      const a = createProject('a', {
        name: 'proj-v3', version: '1.0.0',
        dependencies: { vue: '^3.4.0' }
      }, { vue: '3.4.21' });
      const { projectDeps } = analyze([a]);
      const manifest = generateVueManifest(projectDeps);
      expect(manifest['proj-v3']).toEqual({ vueVersion: '3.4.21', vueGlobal: 'Vue3' });
    });

    it('项目未安装 vue → 不在 manifest 中', () => {
      const a = createProject('a', {
        name: 'no-vue', version: '1.0.0',
        dependencies: { lodash: '^4.0.0' }
      }, { lodash: '4.17.21' });
      const { projectDeps } = analyze([a]);
      const manifest = generateVueManifest(projectDeps);
      expect(manifest['no-vue']).toBeUndefined();
    });

    it('多项目混合 Vue2/Vue3 → manifest 分别映射', () => {
      const a = createProject('a', {
        name: 'v2proj', version: '1.0.0',
        dependencies: { vue: '^2.6.14' }
      }, { vue: '2.6.14' });
      const b = createProject('b', {
        name: 'v3proj', version: '1.0.0',
        dependencies: { vue: '^3.4.0' }
      }, { vue: '3.4.21' });
      const { projectDeps } = analyze([a, b]);
      const manifest = generateVueManifest(projectDeps);
      expect(manifest['v2proj'].vueGlobal).toBe('Vue2');
      expect(manifest['v3proj'].vueGlobal).toBe('Vue3');
    });
  });
});
