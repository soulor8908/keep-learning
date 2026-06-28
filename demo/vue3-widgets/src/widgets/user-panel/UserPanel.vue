<template>
  <div class="user-panel">
    <h3>{{ t(title) }}</h3>
    <p class="user-panel__desc">{{ t('common.widget_name2') }}</p>

    <div class="user-panel__props">
      <el-tag size="small" type="info">locale: {{ locale }}</el-tag>
      <el-tag size="small" type="info">showEmail: {{ showEmail }}</el-tag>
    </div>

    <el-table :data="tableData" style="width: 100%" size="small" stripe>
      <el-table-column prop="name" :label="t('common.name')" width="120" />
      <el-table-column v-if="showEmail" prop="email" :label="t('common.email')" width="180" />
      <el-table-column prop="role" :label="t('common.role')" width="100" />
      <el-table-column prop="status" :label="t('common.status')" />
    </el-table>

    <div class="user-panel__actions">
      <el-button type="primary" size="small" @click="handleRefresh">
        {{ t('common.refresh') }}
      </el-button>
      <el-button size="small" @click="handleAdd">
        {{ t('common.add_user') }}
      </el-button>
    </div>

    <div class="user-panel__log" v-if="eventLog.length">
      <el-tag size="small" type="success">{{ t('common.events') }}: {{ eventLog.length }}</el-tag>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  title: { type: String, default: 'common.user' },
  locale: { type: String, default: 'zh-CN' },
  t: { type: Function, default: (key) => key },
  emit: { type: Function, default: () => {} },
  showEmail: { type: Boolean, default: true }
});

const eventLog = ref([]);

const tableData = computed(() => [
  { name: 'Alice', email: 'alice@example.com', role: 'Admin', status: 'Active' },
  { name: 'Bob', email: 'bob@example.com', role: 'Editor', status: 'Active' },
  { name: 'Charlie', email: 'charlie@example.com', role: 'Viewer', status: 'Disabled' }
]);

function handleRefresh() {
  eventLog.value.push({ event: 'refresh', time: Date.now() });
  props.emit('refresh', { source: 'user-panel', timestamp: Date.now() });
}

function handleAdd() {
  eventLog.value.push({ event: 'add-user', time: Date.now() });
  props.emit('add-user', { timestamp: Date.now() });
}
</script>

<style scoped>
.user-panel { padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
.user-panel h3 { margin: 0 0 4px; font-size: 18px; }
.user-panel__desc { margin: 0 0 8px; color: #909399; font-size: 13px; }
.user-panel__props { display: flex; gap: 8px; margin-bottom: 12px; }
.user-panel__actions { margin-top: 12px; }
.user-panel__log { margin-top: 8px; }
</style>
