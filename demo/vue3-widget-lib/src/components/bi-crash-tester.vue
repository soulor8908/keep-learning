<template>
  <el-card :header="t('crashTester.title')">
    <p class="crash-tip">{{ t('crashTester.tip') }}</p>
    <div class="crash-actions">
      <el-button type="danger" @click="crashSync">{{ t('crashTester.sync') }}</el-button>
      <el-button type="warning" @click="crashAsync">{{ t('crashTester.async') }}</el-button>
      <el-button type="info" @click="crashPromise">{{ t('crashTester.promise') }}</el-button>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { t as rawT, onLocaleChange, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key
addMessages('zh', {
  crashTester: {
    title: '崩溃测试器',
    tip: '此物料用于测试错误边界，点击按钮触发崩溃后应被降级隔离',
    sync: '触发同步错误',
    async: '触发异步错误',
    promise: '触发 Promise rejection'
  }
});
addMessages('en', {
  crashTester: {
    title: 'Crash Tester',
    tip: 'This widget tests the error boundary. Click a button to trigger a crash and see degradation isolation.',
    sync: 'Trigger Sync Error',
    async: 'Trigger Async Error',
    promise: 'Trigger Promise Rejection'
  }
});

defineOptions({ name: 'BiCrashTester' });

defineProps({
  // 扁平化 props：宿主按 kebab-case attribute 逐项传入，包装层按声明类型解析
  title: {
    type: String,
    default: ''
  }
});

// 触发器：locale 变化时自增，驱动 computed 重新计算翻译文案
const localeTick = ref(0);
let offLocale = null;

// 包装 t：引用 localeTick 使模板渲染依赖 locale 变化，切换语言时重新求值
const t = (key, params) => {
  void localeTick.value;
  return rawT(key, params);
};

function crashSync() {
  throw new Error('同步崩溃测试');
}

function crashAsync() {
  setTimeout(() => {
    throw new Error('异步崩溃测试');
  }, 100);
}

function crashPromise() {
  Promise.reject(new Error('Promise rejection 测试'));
}

onMounted(() => {
  // 监听语言切换，触发重渲染
  offLocale = onLocaleChange(() => { localeTick.value++; });
});

onBeforeUnmount(() => {
  if (offLocale) offLocale();
});
</script>

<style scoped>
.crash-tip {
  color: #e6a23c;
  font-size: 13px;
  margin-bottom: 12px;
}
.crash-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
