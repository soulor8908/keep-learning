<template>
  <el-card header="崩溃测试器">
    <p class="crash-tip">此物料用于测试错误边界，点击按钮触发崩溃后应被降级隔离</p>
    <div class="crash-actions">
      <el-button type="danger" @click="crashSync">触发同步错误</el-button>
      <el-button type="warning" @click="crashAsync">触发异步错误</el-button>
      <el-button type="info" @click="crashPromise">触发 Promise rejection</el-button>
    </div>
  </el-card>
</template>

<script setup>
defineOptions({ name: 'BiCrashTester' });

defineProps({
  config: {
    type: Object,
    default: () => ({})
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
