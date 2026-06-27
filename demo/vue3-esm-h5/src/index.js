import { createH5Widget } from 'wc/vue3-esm/h5-wrapper.js';

export const locale = {
  zh: {
    h5_widget: {
      title: 'H5 物料',
      send_event: 'H5 发送事件'
    }
  },
  en: {
    h5_widget: {
      title: 'H5 Widget',
      send_event: 'H5 Send Event'
    }
  }
};

export default createH5Widget((container, props) => {
  const t = props.t || ((key) => key);
  container.innerHTML = `
    <div class="h5-widget" style="padding:16px;background:#f0f9eb;border-radius:8px;">
      <h3 style="margin:0 0 8px;color:#67c23a;">${props.title || t('h5_widget.title')}</h3>
      <button class="h5-btn" style="padding:6px 12px;border:none;background:#67c23a;color:#fff;border-radius:4px;cursor:pointer;">
        ${t('h5_widget.send_event')}
      </button>
    </div>
  `;

  const btn = container.querySelector('.h5-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      props.bus?.emit('widget:hello', { from: 'vue3-esm-h5', time: Date.now() });
    });
  }
});
