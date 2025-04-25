<script setup lang="ts">
import SvgIcon from '@/components/SvgIcon.vue';
import { fileOpen } from 'browser-fs-access';
import { uniq } from 'lodash-es';
import {
  NButton,
  NDataTable,
  NIcon,
  useMessage,
  NTooltip,
  type DataTableColumns,
} from 'naive-ui';
import { computed, onMounted, shallowRef, watch } from 'vue';
import type { WorkBook, ColInfo } from 'xlsx';
import { useEventListener, useStorage } from '@vueuse/core';
import { saveAs } from 'file-saver';
import dayjs from 'dayjs';

const jszipAsync = () => import('jszip');
const xlsxAsync = () => import('xlsx');

const message = useMessage();

interface JsonFileExt extends File {
  _text?: string;
  _lang?: LangKey;
  _data?: Record<string, string>;
}
interface XlsxFileExt extends File {
  _data: WorkBook;
}

const getSizeDesc = (n: number): string => {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(2) + 'KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + 'MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
};

const equalFile = (a: JsonFileExt, b: JsonFileExt): boolean => {
  if (a === b) return true;
  return a.name === b.name && a.size === b.size && a._text === b._text;
};

const uniqFile = (list: JsonFileExt[]): JsonFileExt[] => {
  if (list.length <= 1) return list;
  const a: JsonFileExt[] = [];
  list.forEach((f) => {
    if (!a.some((v) => equalFile(v, f))) {
      a.push(f);
    }
  });
  return a;
};

const safeRun = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {}
};

const jsonFiles = shallowRef<JsonFileExt[]>([]);
const addJsonFile = async (_files: File[] | undefined) => {
  const files: JsonFileExt[] = (
    _files ??
    (await fileOpen({
      mimeTypes: ['application/json'],
      multiple: true,
    }).catch(() => Array<JsonFileExt>()))
  ).filter((f) => f.name.endsWith('.json'));
  await Promise.all(
    files.map(async (f) => {
      f._lang = getLangKeyByName(f.name);
      if (!f._lang) return;
      f._text = await f.text();
      f._data = safeRun(() => {
        const t = JSON.parse(f._text || '');
        if (typeof Object.values(t)[0] === 'string') {
          return t;
        }
        const p: Record<string, string> = {};
        Object.values(t).forEach((v) => {
          if (typeof v === 'object' && v) {
            Object.assign(p, v);
          }
        });
        return p;
      });
    })
  );
  jsonFiles.value = uniqFile(
    jsonFiles.value.concat(files.filter((f) => f._lang && f._data))
  );
};
const removeFile = (f: File) => {
  if (isReadXlsx.value) {
    xlsxFile.value = undefined;
  } else {
    jsonFiles.value = jsonFiles.value.filter((v) => v !== f);
  }
};

const allLangLeys = ['zhCN', 'zhTW', 'enUS', 'thTH'] as const;
type LangKey = (typeof allLangLeys)[number];
interface I18nItem {
  key: string;
  zhCN?: string;
  zhTW?: string;
  enUS?: string;
  thTH?: string;
}
const getLangKeyByName = (name: string): LangKey | undefined => {
  name = name.toLowerCase();
  if (name.includes('.zh.')) return 'zhCN';
  if (name.includes('.zh-cn.')) return 'zhCN';
  if (name.includes('.zh-tw.')) return 'zhTW';
  if (name.includes('繁体')) return 'zhTW';
  if (name.includes('.en.')) return 'enUS';
  if (name.includes('.en-us.')) return 'enUS';
  if (name.includes('.th.')) return 'thTH';
  if (name.includes('.th-th.')) return 'thTH';
  if (name.includes('泰文')) return 'thTH';
};

const showData = shallowRef<I18nItem[]>([]);
const getJsonKeys = (): string[] => {
  const list: string[] = [];
  jsonFiles.value.map((f) => {
    if (f._data) {
      list.push(...Object.keys(f._data));
    }
  });
  return uniq(list);
};

