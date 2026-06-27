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
