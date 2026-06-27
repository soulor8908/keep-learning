// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { createApp } from 'vue';
import WidgetHost from '../WidgetHost.js';
import fixture from './fixtures/test-widget.js';

describe('WidgetHost', () => {
  it('应该加载并渲染远程物料', async () => {
    const container = document.createElement('div');
    const importer = async () => ({ default: fixture });
    const app = createApp(WidgetHost, {
      url: 'test://fixture/test-widget.js',
      widgetProps: { title: 'Host Test' },
      importer
    });
    app.mount(container);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.textContent).toContain('Host Test');
    app.unmount();
  });
});
