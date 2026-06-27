// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountWidget } from '../loader.js';
import fixture from './fixtures/test-widget.js';

const FIXTURE_URL = 'test://fixture/test-widget.js';

function createImporter(mod) {
  return async () => mod;
}

describe('loader', () => {
  it('应该渲染本地 ESM 物料组件', async () => {
    const container = document.createElement('div');
    const unmount = await mountWidget(
      container,
      FIXTURE_URL,
      { title: 'Hello Test' },
      createImporter({ default: fixture })
    );
    expect(container.textContent).toContain('Hello Test');
    unmount();
  });

  it('URL 加载失败时应渲染错误占位', async () => {
    const container = document.createElement('div');
    const unmount = await mountWidget(
      container,
      'test://not-found/widget.js',
      {},
      async () => {
        throw new Error('not found');
      }
    );
    expect(container.textContent).toContain('物料加载失败');
    unmount();
  });

  it('同一 URL 应该复用缓存', async () => {
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    const importer = createImporter({ default: fixture });
    const u1 = await mountWidget(c1, FIXTURE_URL, { title: 'Cached Widget' }, importer);
    const u2 = await mountWidget(c2, FIXTURE_URL, { title: 'Cached Widget' }, importer);
    expect(c1.textContent).toContain('Cached Widget');
    expect(c2.textContent).toContain('Cached Widget');
    u1();
    u2();
  });
});

describe('locale 自动注册', () => {
  let originalI18n;

  beforeEach(() => {
    originalI18n = window.__wcI18n__;
  });

  afterEach(() => {
    if (originalI18n) {
      window.__wcI18n__ = originalI18n;
    } else {
      delete window.__wcI18n__;
    }
  });

  it('物料导出 locale 时应自动注册到 i18n', async () => {
    const addMessagesCalls = [];
    window.__wcI18n__ = {
      addMessages: (locale, msgs) => addMessagesCalls.push({ locale, msgs })
    };

    const localeUrl = 'test://fixture/locale-widget.js';
    const locale = {
      zh: { chart: { title: '图表面板' } },
      en: { chart: { title: 'Chart Panel' } }
    };
    const importer = createImporter({ default: fixture, locale });

    const container = document.createElement('div');
    const unmount = await mountWidget(container, localeUrl, {}, importer);

    expect(addMessagesCalls).toHaveLength(2);
    expect(addMessagesCalls[0]).toEqual({ locale: 'zh', msgs: { chart: { title: '图表面板' } } });
    expect(addMessagesCalls[1]).toEqual({ locale: 'en', msgs: { chart: { title: 'Chart Panel' } } });
    unmount();
  });

  it('物料未导出 locale 时不报错', async () => {
    window.__wcI18n__ = { addMessages: () => {} };
    const noLocaleUrl = 'test://fixture/no-locale-widget.js';
    const importer = createImporter({ default: fixture });
    const container = document.createElement('div');
    const unmount = await mountWidget(container, noLocaleUrl, {}, importer);
    expect(container.textContent).toContain('Test Widget');
    unmount();
  });

  it('window.__wcI18n__ 不存在时静默跳过', async () => {
    delete window.__wcI18n__;
    const noI18nUrl = 'test://fixture/no-i18n-widget.js';
    const importer = createImporter({ default: fixture, locale: { zh: { x: '1' } } });
    const container = document.createElement('div');
    const unmount = await mountWidget(container, noI18nUrl, {}, importer);
    expect(container.textContent).toContain('Test Widget');
    unmount();
  });
});