watch(jsonFiles, () => {
  if (isReadXlsx.value) return;
  showData.value = getJsonKeys().map((k) => {
    const item: I18nItem = { key: k };
    jsonFiles.value.forEach((f) => {
      if (f._data && f._lang) {
        item[f._lang] = f._data[k];
      }
    });
    return item;
  });
});

const columns: DataTableColumns<I18nItem> = [
  {
    key: 'key',
    align: 'left',
    title: 'Key',
    width: '100px',
  },
  {
    key: 'zhCN',
    title: '汉语',
  },
  {
    key: 'zhTW',
    title: '繁体',
  },
  {
    key: 'enUS',
    title: '英文',
  },
  {
    key: 'thTH',
    title: '泰语',
  },
];

const isReadXlsx = useStorage('isReadXlsx', false);
const switchMode = () => {
  isReadXlsx.value = !isReadXlsx.value;
  jsonFiles.value = [];
  xlsxFile.value = undefined;
  showData.value = [];
};
const xlsxFile = shallowRef<XlsxFileExt>();
const addXlsxFile = async (_files: File[] | undefined) => {
  const file = (_files?.[0] ??
    (await fileOpen({
      mimeTypes: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      multiple: false,
    }).catch(() => {}))) as XlsxFileExt | undefined;
  if (!file) return;
  if (!file.name.endsWith('.xlsx')) return;
  const bf = await file.arrayBuffer();
  const XLSX = await xlsxAsync();
  const book = safeRun(() => XLSX.read(bf, { type: 'buffer' }));
  if (book) {
    file._data = book;
    xlsxFile.value = file;
  }
};

watch(xlsxFile, async () => {
  if (!isReadXlsx.value) return;
  const book = xlsxFile.value?._data;
  if (!book) {
    showData.value = [];
    return;
  }
  const XLSX = await xlsxAsync();
  const list = XLSX.utils.sheet_to_json(
    Object.values(book.Sheets)[0]
  ) as Record<string, string>[];
  showData.value = list.map((v) => {
    return {
      key: v.Key,
      zhCN: v['汉语'],
      zhTW: v['繁体'],
      enUS: v['英语'],
      thTH: v['泰语'],
    };
  });
});

const addFile = async (_files?: File[]) => {
  if (isReadXlsx.value) {
    await addXlsxFile(_files);
  } else {
    await addJsonFile(_files);
  }
};
const getDragEventFiles = (e: DragEvent): File[] => {
  const files: File[] = [];
  if (e.dataTransfer?.items) {
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
  } else {
    files.push(...Array.from(e.dataTransfer?.files || []));
  }
  return files;
};

useEventListener(document.body, 'drop', async (e) => {
  e.preventDefault();
  await addFile(getDragEventFiles(e));
});
useEventListener(document.body, 'dragover', (e) => {
  e.preventDefault();
});

const exportJson = async () => {
  if (showData.value.length === 0) return;
  if (!xlsxFile.value) return;
  const JSZip = (await jszipAsync()).default;
  const zip = new JSZip();
  const name = (xlsxFile.value.name || '').replace(/\.xlsx$/, '');
  allLangLeys.forEach((langKey) => {
    if (showData.value.some((v) => v[langKey])) {
      const jsonStr = JSON.stringify(
        Object.fromEntries(showData.value.map((v) => [v.key, v[langKey]])),
        undefined,
        4
      );
      zip.file(`${langKey}.json`, jsonStr);
    }
  });
  saveAs(
    await zip.generateAsync({ type: 'blob' }),
    `${name}-i18n-${dayjs().format('HH_mm_ss')}.zip`
  );
  message.success('导出成功');
};
const exportXlsx = async () => {
  if (showData.value.length === 0) return;
  if (jsonFiles.value.length === 0) return;
  const name = jsonFiles.value[0].name.replace(/\.json$/, '');
  const XLSX = await xlsxAsync();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(
    showData.value
      .filter((v) => Object.values(v).length > 1)
      .map((v) => ({
        Key: v.key,
        汉语: v.zhCN || '',
        繁体: v.zhTW || '',
        英语: v.enUS || '',
        泰语: v.thTH || '',
      })),
    {
      header: ['Key', '汉语', '繁体', '英语', '泰语'],
    }
  );
  ws['!cols'] = [{ wch: 10 }, ...Array<ColInfo>(4).fill({ wch: 50 })];
  XLSX.utils.book_append_sheet(wb, ws, '翻译');
  XLSX.writeFile(wb, `${name}-${dayjs().format('HH_mm_ss')}.xlsx`);
  message.success('导出成功');
};

