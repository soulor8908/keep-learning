<template>
  <div class="sample-component">{{ message }}</div>
</template>

<script>
export default {
  name: 'SampleComponent',
  data() {
    return { message: 'hello' };
  }
};
</script>
