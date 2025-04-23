<script setup lang="ts">
import { debounce } from 'lodash-es';
import { useEventListener } from '@vueuse/core';
import { dateZhCN, zhCN, NConfigProvider, NMessageProvider } from 'naive-ui';
import HomeView from '@/views/HomeView.vue';

const freeActiveElement = debounce(() => {
  if (document.activeElement instanceof HTMLButtonElement) {
    document.activeElement.blur();
  }
}, 1000);
useEventListener('click', () => {
  freeActiveElement();
});
</script>
<template>
  <NConfigProvider abstract :locale="zhCN" :date-locale="dateZhCN">
    <NMessageProvider>
      <HomeView />
    </NMessageProvider>
  </NConfigProvider>
</template>
