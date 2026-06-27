/**
 * 原生 H5 物料示例：推荐区域（C 业务团队）
 *
 * 演示配置对象入口模式——default 导出含 render + onMount 的对象：
 *   render(props, scope) 返回 HTML 字符串
 *   onMount(element, props, scope) 绑定点击事件，返回清理函数
 *
 * 扁平化 props 协议：宿主把每个 prop 作为独立 kebab-case attribute 传入
 * （title、items），包装层收集后作为扁平 props 对象传给 render/onMount。
 *
 * 无框架依赖，vueVersion='none'，构建产物极小。
 * 点击推荐卡片通过 widget-bus 发出 recommend:expose 事件。
 *
 * 国际化：通过 scope.t() 读取 wc-i18n 翻译，随基座语言切换自动重渲染
 * （wrapper 层 onLocaleChange -> _render() 驱动）。
 */

// 物料内部文案通过 wc-i18n 的 addMessages 注册（与 Vue 物料一致模式）
import { addMessages } from 'wc-i18n';

addMessages('zh', {
  recommend: {
    title: '推荐区域',
    team_tag: 'C 业务团队 · 原生H5',
    empty: '暂无推荐'
  }
});
addMessages('en', {
  recommend: {
    title: 'Recommendations',
    team_tag: 'Team C · Native H5',
    empty: 'No recommendations'
  }
});

// 物料数据字典：按 id 查找可翻译的字段（名称、标签）
// 实际项目中数据来自后端，此处仅做演示
const ITEM_DATA = {
  zh: {
    'REC-01': { name: 'USB-C 扩展坞', tag: '热销' },
    'REC-02': { name: '降噪入耳耳机', tag: '新品' },
    'REC-03': { name: '桌面理线器', tag: '优惠' }
  },
  en: {
    'REC-01': { name: 'USB-C Hub', tag: 'Hot' },
    'REC-02': { name: 'Noise-Cancelling Earbuds', tag: 'New' },
    'REC-03': { name: 'Desktop Cable Organizer', tag: 'Sale' }
  }
};

export default {
  // 声明的独立 prop 名：包装层据此观察对应 kebab-case attribute
  props: ['title', 'items'],

  render(props, scope) {
    const items = Array.isArray(props.items) ? props.items : [];
    const locale = (typeof window !== 'undefined' && window.__wcI18n__ && window.__wcI18n__.getLocale)
      ? window.__wcI18n__.getLocale()
      : 'zh';
    const title = props.title || scope.t('recommend.title');
    const dataDict = ITEM_DATA[locale] || ITEM_DATA.zh;

    const cardsHtml = items.length > 0
      ? items.map(item => {
          const id = (item && item.id) || '';
          const localized = dataDict[id] || {};
          const name = localized.name || '';
          const price = (item && item.price) || '';
          const tag = localized.tag || '';
          return `
            <div class="bi-recommend-panel__card" data-id="${id}">
              ${tag ? `<div class="bi-recommend-panel__tag">${tag}</div>` : ''}
              <div class="bi-recommend-panel__name">${name}</div>
              <div class="bi-recommend-panel__price">¥${price}</div>
            </div>
          `;
        }).join('')
      : `<div class="bi-recommend-panel__empty">${scope.t('recommend.empty')}</div>`;

    return `
      <div class="bi-recommend-panel">
        <div class="bi-recommend-panel__header">
          <span class="bi-recommend-panel__title">${title}</span>
          <span class="bi-recommend-panel__team">${scope.t('recommend.team_tag')}</span>
        </div>
        <div class="bi-recommend-panel__grid">${cardsHtml}</div>
      </div>
    `;
  },

  onMount(element, props, scope) {
    const cards = element.querySelectorAll('.bi-recommend-panel__card');
    const handler = (e) => {
      const card = e.currentTarget;
      const id = card.getAttribute('data-id');
      const name = card.querySelector('.bi-recommend-panel__name').textContent;
      // 通过 scope.bus 发出业务事件
      if (scope && scope.bus) {
        scope.bus.emit('recommend:expose', { id, name });
      }
    };
    cards.forEach(c => c.addEventListener('click', handler));

    scope.log.info('推荐区域已挂载');

    return () => {
      cards.forEach(c => c.removeEventListener('click', handler));
    };
  }
};