const exportFile = async () => {
  if (isReadXlsx.value) {
    exportJson();
  } else {
    exportXlsx();
  }
};

const showFiles = computed(() => {
  if (isReadXlsx.value) {
    return xlsxFile.value ? [xlsxFile.value] : [];
  }
  return jsonFiles.value;
});

const getIfIsInnerNetwork = async (): Promise<boolean> => {
  const r = await fetch(
    atob('aHR0cHM6Ly9iYWNrZW5kLWZlZWRiYWNrLmlxaXlpLmNvbS8='),
    {
      mode: 'no-cors',
    }
  ).catch(() => {});
  return Boolean(r);
};

const isInnerNetwork = shallowRef<boolean>();
onMounted(async () => {
  isInnerNetwork.value = await getIfIsInnerNetwork();
});
</script>
<template>
  <div
    p-16px
    box-border
    relative
    flex
    flex-col
    gap-20px
    class="h-[var(--page-h)]"
  >
    <a
      href="https://github.com/lisonge/language-convert-kit"
      target="_blank"
      referrerpolicy="no-referrer"
      absolute
      top-16px
      right-16px
      block
    >
      <SvgIcon name="github" text-24px />
    </a>

    <div flex gap-24px items-center>
      <div text="20px/28px">国际化数据转换工具</div>
      <NButton type="primary" size="tiny" @click="switchMode">
        <template #icon>
          <NIcon>
            <SvgIcon name="swap-horiz" />
          </NIcon>
        </template>
        <template #default>
          {{ isReadXlsx ? 'XLSX -> JSON' : 'JSON -> XLSX' }}
        </template>
      </NButton>
      <NTooltip>
        <template #trigger>
          <NButton type="primary" @click="addFile()" size="tiny">
            导入文件
          </NButton>
        </template>
        <template #default> 支持拖拽文件至页面任意位置导入 </template>
      </NTooltip>
      <template v-if="showData.length">
        <NButton type="primary" @click="exportFile" size="tiny">
          {{ isReadXlsx ? '导出为JSON' : '导出为XLSX' }}
        </NButton>
        <div>{{ `累计 ${showData.length} 条数据` }}</div>
      </template>
      <div
        v-if="isInnerNetwork !== undefined"
        color-transparent
        bg-transparent
        transition-colors
        class="hover:color-black hover:bg-red-2"
        px-20px
      >
        {{ '你在' + (isInnerNetwork ? '内网' : '外网') }}
      </div>
    </div>
    <div>
      <div flex gap-8px h-36px overflow-x-scroll>
        <div
          v-for="(f, i) in showFiles"
          :key="i"
          flex
          shrink-0
          px-8px
          gap-8px
          items-center
          bg-blue-100
        >
          <div text-20px>{{ f.name }}</div>
          <div bg-cyan-300 text="14px/100%" p-2px rounded-2px>
            {{ getSizeDesc(f.size) }}
          </div>
          <NButton quaternary circle @click="removeFile(f)" size="tiny">
            <template #icon>
              <NIcon>
                <SvgIcon name="close" />
              </NIcon>
            </template>
          </NButton>
        </div>
      </div>
    </div>
    <NDataTable
      striped
      class="flex-1"
      virtualScroll
      flexHeight
      :rowKey="(r) => r.key"
      :data="showData"
      :columns="columns"
    />
  </div>
</template>
