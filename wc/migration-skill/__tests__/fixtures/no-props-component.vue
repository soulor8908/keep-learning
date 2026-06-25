<template>
  <div class="info-card">
    <span>{{ message }}</span>
  </div>
</template>

<script>
export default {
  name: 'InfoCard',
  data() {
    return { message: 'hello' };
  }
};
</script>
