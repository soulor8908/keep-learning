// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const extensionDir = path.resolve(__dirname, '..');

describe('Chrome DevTools 扩展 manifest 校验', () => {
  const manifest = JSON.parse(readFileSync(path.join(extensionDir, 'manifest.json'), 'utf-8'));

  it('manifest_version 为 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('含 name/version/description', () => {
    expect(typeof manifest.name).toBe('string');
    expect(typeof manifest.version).toBe('string');
    expect(typeof manifest.description).toBe('string');
  });

  it('devtools_page 指向存在的 devtools.html', () => {
    expect(manifest.devtools_page).toBe('devtools.html');
    expect(() => readFileSync(path.join(extensionDir, 'devtools.html'), 'utf-8')).not.toThrow();
  });

  it('content_scripts 含 content-script.js，匹配所有 URL', () => {
    expect(Array.isArray(manifest.content_scripts)).toBe(true);
    const cs = manifest.content_scripts[0];
    expect(cs.js).toContain('content-script.js');
    expect(cs.matches).toContain('<all_urls>');
  });

  it('web_accessible_resources 含 injected.js', () => {
    const war = manifest.web_accessible_resources[0];
    expect(war.resources).toContain('injected.js');
    expect(war.matches).toContain('<all_urls>');
  });

  it('permissions 含 activeTab', () => {
    expect(manifest.permissions).toContain('activeTab');
  });
});

describe('扩展文件完整性', () => {
  const requiredFiles = [
    'manifest.json', 'devtools.html', 'devtools.js',
    'content-script.js', 'injected.js',
    'panel.html', 'panel.css', 'panel.js'
  ];

  requiredFiles.forEach(function (file) {
    it('存在 ' + file, () => {
      expect(() => readFileSync(path.join(extensionDir, file), 'utf-8')).not.toThrow();
    });
  });
});

describe('injected.js 注入脚本结构', () => {
  const code = readFileSync(path.join(extensionDir, 'injected.js'), 'utf-8');

  it('Hook customElements.define 追踪 bi-* 物料', () => {
    expect(code).toContain('customElements.define');
    expect(code).toContain("indexOf('bi-') === 0");
  });

  it('Hook window.widgetBus.emit 捕获事件流', () => {
    expect(code).toContain('window.widgetBus');
    expect(code).toContain('bus.emit');
  });

  it('暴露 __wcDevtoolsBridge.onLifecycle 接收生命周期', () => {
    expect(code).toContain('__wcDevtoolsBridge');
    expect(code).toContain('onLifecycle');
  });

  it('响应 getSnapshot / clearEvents 请求', () => {
    expect(code).toContain('getSnapshot');
    expect(code).toContain('clearEvents');
  });

  it('收集运行时全局变量状态（Vue2/Vue3/lodash/axios）', () => {
    expect(code).toContain('window.Vue2');
    expect(code).toContain('window.Vue3');
    expect(code).toContain('window._');
    expect(code).toContain('window.axios');
  });

  it('防重复注入守卫', () => {
    expect(code).toContain('__wcDevtoolsInjected');
  });
});

describe('content-script.js 桥接结构', () => {
  const code = readFileSync(path.join(extensionDir, 'content-script.js'), 'utf-8');

  it('注入 injected.js 到页面 MAIN world', () => {
    expect(code).toContain('createElement(\'script\')');
    expect(code).toContain('chrome.runtime.getURL(\'injected.js\')');
  });

  it('桥接面板请求到页面（CustomEvent）', () => {
    expect(code).toContain('__wc-devtools-request');
    expect(code).toContain('__wc-devtools-response');
  });

  it('监听 chrome.runtime.onMessage', () => {
    expect(code).toContain('chrome.runtime.onMessage');
  });
});

describe('panel.js 面板逻辑结构', () => {
  const code = readFileSync(path.join(extensionDir, 'panel.js'), 'utf-8');
  const html = readFileSync(path.join(extensionDir, 'panel.html'), 'utf-8');

  it('三 Tab：widgets/events/performance（HTML 中定义，JS 中切换）', () => {
    // HTML 中含三个 tab button
    expect(html).toContain('data-tab="widgets"');
    expect(html).toContain('data-tab="events"');
    expect(html).toContain('data-tab="performance"');
    // JS 中按 tab 切换内容区
    expect(code).toContain("'tab-' + activeTab");
  });

  it('通过 chrome.tabs.sendMessage 请求数据', () => {
    expect(code).toContain('chrome.tabs.sendMessage');
    expect(code).toContain('chrome.devtools.inspectedWindow.tabId');
  });

  it('渲染运行时徽章（Vue2/Vue3/lodash/axios）', () => {
    expect(code).toContain("badge('Vue2'");
    expect(code).toContain("badge('Vue3'");
    expect(code).toContain("badge('lodash'");
    expect(code).toContain("badge('axios'");
  });

  it('自动刷新机制', () => {
    expect(code).toContain('autoRefresh');
    expect(code).toContain('setInterval');
  });
});
