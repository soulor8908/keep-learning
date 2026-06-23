<template>
  <div>
    <h3>{{ title }}</h3>
    <p>{{ desc }}</p>
  </div>
</template>

<script>
export default {
  name: 'LegacyComponent',
  props: {
    title: { type: String, default: '标题' },
    desc: { type: String, default: '描述' }
  }
};
</script>

<style scoped>
h3 {
  color: red;
}
</style>
