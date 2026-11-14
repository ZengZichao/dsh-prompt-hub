/**
 * dsh-prompt-hub — browser half.
 *
 * Three registrations:
 *   sidebar.panellist          → the sidebar button (icon only; the shell owns the button)
 *   main                       → the management panel, keyed `prompt-hub`
 *   conversation.input.left    → the composer button, which opens a picker popover
 *
 * The prompt library lives on the Host half. Every write carries the `rev` the
 * client read, so a save that raced another writer is rejected with a conflict
 * banner instead of silently overwriting it.
 *
 * User preferences (insert mode, picker size, delete confirmation) are per
 * browser and kept in localStorage; the library itself is shared through the
 * Host, so the sidebar panel and the agent tool always see the same data.
 */

window.__ModuleLoader__.load({
  id: 'dsh-prompt-hub',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useMemo, useCallback } = React
    let ReactDOM = null
    try { ReactDOM = require('react-dom') } catch { ReactDOM = null }

    const ROUTE = '/dsh-prompt-hub/data'
    const LOCALE_NS = 'dsh-prompt-hub'
    const PANEL_ID = 'prompt-hub'
    const SETTINGS_KEY = 'dsh-prompt-hub:settings'
    const LIST_RENDER_LIMIT = 200
    const SEARCH_DEBOUNCE_MS = 150
    const UNDO_MS = 8000
    const VARIABLE_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

    // ---------------------------------------------------------------- i18n ----
    const LOCALES = {
      zh: {
        'nav': '提示词中心',
        'composer.label': '插入提示词',
        'panel.title': '提示词中心',
        'panel.count': '{count} 条',
        'panel.countOne': '{count} 条',
        'search.placeholder': '搜索提示词',
        'cat.label': '分类',
        'cat.all': '全部',
        'cat.none': '未分类',
        'cat.add': '新建分类',
        'cat.rename': '重命名',
        'cat.delete': '删除',
        'cat.manage': '管理',
        'cat.managerTitle': '管理分类',
        'cat.empty': '还没有分类',
        'cat.namePlaceholder': '分类名称',
        'cat.moveUp': '上移',
        'cat.moveDown': '下移',
        'tag.label': '标签',
        'tag.all': '全部标签',
        'tag.placeholder': '添加标签',
        'prompt.add': '新建提示词',
        'prompt.edit': '编辑',
        'prompt.delete': '删除',
        'prompt.duplicate': '创建副本',
        'prompt.copy': '复制内容',
        'prompt.pin': '置顶',
        'prompt.unpin': '取消置顶',
        'prompt.more': '更多操作',
        'prompt.empty': '还没有提示词',
        'prompt.noMatch': '没有匹配的提示词',
        'editor.newTitle': '新建提示词',
        'editor.editTitle': '编辑提示词',
        'editor.title': '标题',
        'editor.category': '分类',
        'editor.content': '内容',
        'editor.tags': '标签',
        'editor.save': '保存',
        'editor.cancel': '取消',
        'editor.titleRequired': '请填写标题',
        'editor.contentRequired': '请填写内容',
        'confirm.deleteCategory': '其中的提示词会移到「未分类」。',
        'confirm.deletePrompt': '此操作无法撤销。',
        'confirm.deleteCategoryTitle': '删除分类「{name}」',
        'confirm.deletePromptTitle': '删除提示词「{title}」',
        'cancel': '取消',
        'common.undo': '撤销',
        'common.close': '关闭',
        'loading': '正在读取',
        'retry': '重试',
        'loadFailed': '读取失败：{message}',
        'saveFailed': '保存失败：{message}',
        'conflict.message': '提示词库已在其他窗口更新，你的修改未保存。',
        'notice.saved': '已保存',
        'notice.deletedPrompt': '已删除「{title}」',
        'notice.deletedCategory': '已删除分类「{name}」',
        'notice.copied': '已复制',
        'notice.imported': '导入完成',
        'list.more': '另有 {count} 条未显示',
        'import.title': '导入提示词',
        'import.categories': '分类 {count} 个，新增 {fresh}，已存在 {duplicate}',
        'import.categoriesOne': '分类 {count} 个，新增 {fresh}，已存在 {duplicate}',
        'import.prompts': '提示词 {count} 条，新增 {fresh}，已存在 {duplicate}',
        'import.promptsOne': '提示词 {count} 条，新增 {fresh}，已存在 {duplicate}',
        'import.merge': '合并',
        'import.replace': '替换现有库',
        'import.mergeHint': '保留现有条目，仅添加新条目。',
        'import.replaceHint': '覆盖当前库，不可恢复。',
        'import.action': '导入',
        'import.failed': '导入失败：{message}',
        'export.failed': '导出失败',
        'picker.empty': '还没有提示词',
        'picker.manage': '管理提示词',
        'picker.searchPlaceholder': '搜索提示词',
        'picker.truncated': '显示 {shown} / {total}',
        'picker.total': '共 {count} 条',
        'picker.totalOne': '共 {count} 条',
        'picker.append': '追加',
        'picker.replace': '替换',
        'settings.title': '设置',
        'settings.open': '设置',
        'settings.insertMode': '插入方式',
        'settings.pickerLimit': '显示条数',
        'settings.confirmDelete': '删除前确认',
        'settings.close': '关闭',
        'var.title': '填写变量',
        'var.insert': '插入',
        'var.keepPlaceholder': '留空则保留占位符',
        'duplicateSuffix': '（副本）',
        'library.title': '导入与导出',
        'library.open': '导入导出',
        'library.import': '导入 JSON',
        'library.export': '导出 JSON',
        'library.copy': '复制 JSON',
      },
      en: {
        'nav': 'Prompt hub',
        'composer.label': 'Insert a prompt',
        'panel.title': 'Prompt hub',
        'panel.count': '{count} prompts',
        'panel.countOne': '{count} prompt',
        'search.placeholder': 'Search prompts',
        'cat.label': 'Categories',
        'cat.all': 'All',
        'cat.none': 'Uncategorized',
        'cat.add': 'New category',
        'cat.rename': 'Rename',
        'cat.delete': 'Delete',
        'cat.manage': 'Manage',
        'cat.managerTitle': 'Manage categories',
        'cat.empty': 'No categories yet',
        'cat.namePlaceholder': 'Category name',
        'cat.moveUp': 'Move up',
        'cat.moveDown': 'Move down',
        'tag.label': 'Tag',
        'tag.all': 'All tags',
        'tag.placeholder': 'Add a tag',
        'prompt.add': 'New prompt',
        'prompt.edit': 'Edit',
        'prompt.delete': 'Delete',
        'prompt.duplicate': 'Duplicate',
        'prompt.copy': 'Copy content',
        'prompt.pin': 'Pin',
        'prompt.unpin': 'Unpin',
        'prompt.more': 'More actions',
        'prompt.empty': 'No prompts yet',
        'prompt.noMatch': 'No prompts match',
        'editor.newTitle': 'New prompt',
        'editor.editTitle': 'Edit prompt',
        'editor.title': 'Title',
        'editor.category': 'Category',
        'editor.content': 'Content',
        'editor.tags': 'Tags',
        'editor.save': 'Save',
        'editor.cancel': 'Cancel',
        'editor.titleRequired': 'Title is required',
        'editor.contentRequired': 'Content is required',
        'confirm.deleteCategory': 'Its prompts will move to "Uncategorized".',
        'confirm.deletePrompt': 'This cannot be undone.',
        'confirm.deleteCategoryTitle': 'Delete category "{name}"',
        'confirm.deletePromptTitle': 'Delete prompt "{title}"',
        'cancel': 'Cancel',
        'common.undo': 'Undo',
        'common.close': 'Close',
        'loading': 'Loading',
        'retry': 'Retry',
        'loadFailed': 'Could not read: {message}',
        'saveFailed': 'Could not save: {message}',
        'conflict.message': 'The prompt library changed in another window. Your edit was not saved.',
        'notice.saved': 'Saved',
        'notice.deletedPrompt': 'Deleted "{title}"',
        'notice.deletedCategory': 'Deleted category "{name}"',
        'notice.copied': 'Copied',
        'notice.imported': 'Import complete',
        'list.more': '{count} more not shown',
        'import.title': 'Import prompts',
        'import.categories': '{count} categories, {fresh} new, {duplicate} existing',
        'import.categoriesOne': '{count} category, {fresh} new, {duplicate} existing',
        'import.prompts': '{count} prompts, {fresh} new, {duplicate} existing',
        'import.promptsOne': '{count} prompt, {fresh} new, {duplicate} existing',
        'import.merge': 'Merge',
        'import.replace': 'Replace library',
        'import.mergeHint': 'Keep existing entries and add only new ones.',
        'import.replaceHint': 'Overwrite the library. This cannot be undone.',
        'import.action': 'Import',
        'import.failed': 'Import failed: {message}',
        'export.failed': 'Export failed',
        'picker.empty': 'No prompts yet',
        'picker.manage': 'Manage prompts',
        'picker.searchPlaceholder': 'Search prompts',
        'picker.truncated': 'Showing {shown} / {total}',
        'picker.total': '{count} prompts',
        'picker.totalOne': '{count} prompt',
        'picker.append': 'Append',
        'picker.replace': 'Replace',
        'settings.title': 'Settings',
        'settings.open': 'Settings',
        'settings.insertMode': 'Insert mode',
        'settings.pickerLimit': 'Items shown',
        'settings.confirmDelete': 'Ask before deleting',
        'settings.close': 'Close',
        'var.title': 'Fill in the variables',
        'var.insert': 'Insert',
        'var.keepPlaceholder': 'A blank variable keeps its placeholder',
        'duplicateSuffix': ' (copy)',
        'library.title': 'Import and export',
        'library.open': 'Import/export',
        'library.import': 'Import JSON',
        'library.export': 'Export JSON',
        'library.copy': 'Copy JSON',
      },
    }

    let serviceT = null
    let activeLang = 'en'
    try { activeLang = /^zh/i.test(typeof navigator !== 'undefined' ? (navigator.language || '') : '') ? 'zh' : 'en' } catch { /* keep default */ }
    let clientCtx = null

    function t(key, vars) {
      let text = null
      if (serviceT) {
        try {
          const value = serviceT(key)
          if (typeof value === 'string' && value.length > 0 && value !== key) text = value
        } catch { /* fall through to the built-in dictionary */ }
      }
      if (text === null) {
        const table = LOCALES[activeLang] || LOCALES.en
        text = table[key] || LOCALES.en[key] || key
      }
      if (vars) {
        for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]))
      }
      return text
    }

    function tn(key, count, vars) {
      return t(count === 1 ? key + 'One' : key, { count, ...(vars || {}) })
    }

    // ------------------------------------------------------------- settings ----
    const SETTINGS_DEFAULTS = { insertMode: 'append', pickerLimit: 20, confirmDelete: true }

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY)
        if (!raw) return { ...SETTINGS_DEFAULTS }
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object') return { ...SETTINGS_DEFAULTS }
        const limit = Number(parsed.pickerLimit)
        return {
          insertMode: parsed.insertMode === 'replace' ? 'replace' : 'append',
          pickerLimit: limit === 10 || limit === 20 || limit === 50 ? limit : 20,
          confirmDelete: parsed.confirmDelete !== false,
        }
      } catch { return { ...SETTINGS_DEFAULTS } }
    }

    function saveSettings(settings) {
      try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
    }

    const settingsStore = {
      value: loadSettings(),
      listeners: new Set(),
      emit() { for (const fn of this.listeners) { try { fn() } catch { /* ignore */ } } },
      set(next) { this.value = next; saveSettings(next); this.emit() },
    }

    function useSettings() {
      const [value, setValue] = useState(settingsStore.value)
      useEffect(() => {
        const listener = () => setValue(settingsStore.value)
        settingsStore.listeners.add(listener)
        return () => { settingsStore.listeners.delete(listener) }
      }, [])
      return value
    }

    // ----------------------------------------------------------------- data ----
    const store = {
      data: null,
      rev: 0,
      error: null,
      conflict: false,
      loading: false,
      listeners: new Set(),
      emit() {
        for (const fn of this.listeners) {
          try { fn() } catch { /* a broken listener must not break the others */ }
        }
      },
      set(data, rev, error) {
        this.data = data
        if (rev !== undefined) this.rev = rev
        this.error = error || null
        this.emit()
      },
      dismissConflict() { this.conflict = false; this.emit() },
      async load() {
        if (this.loading) return this.data
        this.loading = true
        this.emit()
        try {
          const response = await fetch(ROUTE, { credentials: 'same-origin' })
          const body = await response.json().catch(() => null)
          if (!response.ok || !body || body.ok !== true || !body.data) {
            throw new Error((body && body.error) || ('HTTP ' + response.status))
          }
          this.conflict = false
          this.set(body.data, body.rev, null)
          return body.data
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.set(this.data, this.rev, message)
          return null
        } finally {
          this.loading = false
          this.emit()
        }
      },
      /** Returns true when the write landed, false when it was rejected. */
      async save(next) {
        const previousData = this.data
        const previousRev = this.rev
        const expectedRev = this.rev
        this.set(next, expectedRev, null)
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ data: next, expectedRev }),
            credentials: 'same-origin',
          })
          const body = await response.json().catch(() => null)
          if (response.status === 409 && body && body.code === 'conflict') {
            // Someone else wrote first: keep their version and tell the user.
            this.conflict = true
            this.set(body.data, body.rev, null)
            return false
          }
          if (!response.ok || !body || body.ok !== true || !body.data) {
            throw new Error((body && body.error) || ('HTTP ' + response.status))
          }
          this.conflict = false
          this.set(body.data, body.rev, null)
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.set(previousData, previousRev, message)
          return false
        }
      },
    }

    function useHubData() {
      const [state, setState] = useState(() => ({
        data: store.data, rev: store.rev, error: store.error,
        conflict: store.conflict, loading: store.loading,
      }))
      useEffect(() => {
        const listener = () => setState({
          data: store.data, rev: store.rev, error: store.error,
          conflict: store.conflict, loading: store.loading,
        })
        store.listeners.add(listener)
        return () => { store.listeners.delete(listener) }
      }, [])
      return state
    }

    function isPlainObject(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    }

    function newId(prefix) {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return prefix + '_' + crypto.randomUUID().slice(0, 8)
        }
      } catch { /* fall through */ }
      return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    }

    /** Names of the `{{...}}` placeholders in a prompt, de-duplicated and ordered. */
    function variablesOf(text) {
      const names = []
      for (const match of String(text).matchAll(VARIABLE_RE)) {
        const name = match[1].trim()
        if (name && !names.includes(name)) names.push(name)
      }
      return names
    }

    function fillVariables(text, values) {
      return String(text).replace(VARIABLE_RE, (whole, name) => {
        const key = name.trim()
        const value = String(values[key] === undefined ? '' : values[key]).trim()
        return value === '' ? whole : value
      })
    }

    function openPanel() {
      try {
        // `layout` is declared in exports.inject, so this is a real service
        // property rather than an optional lookup that 0.2.2 rejects.
        const layout = clientCtx && clientCtx.layout
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_ID)
      } catch (error) {
        console.error('[dsh-prompt-hub] openPanel failed:', error)
      }
    }

    // ------------------------------------------------------- dialog behaviour ----
    /**
     * Escape to close, Tab trapped inside, first control focused on open, and
     * focus returned to whatever opened the dialog.
     */
    function useDialog(open, onClose) {
      const ref = useRef(null)
      const onCloseRef = useRef(onClose)
      onCloseRef.current = onClose
      useEffect(() => {
        if (!open) return undefined
        const node = ref.current
        if (!node) return undefined
        const previouslyFocused = document.activeElement
        const focusable = () => Array.from(node.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ))
        const items = focusable()
        if (items.length > 0) items[0].focus()
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onCloseRef.current()
            return
          }
          if (event.key !== 'Tab') return
          const list = focusable()
          if (list.length === 0) return
          const first = list[0]
          const last = list[list.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        node.addEventListener('keydown', onKeyDown)
        return () => {
          node.removeEventListener('keydown', onKeyDown)
          if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
            try { previouslyFocused.focus() } catch { /* ignore */ }
          }
        }
      }, [open])
      return ref
    }

    // ---------------------------------------------------------------- styles ----
    const CSS = `/* Radix UI Colors — gray, blue, red. Semantic aliases below are the only
   colors components reference; the dark palette is selected by DSH's own
   body[data-ds-dark-theme] attribute. */
.dsh-ph-panel,
.dsh-ph-popover,
.dsh-ph-dialogback,
.dsh-ph-composer {
  --ph-gray-1:#fcfcfc;--ph-gray-2:#f9f9f9;--ph-gray-3:#f0f0f0;--ph-gray-4:#e8e8e8;
  --ph-gray-5:#e0e0e0;--ph-gray-6:#d9d9d9;--ph-gray-7:#cecece;--ph-gray-8:#bbbbbb;
  --ph-gray-9:#8d8d8d;--ph-gray-10:#838383;--ph-gray-11:#646464;--ph-gray-12:#202020;
  --ph-blue-1:#fbfdff;--ph-blue-2:#f4faff;--ph-blue-3:#e6f4fe;--ph-blue-4:#d5efff;
  --ph-blue-5:#c2e5ff;--ph-blue-6:#acd8fc;--ph-blue-7:#8ec8f6;--ph-blue-8:#5eb1ef;
  --ph-blue-9:#0090ff;--ph-blue-10:#0588f0;--ph-blue-11:#0d74ce;--ph-blue-12:#113264;
  --ph-red-1:#fffcfc;--ph-red-2:#fff7f7;--ph-red-3:#feebec;--ph-red-4:#ffdbdc;
  --ph-red-5:#ffcdce;--ph-red-6:#fdbdbe;--ph-red-7:#f4a9aa;--ph-red-8:#eb8e90;
  --ph-red-9:#e5484d;--ph-red-10:#dc3e42;--ph-red-11:#ce2c31;--ph-red-12:#641723;
  --ph-black-a8:rgba(0,0,0,.6);

  --ph-bg:var(--ph-gray-1);
  --ph-surface-soft:var(--ph-gray-2);
  --ph-surface-hover:var(--ph-gray-3);
  --ph-border:var(--ph-gray-6);
  --ph-border-strong:var(--ph-gray-8);
  --ph-text:var(--ph-gray-12);
  --ph-text-secondary:var(--ph-gray-11);
  --ph-primary:var(--ph-gray-12);
  --ph-primary-hover:var(--ph-gray-11);
  --ph-primary-text:var(--ph-gray-1);
  --ph-accent:var(--ph-blue-11);
  --ph-accent-soft:var(--ph-blue-3);
  --ph-accent-border:var(--ph-blue-7);
  --ph-danger:var(--ph-red-11);
  --ph-danger-soft:var(--ph-red-3);
  --ph-danger-border:var(--ph-red-7);
  --ph-focus:var(--ph-blue-11);
  --ph-overlay:var(--ph-black-a8);
  --ph-font-text:var(--dsh-font-family-text, system-ui, -apple-system, "Segoe UI", sans-serif);
  --ph-font-display:"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Songti SC", "Noto Serif CJK SC", serif;
  --ph-font-code:var(--dsh-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  color-scheme:light;
}
body[data-ds-dark-theme] .dsh-ph-panel,
body[data-ds-dark-theme] .dsh-ph-popover,
body[data-ds-dark-theme] .dsh-ph-dialogback,
body[data-ds-dark-theme] .dsh-ph-composer {
  --ph-gray-1:#111111;--ph-gray-2:#191919;--ph-gray-3:#222222;--ph-gray-4:#2a2a2a;
  --ph-gray-5:#313131;--ph-gray-6:#3a3a3a;--ph-gray-7:#484848;--ph-gray-8:#606060;
  --ph-gray-9:#6e6e6e;--ph-gray-10:#7b7b7b;--ph-gray-11:#b4b4b4;--ph-gray-12:#eeeeee;
  --ph-blue-1:#0d1520;--ph-blue-2:#111927;--ph-blue-3:#0d2847;--ph-blue-4:#003362;
  --ph-blue-5:#004074;--ph-blue-6:#104d87;--ph-blue-7:#205d9e;--ph-blue-8:#2870bd;
  --ph-blue-9:#0090ff;--ph-blue-10:#3b9eff;--ph-blue-11:#70b8ff;--ph-blue-12:#c2e6ff;
  --ph-red-1:#191111;--ph-red-2:#201314;--ph-red-3:#3b1219;--ph-red-4:#500f1c;
  --ph-red-5:#611623;--ph-red-6:#72232d;--ph-red-7:#8c333a;--ph-red-8:#b54548;
  --ph-red-9:#e5484d;--ph-red-10:#ec5d5e;--ph-red-11:#ff9592;--ph-red-12:#ffd1d9;
  color-scheme:dark;
}
.dsh-ph-panel,.dsh-ph-panel *,.dsh-ph-popover,.dsh-ph-popover *,
.dsh-ph-dialogback,.dsh-ph-dialogback *{box-sizing:border-box}
.dsh-ph-panel{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;background:var(--ph-bg);color:var(--ph-text);font:13px/1.5 var(--ph-font-text);text-align:left;-webkit-font-smoothing:antialiased;container-type:inline-size;container-name:ph}
.dsh-ph-panel button,.dsh-ph-popover button,.dsh-ph-dialogback button{font:inherit}
.dsh-ph-panel input,.dsh-ph-panel select,.dsh-ph-panel textarea,
.dsh-ph-popover input,.dsh-ph-popover select,.dsh-ph-popover textarea,
.dsh-ph-dialogback input,.dsh-ph-dialogback select,.dsh-ph-dialogback textarea{font:inherit;color:inherit}
.dsh-ph-panel button,.dsh-ph-popover button,.dsh-ph-dialogback button{cursor:pointer}
.dsh-ph-banner{display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:.5px solid var(--ph-border);background:var(--ph-surface-soft);color:var(--ph-text);font-size:12px;flex:none}
.dsh-ph-banner span{flex:1}
.dsh-ph-head{display:flex;flex-direction:column;gap:8px;padding:12px 12px 10px;border-bottom:.5px solid var(--ph-border);flex:none}
.dsh-ph-head-row{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-ph-titleblock{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
.dsh-ph-title{font-family:var(--ph-font-display);font-size:20px;font-weight:400;line-height:1.1;letter-spacing:-.2px;white-space:nowrap}
.dsh-ph-count{font-size:12px;color:var(--ph-text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-ph-spacer{flex:1;min-width:8px}
.dsh-ph-head-row > .dsh-ph-iconbtn{margin-left:auto}
.dsh-ph-search{flex:1 1 auto;min-width:0;width:auto;max-width:none}
.dsh-ph-head-row > .dsh-ph-btn-primary{flex:none}
.dsh-ph-body{display:flex;flex:1;min-height:0}
.dsh-ph-side{width:200px;flex:none;display:flex;flex-direction:column;border-right:.5px solid var(--ph-border);min-height:0;background:var(--ph-bg)}
.dsh-ph-side-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;padding:12px 12px 4px}
.dsh-ph-side-label{font-size:12px;font-weight:600;color:var(--ph-text-secondary)}
.dsh-ph-linkbtn{border:0;background:none;padding:0;font-size:12px;color:var(--ph-text-secondary);cursor:pointer;margin-left:auto}
.dsh-ph-linkbtn:hover{color:var(--ph-text);text-decoration:underline}
.dsh-ph-linkbtn:focus-visible,.dsh-ph-textbtn:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-catlist{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 8px;display:flex;flex-direction:column;gap:2px}
.dsh-ph-cat{display:flex;align-items:center;gap:8px;width:100%;height:32px;padding:0 8px;border:0;background:transparent;color:var(--ph-text-secondary);font-size:13px;text-align:left;cursor:pointer}
.dsh-ph-cat:hover{background:var(--ph-surface-soft);color:var(--ph-text)}
.dsh-ph-cat.is-active{background:var(--ph-surface-hover);color:var(--ph-text);font-weight:600}
.dsh-ph-cat:focus-visible{outline:2px solid var(--ph-focus);outline-offset:-2px}
.dsh-ph-cat-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ph-cat-count{font-size:12px;color:var(--ph-text-secondary);font-variant-numeric:tabular-nums;flex:none}
.dsh-ph-sidefoot{display:flex;flex-direction:column;gap:8px;padding:8px;border-top:.5px solid var(--ph-border);flex:none}
.dsh-ph-sidefoot .dsh-ph-btn{padding:0 8px}
.dsh-ph-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.dsh-ph-filterbar{display:flex;align-items:center;gap:8px;padding:12px 16px 0;flex:none}
.dsh-ph-filter-label{font-size:12px;color:var(--ph-text-secondary);white-space:nowrap}
.dsh-ph-filter-select{width:auto;max-width:200px;min-width:120px;flex:1 1 auto}
.dsh-ph-chip{display:inline-flex;align-items:center;gap:4px;border:0;border-bottom:.5px solid transparent;background:none;padding:4px 0;font-size:12px;color:var(--ph-text-secondary);cursor:pointer;white-space:nowrap}
.dsh-ph-chip:hover{color:var(--ph-text)}
.dsh-ph-chip.is-active{color:var(--ph-text);border-bottom-color:var(--ph-text)}
.dsh-ph-chip:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-list{flex:1;min-height:0;overflow-y:auto;padding:8px 16px 24px}
.dsh-ph-row{position:relative;padding:12px 8px;margin:0 -8px;border-bottom:.5px solid var(--ph-border)}
.dsh-ph-row:hover{background:var(--ph-surface-soft)}
.dsh-ph-row-head{display:flex;align-items:center;gap:8px}
.dsh-ph-pin{color:var(--ph-text-secondary)}
.dsh-ph-pin.is-on{color:var(--ph-accent)}
.dsh-ph-row-title{flex:1;min-width:0;font-size:13px;font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ph-row-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}
.dsh-ph-row-cat{font-size:12px;color:var(--ph-text-secondary)}
.dsh-ph-row-tags{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-ph-tag{font-size:12px;color:var(--ph-text-secondary)}
.dsh-ph-row-meta,.dsh-ph-row-preview,.dsh-ph-row-actions{margin-left:32px}
.dsh-ph-row-preview{margin-top:8px;font-size:12px;line-height:1.5;color:var(--ph-text-secondary);max-width:68ch;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.dsh-ph-row-actions{display:flex;align-items:center;gap:12px;margin-top:8px}
.dsh-ph-textbtn{border:0;background:none;padding:0;font-size:12px;color:var(--ph-accent);cursor:pointer}
.dsh-ph-textbtn:hover{text-decoration:underline}
.dsh-ph-textbtn.is-danger{color:var(--ph-danger)}
.dsh-ph-textbtn:disabled{opacity:.4;cursor:not-allowed;text-decoration:none}
.dsh-ph-row-menu{position:absolute;right:8px;top:36px;z-index:10;min-width:148px;display:flex;flex-direction:column;padding:4px;border:.5px solid var(--ph-border);background:var(--ph-bg)}
.dsh-ph-row-menu.is-up{top:auto;bottom:calc(100% - 8px)}
.dsh-ph-menu-item{border:0;background:none;padding:6px 8px;font-size:12px;color:var(--ph-text);text-align:left;cursor:pointer}
.dsh-ph-menu-item:hover{background:var(--ph-surface-soft)}
.dsh-ph-menu-item.is-danger{color:var(--ph-danger)}
.dsh-ph-menu-item:focus-visible{outline:2px solid var(--ph-focus);outline-offset:-2px}
.dsh-ph-more{padding:12px 0;font-size:12px;color:var(--ph-text-secondary);text-align:left}
.dsh-ph-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:48px 16px;text-align:center}
.dsh-ph-empty-title{font-family:var(--ph-font-display);font-size:20px;font-weight:400;line-height:1.15;letter-spacing:-.2px;color:var(--ph-text);max-width:30ch}
.dsh-ph-empty-message{font-size:13px;color:var(--ph-text-secondary);max-width:46ch}
.dsh-ph-empty-error{font-size:12px;line-height:1.5;color:var(--ph-danger);max-width:60ch}
.dsh-ph-editor{flex:1;min-height:0;overflow-y:auto;padding:16px 16px 24px}
.dsh-ph-editor-head{display:flex;align-items:center;gap:8px;margin-bottom:20px}
.dsh-ph-editor-title{font-family:var(--ph-font-display);font-size:20px;font-weight:400;line-height:1;letter-spacing:-.2px}
.dsh-ph-field{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;max-width:760px}
.dsh-ph-label{font-size:12px;font-weight:400;color:var(--ph-text-secondary)}
.dsh-ph-input,.dsh-ph-textarea,.dsh-ph-select{width:100%;border:.5px solid var(--ph-border);background:var(--ph-bg);color:var(--ph-text);font-size:13px;line-height:1.5;border-radius:0}
.dsh-ph-input::placeholder,.dsh-ph-textarea::placeholder{color:var(--ph-text-secondary);opacity:1}
.dsh-ph-input,.dsh-ph-select{height:28px;min-height:28px;padding:0 8px}
.dsh-ph-input:focus,.dsh-ph-textarea:focus,.dsh-ph-select:focus{outline:none;border-color:var(--ph-accent-border)}
.dsh-ph-input:focus-visible,.dsh-ph-textarea:focus-visible,.dsh-ph-select:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-textarea{min-height:240px;padding:8px;font-family:var(--ph-font-code);font-size:12px;line-height:1.6;resize:vertical}
.dsh-ph-tagsinput{display:flex;flex-wrap:wrap;gap:4px;align-items:center;border:.5px solid var(--ph-border);padding:4px 8px;background:var(--ph-bg);min-height:28px}
.dsh-ph-tagsinput:focus-within{border-color:var(--ph-accent-border)}
.dsh-ph-tagsinput input{flex:1;min-width:120px;border:0;background:transparent;color:var(--ph-text);font-size:13px;padding:2px 0;outline:none}
.dsh-ph-tagchip{display:inline-flex;align-items:center;gap:4px;border:.5px solid var(--ph-border);padding:2px 6px;font-size:12px;color:var(--ph-text-secondary)}
.dsh-ph-tagchip button{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border:0;background:none;color:inherit;padding:0;line-height:1}
.dsh-ph-tagchip button:hover{color:var(--ph-danger)}
.dsh-ph-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:28px;border:.5px solid var(--ph-border);background:transparent;color:var(--ph-text);padding:0 12px;font-size:13px;line-height:1;cursor:pointer;white-space:nowrap;border-radius:0}
.dsh-ph-btn:hover:not(:disabled){background:var(--ph-surface-soft);border-color:var(--ph-border-strong)}
.dsh-ph-btn:disabled{opacity:.45;cursor:not-allowed}
.dsh-ph-btn:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-btn-primary{background:var(--ph-primary);border-color:var(--ph-primary);color:var(--ph-primary-text)}
.dsh-ph-btn-primary:hover:not(:disabled){background:var(--ph-primary-hover);border-color:var(--ph-primary-hover)}
.dsh-ph-btn-danger{color:var(--ph-danger);border-color:var(--ph-danger-border);background:transparent}
.dsh-ph-btn-danger:hover:not(:disabled){background:var(--ph-danger-soft);border-color:var(--ph-danger-border)}
.dsh-ph-btn-sm{height:24px;padding:0 8px;font-size:12px}
.dsh-ph-btn-block{width:100%}
.dsh-ph-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:0;background:transparent;color:var(--ph-text-secondary);padding:0;cursor:pointer;border-radius:0;flex:none}
.dsh-ph-iconbtn:hover{background:var(--ph-surface-soft);color:var(--ph-text)}
.dsh-ph-iconbtn:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-iconbtn-sm{width:24px;height:24px}
.dsh-ph-notice{position:absolute;right:16px;bottom:16px;z-index:2147483000;display:flex;align-items:center;gap:12px;padding:8px 12px;border:.5px solid var(--ph-border);background:var(--ph-bg);color:var(--ph-text);font-size:12px}
.dsh-ph-dialogback{position:fixed;inset:0;z-index:2147483000;background:var(--ph-overlay);display:flex;align-items:center;justify-content:center;padding:16px}
.dsh-ph-dialog{width:min(480px,calc(100vw - 32px));max-height:86vh;overflow-y:auto;border:.5px solid var(--ph-border);background:var(--ph-bg);padding:20px;color:var(--ph-text);border-radius:0}
.dsh-ph-dialog-wide{width:min(560px,calc(100vw - 32px))}
.dsh-ph-dialog-title{font-family:var(--ph-font-display);font-size:20px;font-weight:400;line-height:1.1;letter-spacing:-.2px;margin-bottom:16px}
.dsh-ph-dialog-text{font-size:13px;line-height:1.5;color:var(--ph-text-secondary);margin:0 0 16px}
.dsh-ph-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
.dsh-ph-dialog-list{margin:0 0 16px;padding:0;list-style:none;font-size:13px;display:flex;flex-direction:column;gap:8px}
.dsh-ph-radio{display:flex;align-items:flex-start;gap:8px;padding:8px;border:.5px solid var(--ph-border);margin-bottom:8px;cursor:pointer}
.dsh-ph-radio:hover{background:var(--ph-surface-soft)}
.dsh-ph-radio input{margin:2px 0 0;accent-color:var(--ph-accent)}
.dsh-ph-radio-title{display:block;font-size:13px;font-weight:600}
.dsh-ph-radio-hint{display:block;font-size:12px;line-height:1.45;color:var(--ph-text-secondary);margin-top:2px}
.dsh-ph-setting{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.dsh-ph-setting label{flex:1;font-size:13px}
.dsh-ph-setting select{width:auto;min-width:120px;flex:none}
.dsh-ph-check{display:flex;align-items:center;gap:8px;font-size:13px}
.dsh-ph-check input{accent-color:var(--ph-accent)}
.dsh-ph-library-actions{display:flex;flex-direction:column;gap:8px}
.dsh-ph-library-actions .dsh-ph-btn{justify-content:flex-start}
.dsh-ph-manager-list{display:flex;flex-direction:column;border-top:.5px solid var(--ph-border)}
.dsh-ph-manager-empty{padding:16px 0;font-size:12px;color:var(--ph-text-secondary)}
.dsh-ph-manager-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:.5px solid var(--ph-border)}
.dsh-ph-manager-name{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ph-manager-count{font-size:12px;color:var(--ph-text-secondary);font-variant-numeric:tabular-nums}
.dsh-ph-manager-actions{display:flex;align-items:center;gap:4px;flex:none}
.dsh-ph-manager-actions .dsh-ph-manager-textbtn{height:24px;padding:0 4px;white-space:nowrap;color:var(--ph-text)}
.dsh-ph-manager-actions .dsh-ph-manager-textbtn.is-danger{color:var(--ph-danger)}
.dsh-ph-manager-textbtn:disabled{opacity:.4;cursor:not-allowed;text-decoration:none}
.dsh-ph-composer{position:relative;display:inline-flex;flex:none}
.dsh-ph-composer-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;background:transparent;color:var(--ph-text-secondary);cursor:pointer;border-radius:0}
.dsh-ph-composer-btn:hover{background:var(--ph-surface-soft);color:var(--ph-text)}
.dsh-ph-composer-btn:focus-visible{outline:2px solid var(--ph-focus);outline-offset:2px}
.dsh-ph-popover{position:fixed;z-index:2147483000;width:min(360px,calc(100vw - 16px));max-height:440px;display:flex;flex-direction:column;border:.5px solid var(--ph-border);background:var(--ph-bg);color:var(--ph-text);overflow:hidden;border-radius:0}
.dsh-ph-popover-head{display:flex;gap:8px;padding:8px;border-bottom:.5px solid var(--ph-border);flex:none}
.dsh-ph-popover-search{flex:1;min-width:0}
.dsh-ph-popover-cats{display:flex;gap:8px;padding:8px 8px 0;overflow-x:auto;flex:none;flex-wrap:wrap}
.dsh-ph-popover-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:8px;border-top:.5px solid var(--ph-border);flex:none;font-size:12px;color:var(--ph-text-secondary)}
.dsh-ph-popover-list{flex:1;min-height:0;overflow-y:auto;padding:8px}
.dsh-ph-popover .dsh-ph-empty{padding:24px 8px;font-size:12px}
.dsh-ph-pick{display:flex;flex-direction:column;gap:4px;width:100%;padding:8px;border:0;background:transparent;color:var(--ph-text);cursor:pointer;text-align:left}
.dsh-ph-pick:hover{background:var(--ph-surface-soft)}
.dsh-ph-pick:focus-visible{outline:2px solid var(--ph-focus);outline-offset:-2px}
.dsh-ph-pick-title{display:flex;align-items:center;gap:4px;font-size:13px;font-weight:600}
.dsh-ph-pick-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-ph-pick-pin{display:inline-flex;color:var(--ph-accent);flex:none}
.dsh-ph-pick-preview{font-size:12px;color:var(--ph-text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:720px){
  .dsh-ph-manager-row{flex-wrap:wrap}
}
@container ph (max-width:720px){
  .dsh-ph-side{width:150px}
  .dsh-ph-row-preview{max-width:none}
}
@container ph (max-width:520px){
  .dsh-ph-side{width:136px}
  .dsh-ph-filter-select{min-width:0;max-width:none}
}
@container ph (max-width:420px){
  .dsh-ph-side{width:120px}
}
@container ph (max-width:400px){
  .dsh-ph-editor-head{flex-wrap:wrap;row-gap:12px}
  .dsh-ph-editor-head .dsh-ph-spacer{display:none}
  .dsh-ph-editor-title{flex:1 1 100%;white-space:nowrap}
  .dsh-ph-editor-head > .dsh-ph-btn:first-of-type{margin-left:auto}
}
`

    // ---------------------------------------------------------------- icons ----
    function HubIcon(props) {
      const size = (props && props.size) || 18
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      },
        h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
        h('path', { d: 'M8.5 9h7M8.5 12.5h4' }),
      )
    }

    function IconPencil(props) {
      const size = (props && props.size) || 13
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M12 20h9' }),
        h('path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }),
      )
    }

    function IconTrash(props) {
      const size = (props && props.size) || 13
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
      )
    }

    function IconPin(props) {
      const size = (props && props.size) || 14
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M9 3h6l-1.5 6 2.5 2.5V13H8v-1.5L10.5 9 9 3z' }),
        h('path', { d: 'M12 13v8' }),
      )
    }

    function IconMore(props) {
      const size = (props && props.size) || 16
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', 'aria-hidden': true },
        h('circle', { cx: 5, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 12, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }),
        h('circle', { cx: 19, cy: 12, r: 1.4, fill: 'currentColor', stroke: 'none' }),
      )
    }

    function IconSettings(props) {
      const size = (props && props.size) || 16
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 8h16M4 16h16' }),
        h('circle', { cx: 9, cy: 8, r: 2 }),
        h('circle', { cx: 15, cy: 16, r: 2 }),
      )
    }

    function IconX(props) {
      const size = (props && props.size) || 12
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': true },
        h('path', { d: 'M5 5l14 14M19 5L5 19' }),
      )
    }

    // ------------------------------------------------------------- helpers ----
    function promptTags(prompt) {
      return Array.isArray(prompt.tags) ? prompt.tags : []
    }

    function sortedPrompts(prompts) {
      return prompts.slice().sort((a, b) => {
        const ap = a.pinned ? 1 : 0
        const bp = b.pinned ? 1 : 0
        if (ap !== bp) return bp - ap
        return (b.updatedAt || 0) - (a.updatedAt || 0)
      })
    }

    // ------------------------------------------------------------- panel ------
    function PromptHubPanel() {
      const { data, error, loading, conflict } = useHubData()
      const settings = useSettings()
      const [search, setSearch] = useState('')
      const [debouncedSearch, setDebouncedSearch] = useState('')
      const [activeCat, setActiveCat] = useState('__all__')
      const [activeTag, setActiveTag] = useState('')
      const [view, setView] = useState('list')
      const [draft, setDraft] = useState(null)
      const [catDraft, setCatDraft] = useState(null)
      const [confirm, setConfirm] = useState(null)
      const [importDraft, setImportDraft] = useState(null)
      const [settingsOpen, setSettingsOpen] = useState(false)
      const [notice, setNotice] = useState(null)
      const [menuFor, setMenuFor] = useState(null)
      const [menuUp, setMenuUp] = useState(false)
      const [catManagerOpen, setCatManagerOpen] = useState(false)
      const [libraryOpen, setLibraryOpen] = useState(false)
      const fileRef = useRef(null)
      const categoryDialogRef = useDialog(Boolean(catDraft), () => setCatDraft(null))
      const confirmDialogRef = useDialog(Boolean(confirm), () => setConfirm(null))
      const importDialogRef = useDialog(Boolean(importDraft), () => setImportDraft(null))
      const settingsDialogRef = useDialog(settingsOpen, () => setSettingsOpen(false))
      const catManagerDialogRef = useDialog(catManagerOpen, () => setCatManagerOpen(false))
      const libraryDialogRef = useDialog(libraryOpen, () => setLibraryOpen(false))

      useEffect(() => {
        if (!menuFor) return undefined
        const onDown = (event) => {
          const target = event.target
          if (target instanceof Element && (target.closest('.dsh-ph-row-menu') || target.closest('.dsh-ph-row-more'))) return
          setMenuFor(null)
        }
        window.addEventListener('mousedown', onDown)
        return () => window.removeEventListener('mousedown', onDown)
      }, [menuFor])

      useEffect(() => { void store.load() }, [])

      // Typing filters on a short debounce so a large library stays responsive.
      useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS)
        return () => { window.clearTimeout(timer) }
      }, [search])

      const categories = useMemo(() => (data && Array.isArray(data.categories)) ? data.categories : [], [data])
      const prompts = useMemo(() => (data && Array.isArray(data.prompts)) ? data.prompts : [], [data])

      const counts = useMemo(() => {
        const map = new Map()
        for (const prompt of prompts) {
          const key = prompt.categoryId || ''
          map.set(key, (map.get(key) || 0) + 1)
        }
        return map
      }, [prompts])

      const scopedPrompts = useMemo(() => {
        if (activeCat === '__none__') return prompts.filter((prompt) => !prompt.categoryId)
        if (activeCat === '__all__') return prompts
        return prompts.filter((prompt) => prompt.categoryId === activeCat)
      }, [prompts, activeCat])

      const tagCounts = useMemo(() => {
        const map = new Map()
        for (const prompt of scopedPrompts) {
          for (const tag of promptTags(prompt)) map.set(tag, (map.get(tag) || 0) + 1)
        }
        return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      }, [scopedPrompts])

      useEffect(() => {
        if (activeTag && !tagCounts.some(([tag]) => tag === activeTag)) setActiveTag('')
      }, [tagCounts, activeTag])

      const query = debouncedSearch.trim().toLowerCase()
      const filtered = useMemo(() => {
        return sortedPrompts(scopedPrompts).filter((prompt) => {
          if (activeTag && !promptTags(prompt).includes(activeTag)) return false
          if (!query) return true
          const haystack = (prompt.title + '\n' + promptTags(prompt).join(' ') + '\n' + prompt.content).toLowerCase()
          return haystack.includes(query)
        })
      }, [scopedPrompts, activeTag, query])

      const shown = filtered.slice(0, LIST_RENDER_LIMIT)

      const flash = useCallback((text, action) => {
        setNotice({ text, action: action || null })
        window.setTimeout(() => {
          setNotice((current) => (current && current.text === text ? null : current))
        }, UNDO_MS)
      }, [])

      const commit = useCallback(async (next) => {
        const ok = await store.save(next)
        if (ok) flash(t('notice.saved'))
        else if (!store.conflict) flash(t('saveFailed', { message: store.error || '' }))
        return ok
      }, [flash])

      function categoryName(id) {
        const found = categories.find((category) => category.id === id)
        return found ? found.name : t('cat.none')
      }

      // ---- category operations ----
      function saveCategory() {
        if (!catDraft) return
        const name = catDraft.name.trim()
        if (!name || !data) { setCatDraft(null); return }
        const next = catDraft.id
          ? { ...data, categories: data.categories.map((category) => category.id === catDraft.id ? { ...category, name } : category) }
          : { ...data, categories: [...data.categories, { id: newId('c'), name, order: data.categories.length }] }
        setCatDraft(null)
        void commit(next)
      }

      function moveCategory(id, direction) {
        if (!data) return
        const ordered = categories.slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))
        const index = ordered.findIndex((category) => category.id === id)
        const target = direction === 'up' ? index - 1 : index + 1
        if (index < 0 || target < 0 || target >= ordered.length) return
        const [moved] = ordered.splice(index, 1)
        ordered.splice(target, 0, moved)
        void commit({ ...data, categories: ordered.map((category, position) => ({ ...category, order: position })) })
      }

      function askDeleteCategory(category) {
        if (!settings.confirmDelete) { performDeleteCategory(category); return }
        setConfirm({ kind: 'category', id: category.id, name: category.name })
      }

      function performDeleteCategory(category) {
        if (!data) return
        const affected = data.prompts.filter((prompt) => prompt.categoryId === category.id)
        const next = {
          ...data,
          categories: data.categories.filter((entry) => entry.id !== category.id),
          prompts: data.prompts.map((prompt) => prompt.categoryId === category.id ? { ...prompt, categoryId: '' } : prompt),
        }
        if (activeCat === category.id) setActiveCat('__all__')
        setConfirm(null)
        void commit(next)
        flash(t('notice.deletedCategory', { name: category.name }), {
          label: t('common.undo'),
          run: () => {
            const current = store.data
            if (!current) return
            const catExists = current.categories.some((entry) => entry.id === category.id)
            const restoredCategories = catExists ? current.categories : [...current.categories, category]
            const restoredPrompts = current.prompts.map((prompt) => (
              affected.some((entry) => entry.id === prompt.id) ? { ...prompt, categoryId: category.id } : prompt
            ))
            void commit({ ...current, categories: restoredCategories, prompts: restoredPrompts })
          },
        })
      }

      // ---- prompt operations ----
      function addPrompt() {
        const categoryId = (activeCat && activeCat !== '__all__' && activeCat !== '__none__')
          ? activeCat
          : (categories[0] ? categories[0].id : '')
        setDraft({ id: null, title: '', categoryId, content: '', tags: [], tagInput: '' })
        setView('editor')
      }

      function editPrompt(prompt) {
        setDraft({
          id: prompt.id, title: prompt.title, categoryId: prompt.categoryId,
          content: prompt.content, tags: promptTags(prompt).slice(), tagInput: '',
        })
        setView('editor')
      }

      function addTagToDraft(raw) {
        const tag = String(raw || '').trim()
        if (!tag || !draft) return
        if (promptTags(draft).some((entry) => entry.toLowerCase() === tag.toLowerCase())) {
          setDraft({ ...draft, tagInput: '' })
          return
        }
        if (promptTags(draft).length >= 20) return
        setDraft({ ...draft, tags: [...promptTags(draft), tag], tagInput: '' })
      }

      function savePrompt() {
        if (!draft || !data) return
        const title = draft.title.trim()
        const content = draft.content
        if (!title) { flash(t('editor.titleRequired')); return }
        if (!content.trim()) { flash(t('editor.contentRequired')); return }
        const now = Date.now()
        let next
        if (draft.id) {
          next = {
            ...data,
            prompts: data.prompts.map((prompt) => prompt.id === draft.id
              ? { ...prompt, title, content, categoryId: draft.categoryId, tags: draft.tags || [], updatedAt: now }
              : prompt),
          }
        } else {
          const created = {
            id: newId('p'),
            categoryId: draft.categoryId,
            title,
            content,
            tags: draft.tags || [],
            pinned: false,
            createdAt: now,
            updatedAt: now,
          }
          next = { ...data, prompts: [created, ...data.prompts] }
        }
        setView('list')
        setDraft(null)
        void commit(next)
      }

      function togglePin(prompt) {
        if (!data) return
        void commit({
          ...data,
          prompts: data.prompts.map((entry) => entry.id === prompt.id ? { ...entry, pinned: !entry.pinned } : entry),
        })
      }

      function askDeletePrompt(prompt) {
        if (!settings.confirmDelete) { performDeletePrompt(prompt); return }
        setConfirm({ kind: 'prompt', id: prompt.id, name: prompt.title })
      }

      function performDeletePrompt(prompt) {
        if (!data) return
        const next = { ...data, prompts: data.prompts.filter((entry) => entry.id !== prompt.id) }
        setConfirm(null)
        void commit(next)
        flash(t('notice.deletedPrompt', { title: prompt.title }), {
          label: t('common.undo'),
          run: () => {
            const current = store.data
            if (!current) return
            if (current.prompts.some((entry) => entry.id === prompt.id)) return
            void commit({ ...current, prompts: [...current.prompts, prompt] })
          },
        })
      }

      function duplicatePrompt(prompt) {
        if (!data) return
        const now = Date.now()
        const copy = {
          id: newId('p'),
          categoryId: prompt.categoryId,
          title: prompt.title + t('duplicateSuffix'),
          content: prompt.content,
          tags: promptTags(prompt).slice(),
          pinned: false,
          createdAt: now,
          updatedAt: now,
        }
        void commit({ ...data, prompts: [copy, ...data.prompts] })
      }

      function copyPrompt(prompt) {
        if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return
        navigator.clipboard.writeText(prompt.content).then(() => flash(t('notice.copied')), () => { /* ignore */ })
      }

      // ---- import / export ----
      function exportJson() {
        if (!data) return
        try {
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = 'prompt-hub.json'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          URL.revokeObjectURL(url)
        } catch (error) {
          console.error('[dsh-prompt-hub] export failed:', error)
          flash(t('export.failed'))
        }
      }

      function copyJson() {
        if (!data) return
        if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return
        navigator.clipboard.writeText(JSON.stringify(data, null, 2)).then(() => flash(t('notice.copied')), () => { /* ignore */ })
      }

      function summarizeImport(raw) {
        if (!isPlainObject(raw)) throw new Error('the file is not a JSON object')
        const incomingCategories = Array.isArray(raw.categories) ? raw.categories.filter(isPlainObject) : []
        const incomingPrompts = Array.isArray(raw.prompts) ? raw.prompts.filter(isPlainObject) : []
        const categoryIds = new Set(incomingCategories.map((entry) => entry.id).filter((id) => typeof id === 'string' && id))
        const promptIds = new Set(incomingPrompts.map((entry) => entry.id).filter((id) => typeof id === 'string' && id))
        const localCategories = new Set((data?.categories || []).map((entry) => entry.id))
        const localPrompts = new Set((data?.prompts || []).map((entry) => entry.id))
        return {
          categories: incomingCategories.length,
          prompts: incomingPrompts.length,
          freshCategories: [...categoryIds].filter((id) => !localCategories.has(id)).length,
          duplicateCategories: [...categoryIds].filter((id) => localCategories.has(id)).length,
          freshPrompts: [...promptIds].filter((id) => !localPrompts.has(id)).length,
          duplicatePrompts: [...promptIds].filter((id) => localPrompts.has(id)).length,
        }
      }

      function chooseImportFile(file) {
        const reader = new FileReader()
        reader.onload = () => {
          void (async () => {
            try {
              const parsed = JSON.parse(String(reader.result))
              const summary = summarizeImport(parsed)
              setImportDraft({ raw: parsed, summary })
            } catch (importError) {
              flash(t('import.failed', { message: importError instanceof Error ? importError.message : String(importError) }))
            }
          })()
        }
        reader.readAsText(file)
      }

      function applyImport(mode) {
        if (!importDraft || !data) { setImportDraft(null); return }
        const raw = importDraft.raw
        let next
        if (mode === 'replace') {
          next = { ...raw, rev: store.rev }
        } else {
          const incomingCategories = Array.isArray(raw.categories) ? raw.categories.filter(isPlainObject) : []
          const incomingPrompts = Array.isArray(raw.prompts) ? raw.prompts.filter(isPlainObject) : []
          const categoryIds = new Set(data.categories.map((entry) => entry.id))
          const promptIds = new Set(data.prompts.map((entry) => entry.id))
          const mergedCategories = data.categories.slice()
          for (const entry of incomingCategories) {
            if (typeof entry.id !== 'string' || !entry.id || categoryIds.has(entry.id)) continue
            categoryIds.add(entry.id)
            mergedCategories.push({ id: entry.id, name: String(entry.name || entry.id).slice(0, 200), order: mergedCategories.length })
          }
          const mergedPrompts = data.prompts.slice()
          for (const entry of incomingPrompts) {
            if (typeof entry.id !== 'string' || !entry.id || promptIds.has(entry.id)) continue
            promptIds.add(entry.id)
            mergedPrompts.push({
              ...entry,
              categoryId: typeof entry.categoryId === 'string' ? entry.categoryId : '',
            })
          }
          next = { ...data, categories: mergedCategories, prompts: mergedPrompts }
        }
        setImportDraft(null)
        void commit(next).then((ok) => { if (ok) flash(t('notice.imported')) })
      }

      // ---- editor body ----
      const editor = view === 'editor' && draft
        ? h('div', { className: 'dsh-ph-editor' },
            h('div', { className: 'dsh-ph-editor-head' },
              h('span', { className: 'dsh-ph-editor-title' }, draft.id ? t('editor.editTitle') : t('editor.newTitle')),
              h('span', { className: 'dsh-ph-spacer' }),
              h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => { setView('list'); setDraft(null) } }, t('editor.cancel')),
              h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary', onClick: savePrompt }, t('editor.save')),
            ),
            h('div', { className: 'dsh-ph-field' },
              h('label', { className: 'dsh-ph-label' }, t('editor.title')),
              h('input', {
                className: 'dsh-ph-input', type: 'text', value: draft.title, maxLength: 200,
                onChange: (event) => setDraft({ ...draft, title: event.target.value }),
              }),
            ),
            h('div', { className: 'dsh-ph-field' },
              h('label', { className: 'dsh-ph-label' }, t('editor.category')),
              h('select', {
                className: 'dsh-ph-select', value: draft.categoryId,
                onChange: (event) => setDraft({ ...draft, categoryId: event.target.value }),
              },
                h('option', { value: '' }, t('cat.none')),
                categories.map((category) => h('option', { key: category.id, value: category.id }, category.name)),
              ),
            ),
            h('div', { className: 'dsh-ph-field' },
              h('label', { className: 'dsh-ph-label' }, t('editor.tags')),
              h('div', { className: 'dsh-ph-tagsinput' },
                promptTags(draft).map((tag) => h('span', { key: tag, className: 'dsh-ph-tagchip' },
                  tag,
                  h('button', {
                    type: 'button', title: t('prompt.delete'), 'aria-label': t('prompt.delete'),
                    onClick: () => setDraft({ ...draft, tags: promptTags(draft).filter((entry) => entry !== tag) }),
                  }, h(IconX, { size: 12 })),
                )),
                h('input', {
                  type: 'text', value: draft.tagInput || '', placeholder: t('tag.placeholder'), maxLength: 40,
                  onChange: (event) => setDraft({ ...draft, tagInput: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ',') {
                      event.preventDefault()
                      addTagToDraft(draft.tagInput)
                    } else if (event.key === 'Backspace' && !draft.tagInput && promptTags(draft).length > 0) {
                      setDraft({ ...draft, tags: promptTags(draft).slice(0, -1) })
                    }
                  },
                  onBlur: () => addTagToDraft(draft.tagInput),
                }),
              ),
            ),
            h('div', { className: 'dsh-ph-field' },
              h('label', { className: 'dsh-ph-label' }, t('editor.content')),
              h('textarea', {
                className: 'dsh-ph-textarea', value: draft.content,
                onChange: (event) => setDraft({ ...draft, content: event.target.value }),
              }),
            ),
          )
        : null

      const list = view === 'list'
        ? h('div', { className: 'dsh-ph-main' },
            prompts.length > 0 && tagCounts.length > 0
              ? h('div', { className: 'dsh-ph-filterbar' },
                  h('label', { className: 'dsh-ph-filter-label', htmlFor: 'dsh-ph-tag-filter' }, t('tag.label')),
                  h('select', {
                    id: 'dsh-ph-tag-filter', className: 'dsh-ph-select dsh-ph-filter-select',
                    value: activeTag,
                    onChange: (event) => setActiveTag(event.target.value),
                  },
                    h('option', { value: '' }, t('tag.all')),
                    tagCounts.map(([tag, count]) => h('option', { key: tag, value: tag }, tag + ' (' + count + ')')),
                  ),
                )
              : null,
            h('div', { className: 'dsh-ph-list' },
              shown.length === 0
                ? h('div', { className: 'dsh-ph-empty' },
                    h('div', {
                      className: (prompts.length === 0 && !loading) ? 'dsh-ph-empty-title' : 'dsh-ph-empty-message',
                    },
                      loading ? t('loading') : (prompts.length === 0 ? t('prompt.empty') : t('prompt.noMatch')),
                    ),
                    error && !loading
                      ? h('div', { className: 'dsh-ph-empty-error' }, t('loadFailed', { message: error }))
                      : null,
                    error && !loading
                      ? h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => { void store.load() } }, t('retry'))
                      : null,
                  )
                : h(React.Fragment, null,
                    shown.map((prompt) => h('div', {
                        key: prompt.id,
                        className: 'dsh-ph-row' + (prompt.pinned ? ' is-pinned' : ''),
                      },
                      h('div', { className: 'dsh-ph-row-head' },
                        h('button', {
                          type: 'button',
                          className: 'dsh-ph-iconbtn dsh-ph-iconbtn-sm dsh-ph-pin' + (prompt.pinned ? ' is-on' : ''),
                          title: prompt.pinned ? t('prompt.unpin') : t('prompt.pin'),
                          'aria-label': prompt.pinned ? t('prompt.unpin') : t('prompt.pin'),
                          'aria-pressed': prompt.pinned ? 'true' : 'false',
                          onClick: () => togglePin(prompt),
                        }, h(IconPin, { size: 14 })),
                        h('span', { className: 'dsh-ph-row-title', title: prompt.title }, prompt.title),
                        h('button', {
                          type: 'button',
                          className: 'dsh-ph-iconbtn dsh-ph-iconbtn-sm dsh-ph-row-more',
                          title: t('prompt.more'),
                          'aria-label': t('prompt.more'),
                          'aria-haspopup': 'menu',
                          'aria-expanded': menuFor === prompt.id ? 'true' : 'false',
                          onClick: (event) => {
                            if (menuFor === prompt.id) { setMenuFor(null); return }
                            const list = event.currentTarget.closest('.dsh-ph-list')
                            const row = event.currentTarget.closest('.dsh-ph-row')
                            const listRect = list && list.getBoundingClientRect()
                            const rowRect = row && row.getBoundingClientRect()
                            setMenuUp(Boolean(listRect && rowRect && listRect.bottom - rowRect.bottom < 150))
                            setMenuFor(prompt.id)
                          },
                        }, h(IconMore, { size: 16 })),
                      ),
                      h('div', { className: 'dsh-ph-row-meta' },
                        h('span', { className: 'dsh-ph-row-cat' }, categoryName(prompt.categoryId)),
                        promptTags(prompt).length > 0
                          ? h('span', { className: 'dsh-ph-row-tags' },
                              promptTags(prompt).map((tag) => h('span', { key: tag, className: 'dsh-ph-tag' }, `#${tag}`)))
                          : null,
                      ),
                      h('div', { className: 'dsh-ph-row-preview' }, prompt.content),
                      h('div', { className: 'dsh-ph-row-actions' },
                        h('button', { type: 'button', className: 'dsh-ph-textbtn', onClick: () => editPrompt(prompt) }, t('prompt.edit')),
                      ),
                      menuFor === prompt.id
                        ? h('div', { className: 'dsh-ph-row-menu' + (menuUp ? ' is-up' : ''), role: 'menu', onClick: (event) => event.stopPropagation() },
                            h('button', {
                              type: 'button', role: 'menuitem', className: 'dsh-ph-menu-item',
                              onClick: () => { setMenuFor(null); duplicatePrompt(prompt) },
                            }, t('prompt.duplicate')),
                            h('button', {
                              type: 'button', role: 'menuitem', className: 'dsh-ph-menu-item',
                              onClick: () => { setMenuFor(null); copyPrompt(prompt) },
                            }, t('prompt.copy')),
                            h('button', {
                              type: 'button', role: 'menuitem', className: 'dsh-ph-menu-item is-danger',
                              onClick: () => { setMenuFor(null); askDeletePrompt(prompt) },
                            }, t('prompt.delete')),
                          )
                        : null,
                    )),
                    filtered.length > shown.length
                      ? h('div', { className: 'dsh-ph-more' }, t('list.more', { count: filtered.length - shown.length }))
                      : null,
                  )),
            )
        : null

      const settingsDialog = settingsOpen
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setSettingsOpen(false) },
            h('div', { className: 'dsh-ph-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('settings.title'), ref: settingsDialogRef, onClick: (event) => event.stopPropagation() },
              h('div', { className: 'dsh-ph-dialog-title' }, t('settings.title')),
              h('div', { className: 'dsh-ph-setting' },
                h('label', { htmlFor: 'dsh-ph-insert-mode' }, t('settings.insertMode')),
                h('select', {
                  id: 'dsh-ph-insert-mode', className: 'dsh-ph-select',
                  value: settings.insertMode,
                  onChange: (event) => settingsStore.set({ ...settings, insertMode: event.target.value }),
                },
                  h('option', { value: 'append' }, t('picker.append')),
                  h('option', { value: 'replace' }, t('picker.replace')),
                ),
              ),
              h('div', { className: 'dsh-ph-setting' },
                h('label', { htmlFor: 'dsh-ph-picker-limit' }, t('settings.pickerLimit')),
                h('select', {
                  id: 'dsh-ph-picker-limit', className: 'dsh-ph-select',
                  value: String(settings.pickerLimit),
                  onChange: (event) => settingsStore.set({ ...settings, pickerLimit: Number(event.target.value) }),
                },
                  h('option', { value: '10' }, '10'),
                  h('option', { value: '20' }, '20'),
                  h('option', { value: '50' }, '50'),
                ),
              ),
              h('div', { className: 'dsh-ph-setting' },
                h('label', { className: 'dsh-ph-check', htmlFor: 'dsh-ph-confirm-delete' },
                  h('input', {
                    id: 'dsh-ph-confirm-delete', type: 'checkbox', checked: settings.confirmDelete,
                    onChange: (event) => settingsStore.set({ ...settings, confirmDelete: event.target.checked }),
                  }),
                  t('settings.confirmDelete'),
                ),
              ),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setSettingsOpen(false) }, t('settings.close')),
              ),
            ),
          )
        : null

      const importDialog = importDraft
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setImportDraft(null) },
            h('div', { className: 'dsh-ph-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('import.title'), ref: importDialogRef, onClick: (event) => event.stopPropagation() },
              h('div', { className: 'dsh-ph-dialog-title' }, t('import.title')),
              h('ul', { className: 'dsh-ph-dialog-list' },
                h('li', null, tn('import.categories', importDraft.summary.categories, {
                  fresh: importDraft.summary.freshCategories,
                  duplicate: importDraft.summary.duplicateCategories,
                })),
                h('li', null, tn('import.prompts', importDraft.summary.prompts, {
                  fresh: importDraft.summary.freshPrompts,
                  duplicate: importDraft.summary.duplicatePrompts,
                })),
              ),
              h('div', { className: 'dsh-ph-field' },
                h('label', { className: 'dsh-ph-radio' },
                  h('input', { type: 'radio', name: 'dsh-ph-import-mode', value: 'merge', defaultChecked: true }),
                  h('span', null,
                    h('span', { className: 'dsh-ph-radio-title' }, t('import.merge')),
                    h('span', { className: 'dsh-ph-radio-hint' }, t('import.mergeHint')),
                  ),
                ),
                h('label', { className: 'dsh-ph-radio' },
                  h('input', { type: 'radio', name: 'dsh-ph-import-mode', value: 'replace' }),
                  h('span', null,
                    h('span', { className: 'dsh-ph-radio-title' }, t('import.replace')),
                    h('span', { className: 'dsh-ph-radio-hint' }, t('import.replaceHint')),
                  ),
                ),
              ),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setImportDraft(null) }, t('cancel')),
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary',
                  onClick: () => {
                    const chosen = document.querySelector('input[name="dsh-ph-import-mode"]:checked')
                    applyImport(chosen && chosen.value === 'replace' ? 'replace' : 'merge')
                  },
                }, t('import.action')),
              ),
            ),
          )
        : null

      const confirmDialog = confirm
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setConfirm(null) },
            h('div', {
              className: 'dsh-ph-dialog', role: 'alertdialog', 'aria-modal': 'true', ref: confirmDialogRef,
              'aria-label': confirm.kind === 'category'
                ? t('confirm.deleteCategoryTitle', { name: confirm.name })
                : t('confirm.deletePromptTitle', { title: confirm.name }),
              onClick: (event) => event.stopPropagation(),
            },
              h('div', { className: 'dsh-ph-dialog-title' },
                confirm.kind === 'category'
                  ? t('confirm.deleteCategoryTitle', { name: confirm.name })
                  : t('confirm.deletePromptTitle', { title: confirm.name })),
              h('div', { className: 'dsh-ph-dialog-text' },
                confirm.kind === 'category'
                  ? t('confirm.deleteCategory', { name: confirm.name })
                  : t('confirm.deletePrompt', { title: confirm.name })),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setConfirm(null) }, t('cancel')),
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-danger',
                  onClick: () => {
                    if (confirm.kind === 'category') {
                      const category = categories.find((entry) => entry.id === confirm.id)
                      if (category) performDeleteCategory(category)
                    } else {
                      const prompt = prompts.find((entry) => entry.id === confirm.id)
                      if (prompt) performDeletePrompt(prompt)
                    }
                  },
                }, confirm.kind === 'category' ? t('cat.delete') : t('prompt.delete')),
              ),
            ),
          )
        : null

      const categoryDialog = catDraft
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setCatDraft(null) },
            h('div', {
              className: 'dsh-ph-dialog', role: 'dialog', 'aria-modal': 'true', ref: categoryDialogRef,
              'aria-label': catDraft.id ? t('cat.rename') : t('cat.add'),
              onClick: (event) => event.stopPropagation(),
            },
              h('div', { className: 'dsh-ph-dialog-title' }, catDraft.id ? t('cat.rename') : t('cat.add')),
              h('input', {
                className: 'dsh-ph-input', type: 'text', value: catDraft.name, maxLength: 200, autoFocus: true,
                placeholder: t('cat.namePlaceholder'), 'aria-label': t('cat.namePlaceholder'),
                onChange: (event) => setCatDraft({ ...catDraft, name: event.target.value }),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') saveCategory()
                },
              }),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setCatDraft(null) }, t('cancel')),
                h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary', disabled: !catDraft.name.trim(), onClick: saveCategory }, t('editor.save')),
              ),
            ),
          )
        : null

      const catManagerDialog = catManagerOpen
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setCatManagerOpen(false) },
            h('div', { className: 'dsh-ph-dialog dsh-ph-dialog-wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('cat.managerTitle'), ref: catManagerDialogRef, onClick: (event) => event.stopPropagation() },
              h('div', { className: 'dsh-ph-dialog-title' }, t('cat.managerTitle')),
              h('div', { className: 'dsh-ph-manager-list' },
                categories.length === 0
                  ? h('div', { className: 'dsh-ph-manager-empty' }, t('cat.empty'))
                  : null,
                categories.slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name)).map((category, index, ordered) => (
                  h('div', { className: 'dsh-ph-manager-row', key: category.id },
                    h('span', { className: 'dsh-ph-manager-name', title: category.name }, category.name),
                    h('span', { className: 'dsh-ph-manager-count' }, String(counts.get(category.id) || 0)),
                    h('div', { className: 'dsh-ph-manager-actions' },
                      h('button', {
                        type: 'button', className: 'dsh-ph-textbtn dsh-ph-manager-textbtn',
                        disabled: index === 0,
                        onClick: () => moveCategory(category.id, 'up'),
                      }, t('cat.moveUp')),
                      h('button', {
                        type: 'button', className: 'dsh-ph-textbtn dsh-ph-manager-textbtn',
                        disabled: index === ordered.length - 1,
                        onClick: () => moveCategory(category.id, 'down'),
                      }, t('cat.moveDown')),
                      h('button', {
                        type: 'button', className: 'dsh-ph-textbtn dsh-ph-manager-textbtn',
                        onClick: () => { setCatManagerOpen(false); setCatDraft({ id: category.id, name: category.name }) },
                      }, t('cat.rename')),
                      h('button', {
                        type: 'button', className: 'dsh-ph-textbtn dsh-ph-manager-textbtn is-danger',
                        onClick: () => { setCatManagerOpen(false); askDeleteCategory(category) },
                      }, t('cat.delete')),
                    ),
                  )
                )),
              ),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary',
                  onClick: () => { setCatManagerOpen(false); setCatDraft({ id: null, name: '' }) },
                }, t('cat.add')),
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setCatManagerOpen(false) }, t('common.close')),
              ),
            ),
          )
        : null

      const libraryDialog = libraryOpen
        ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setLibraryOpen(false) },
            h('div', { className: 'dsh-ph-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('library.title'), ref: libraryDialogRef, onClick: (event) => event.stopPropagation() },
              h('div', { className: 'dsh-ph-dialog-title' }, t('library.title')),
              h('div', { className: 'dsh-ph-library-actions' },
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-block',
                  onClick: () => { setLibraryOpen(false); if (fileRef.current) fileRef.current.click() },
                }, t('library.import')),
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-block',
                  onClick: () => { setLibraryOpen(false); exportJson() },
                }, t('library.export')),
                h('button', {
                  type: 'button', className: 'dsh-ph-btn dsh-ph-btn-block',
                  onClick: () => { setLibraryOpen(false); copyJson() },
                }, t('library.copy')),
              ),
              h('div', { className: 'dsh-ph-dialog-actions' },
                h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setLibraryOpen(false) }, t('common.close')),
              ),
            ),
          )
        : null

      return h('div', { className: 'dsh-ph-panel' },
        conflict
          ? h('div', { className: 'dsh-ph-banner', role: 'status' },
              h('span', null, t('conflict.message')),
              h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-sm', onClick: () => store.dismissConflict() }, t('common.close')),
            )
          : null,
        view === 'list'
          ? h('div', { className: 'dsh-ph-head' },
          h('div', { className: 'dsh-ph-head-row' },
            h('div', { className: 'dsh-ph-titleblock' },
              h('span', { className: 'dsh-ph-title' }, t('panel.title')),
              h('span', { className: 'dsh-ph-count' }, tn('panel.count', prompts.length)),
            ),
            h('button', {
              type: 'button', className: 'dsh-ph-iconbtn',
              title: t('settings.open'), 'aria-label': t('settings.open'),
              onClick: () => setSettingsOpen(true),
            }, h(IconSettings, { size: 16 })),
          ),
          h('div', { className: 'dsh-ph-head-row' },
            h('input', {
              className: 'dsh-ph-input dsh-ph-search', type: 'search', value: search,
              placeholder: t('search.placeholder'),
              onChange: (event) => setSearch(event.target.value),
            }),
            h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary', onClick: addPrompt }, t('prompt.add')),
          ),
        )
          : null,
        h('div', { className: 'dsh-ph-body' },
          h('div', { className: 'dsh-ph-side' },
            h('div', { className: 'dsh-ph-side-head' },
              h('span', { className: 'dsh-ph-side-label' }, t('cat.label')),
              h('button', {
                type: 'button', className: 'dsh-ph-linkbtn',
                onClick: () => setCatManagerOpen(true),
              }, t('cat.manage')),
            ),
            h('div', { className: 'dsh-ph-catlist' },
              prompts.length > 0
                ? h('button', {
                    type: 'button',
                    className: 'dsh-ph-cat' + (activeCat === '__all__' ? ' is-active' : ''),
                    'aria-pressed': activeCat === '__all__' ? 'true' : 'false',
                    onClick: () => setActiveCat('__all__'),
                  },
                    h('span', { className: 'dsh-ph-cat-name' }, t('cat.all')),
                    h('span', { className: 'dsh-ph-cat-count' }, String(prompts.length)),
                  )
                : null,
              prompts.length > 0
                ? h('button', {
                    type: 'button',
                    className: 'dsh-ph-cat' + (activeCat === '__none__' ? ' is-active' : ''),
                    'aria-pressed': activeCat === '__none__' ? 'true' : 'false',
                    onClick: () => setActiveCat('__none__'),
                  },
                    h('span', { className: 'dsh-ph-cat-name' }, t('cat.none')),
                    h('span', { className: 'dsh-ph-cat-count' }, String(counts.get('') || 0)),
                  )
                : null,
              categories.map((category) => h('button', {
                key: category.id,
                type: 'button',
                className: 'dsh-ph-cat' + (activeCat === category.id ? ' is-active' : ''),
                'aria-pressed': activeCat === category.id ? 'true' : 'false',
                onClick: () => setActiveCat(category.id),
              },
                h('span', { className: 'dsh-ph-cat-name', title: category.name }, category.name),
                h('span', { className: 'dsh-ph-cat-count' }, String(counts.get(category.id) || 0)),
              )),
            ),
            h('div', { className: 'dsh-ph-sidefoot' },
              h('button', {
                type: 'button', className: 'dsh-ph-btn dsh-ph-btn-block',
                onClick: () => setLibraryOpen(true),
              }, t('library.open')),
              h('input', {
                ref: fileRef, type: 'file', accept: 'application/json,.json', style: { display: 'none' },
                onChange: (event) => {
                  const file = event.target.files && event.target.files[0]
                  if (file) chooseImportFile(file)
                  event.target.value = ''
                },
              }),
            ),
          ),
          h('div', { className: 'dsh-ph-main' }, editor || list),
        ),
        notice
          ? h('div', { className: 'dsh-ph-notice', role: 'status' },
              h('span', null, notice.text),
              notice.action
                ? h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-sm', onClick: () => { const action = notice.action; setNotice(null); action.run() } }, notice.action.label)
                : null,
            )
          : null,
        categoryDialog,
        confirmDialog,
        importDialog,
        settingsDialog,
        catManagerDialog,
        libraryDialog,
      )
    }

    // ---------------------------------------------------------- composer ------
    function ComposerButton(props) {
      const useInput = props.useInput
      const inputActions = props.inputActions
      const draft = useInput ? useInput((state) => state.draft) : ''
      const settings = useSettings()
      const { data, error, loading } = useHubData()
      const [open, setOpen] = useState(false)
      const [placement, setPlacement] = useState(null)
      const [search, setSearch] = useState('')
      const [activeCat, setActiveCat] = useState('__all__')
      const [variableDraft, setVariableDraft] = useState(null)
      const triggerRef = useRef(null)
      const popoverRef = useRef(null)

      useEffect(() => {
        if (open) { void store.load(); setSearch(''); setActiveCat('__all__'); setVariableDraft(null) }
      }, [open])

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          const inTrigger = triggerRef.current && triggerRef.current.contains(event.target)
          const inPopover = popoverRef.current && popoverRef.current.contains(event.target)
          if (!inTrigger && !inPopover) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        window.addEventListener('mousedown', onDown)
        window.addEventListener('keydown', onKey)
        return () => {
          window.removeEventListener('mousedown', onDown)
          window.removeEventListener('keydown', onKey)
        }
      }, [open])

      const categories = (data && Array.isArray(data.categories)) ? data.categories : []
      const prompts = (data && Array.isArray(data.prompts)) ? data.prompts : []
      const query = search.trim().toLowerCase()
      const matches = useMemo(() => {
        return sortedPrompts(prompts).filter((prompt) => {
          if (activeCat === '__none__' && prompt.categoryId) return false
          if (activeCat !== '__all__' && activeCat !== '__none__' && prompt.categoryId !== activeCat) return false
          if (!query) return true
          return (prompt.title + '\n' + promptTags(prompt).join(' ') + '\n' + prompt.content).toLowerCase().includes(query)
        })
      }, [prompts, activeCat, query])

      const limit = settings.pickerLimit || 20
      const shown = matches.slice(0, limit)
      const variableDialogRef = useDialog(Boolean(variableDraft), () => setVariableDraft(null))
      const variableNames = variableDraft ? variablesOf(variableDraft.prompt.content) : []

      if (!useInput || !inputActions || typeof inputActions.setDraft !== 'function') return null

      function toggle(event) {
        if (open) { setOpen(false); return }
        const rect = event.currentTarget.getBoundingClientRect()
        const width = 360
        const height = 440
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
        let top = rect.bottom + 6
        if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6)
        setPlacement({ left, top })
        setOpen(true)
      }

      function insertPromptText(text) {
        const current = typeof draft === 'string' ? draft : ''
        const next = settings.insertMode === 'replace'
          ? text
          : (current.trim().length === 0 ? text : current.replace(/\s+$/, '') + '\n\n' + text)
        inputActions.setDraft(next)
        setOpen(false)
        setVariableDraft(null)
      }

      function pick(prompt) {
        const names = variablesOf(prompt.content)
        if (names.length > 0) {
          setVariableDraft({ prompt, values: {} })
          return
        }
        insertPromptText(prompt.content)
      }

      function chip(id, label) {
        return h('button', {
          key: id, type: 'button',
          className: 'dsh-ph-chip' + (activeCat === id ? ' is-active' : ''),
          onClick: () => setActiveCat(id),
        }, label)
      }

      return h('div', { className: 'dsh-ph-composer', ref: triggerRef },
        h('button', {
          type: 'button', className: 'dsh-ph-composer-btn',
          title: t('composer.label'), 'aria-label': t('composer.label'), onClick: toggle,
        }, h(HubIcon, { size: 16 })),
        open && placement && ReactDOM
          ? ReactDOM.createPortal(
              h('div', { className: 'dsh-ph-popover', style: { left: placement.left + 'px', top: placement.top + 'px' }, ref: popoverRef },
                h('div', { className: 'dsh-ph-popover-head' },
                  h('input', {
                    className: 'dsh-ph-input dsh-ph-popover-search', type: 'search',
                    value: search, placeholder: t('picker.searchPlaceholder'),
                    onChange: (event) => setSearch(event.target.value),
                  }),
                  h('button', { type: 'button', className: 'dsh-ph-btn dsh-ph-btn-sm', onClick: () => { setOpen(false); openPanel() } }, t('picker.manage')),
                ),
                prompts.length > 0
                  ? h('div', { className: 'dsh-ph-popover-cats' },
                      chip('__all__', t('cat.all')),
                      chip('__none__', t('cat.none')),
                      categories.map((category) => chip(category.id, category.name)),
                    )
                  : null,
                h('div', { className: 'dsh-ph-popover-list' },
                  shown.length === 0
                    ? h('div', { className: 'dsh-ph-empty' },
                        loading ? t('loading') : (error ? t('loadFailed', { message: error }) : t('picker.empty')))
                    : shown.map((prompt) => h('button', {
                        key: prompt.id, type: 'button', className: 'dsh-ph-pick', onClick: () => pick(prompt),
                      },
                        h('span', { className: 'dsh-ph-pick-title' },
                          prompt.pinned ? h('span', { className: 'dsh-ph-pick-pin' }, h(IconPin, { size: 12 })) : null,
                          h('span', { className: 'dsh-ph-pick-name' }, prompt.title),
                        ),
                        h('span', { className: 'dsh-ph-pick-preview' }, prompt.content),
                      )),
                ),
                matches.length > 0
                  ? h('div', { className: 'dsh-ph-popover-foot' },
                      h('span', null,
                        matches.length > shown.length
                          ? t('picker.truncated', { total: matches.length, shown: shown.length })
                          : tn('picker.total', matches.length)),
                    )
                  : null,
                variableDraft
                  ? h('div', { className: 'dsh-ph-dialogback', onClick: () => setVariableDraft(null) },
                      h('div', { className: 'dsh-ph-dialog', role: 'dialog', 'aria-modal': 'true', ref: variableDialogRef, onClick: (event) => event.stopPropagation() },
                        h('div', { className: 'dsh-ph-dialog-title' }, t('var.title')),
                        variableNames.map((name) => h('div', { key: name, className: 'dsh-ph-field' },
                          h('label', { className: 'dsh-ph-label' }, name),
                          h('input', {
                            className: 'dsh-ph-input', type: 'text', value: variableDraft.values[name] || '',
                            onChange: (event) => setVariableDraft({
                              ...variableDraft,
                              values: { ...variableDraft.values, [name]: event.target.value },
                            }),
                          }),
                        )),
                        h('p', { className: 'dsh-ph-radio-hint' }, t('var.keepPlaceholder')),
                        h('div', { className: 'dsh-ph-dialog-actions' },
                          h('button', { type: 'button', className: 'dsh-ph-btn', onClick: () => setVariableDraft(null) }, t('cancel')),
                          h('button', {
                            type: 'button', className: 'dsh-ph-btn dsh-ph-btn-primary',
                            onClick: () => insertPromptText(fillVariables(variableDraft.prompt.content, variableDraft.values)),
                          }, t('var.insert')),
                        ),
                      ),
                    )
                  : null,
              ),
              document.body,
            )
          : null,
      )
    }

    // ------------------------------------------------------------ exports ------
    exports.name = 'dsh-prompt-hub'
    // DSH 0.2.2 resolves client services strictly: every service the module
    // touches must be declared here. `layout` backs the picker's
    // “管理提示词” jump to the main panel.
    exports.inject = ['slots', 'locale', 'layout']
    exports.apply = function apply(ctx) {
      clientCtx = ctx

      ctx.effect(() => {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-prompt-hub'
        tag.textContent = CSS
        document.head.appendChild(tag)
        return () => { tag.remove() }
      }, 'dsh-prompt-hub: styles')

      ctx.inject(['locale'], (scope) => {
        try { scope.locale.register(LOCALE_NS, LOCALES) } catch { /* a missing dictionary is not fatal */ }
        try {
          const bound = scope.locale.bind(LOCALE_NS)
          if (typeof bound === 'function') serviceT = bound
        } catch { /* keep the built-in dictionary */ }
        const read = (snapshot) => {
          if (snapshot && snapshot.active) activeLang = snapshot.active
        }
        try { read(scope.locale.getSnapshot()) } catch { /* keep the browser language */ }
        try { return scope.on('locale/change', read) } catch { return undefined }
      })

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: PANEL_ID, order: 7, label: () => t('nav'),
      }, HubIcon)), 'dsh-prompt-hub: sidebar entry')

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: PANEL_ID,
      }, PromptHubPanel)), 'dsh-prompt-hub: main panel')

      ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left', id: PANEL_ID, order: 0, label: () => t('composer.label'),
      }, ComposerButton)), 'dsh-prompt-hub: composer button')
    }

    return module.exports
  },
})
