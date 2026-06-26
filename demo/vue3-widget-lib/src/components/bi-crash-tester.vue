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
import { t, addMessages } from 'wc-i18n';

// 模块顶层注册私有文案：确保首屏渲染前字典已就绪，避免初始显示 key。
// 语言切换的响应式由 wrapper 基础设施层统一处理（对物料实例 $forceUpdate），
// 组件只需在模板里直接调用 t()，无需自建 localeTick / onLocaleChange。
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
