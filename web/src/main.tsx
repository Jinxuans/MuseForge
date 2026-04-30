import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type View = 'create' | 'gallery' | 'tasks' | 'settings';

type Asset = {
  id: string;
  task_id: string;
  task_type?: string;
  prompt?: string;
  storage_key: string;
  public_url: string;
  mime: string;
  width?: number;
  height?: number;
  size_bytes: number;
  created_at: string;
};

type Task = {
  id: string;
  type: string;
  model: string;
  prompt: string;
  status: string;
  error?: string;
  last_error?: string;
  attempt_count?: number;
  max_attempts?: number;
  next_run_at?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  assets?: Asset[];
};

type ProviderProfile = {
  id: number;
  name: string;
  type: string;
  base_url: string;
  api_key_hint: string;
  created_at: string;
};

const DB_NAME = 'gpt_image_db';
const DB_STORE = 'history';
const DB_SETTINGS = 'settings';
const SERVER_ASSETS_SETTING = 'serverAssets';
const SERVER_IMAGE_CACHE = 'gpt-image-server-files-v1';
const BASEURL_KEY = 'gpt_image_baseurl';
const APIKEY_KEY = 'gpt_image_apikey';
const PROVIDER_PROFILE_KEY = 'gpt_image_provider_profile_id';
const CLIENT_ID_KEY = 'gpt_image_client_id';
const LEGACY_QUERY_KEYS = ['address', 'key', 'name', 'channel', 'channel_name'];
const initialLegacySearch = window.location.search;
const shouldForwardLegacySearch = (() => {
  const params = new URLSearchParams(initialLegacySearch);
  return LEGACY_QUERY_KEYS.some((key) => params.has(key));
})();
const legacyCreateSrc = `/legacy.html${shouldForwardLegacySearch ? initialLegacySearch : ''}`;
if (shouldForwardLegacySearch) {
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
}

function App() {
  const [view, setView] = useState<View>('create');

  return (
    <main className="app-shell">
      <aside className="nav">
        <div className="brand">
          <strong>GPT Image</strong>
          <span>创作平台</span>
        </div>
        <button className={view === 'create' ? 'active' : ''} onClick={() => setView('create')}>创建</button>
        <button className={view === 'gallery' ? 'active' : ''} onClick={() => setView('gallery')}>图库</button>
        <button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}>任务</button>
        <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}>渠道</button>
      </aside>
      <section className="workspace">
        <div className={view === 'create' ? 'view-panel active' : 'view-panel'}>
          <LegacyCreate />
        </div>
        <div className={view === 'gallery' ? 'view-panel active' : 'view-panel'}>
          {view === 'gallery' && <Gallery />}
        </div>
        <div className={view === 'tasks' ? 'view-panel active' : 'view-panel'}>
          {view === 'tasks' && <Tasks />}
        </div>
        <div className={view === 'settings' ? 'view-panel active' : 'view-panel'}>
          {view === 'settings' && <Settings />}
        </div>
      </section>
    </main>
  );
}

function Settings() {
  const [profiles, setProfiles] = useState<ProviderProfile[]>([]);
  const [status, setStatus] = useState('');
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState(localStorage.getItem(BASEURL_KEY) || 'https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const selected = localStorage.getItem(PROVIDER_PROFILE_KEY) || '';

  useEffect(() => {
    loadProfiles().then(setProfiles).catch((error) => setStatus(errorMessage(error)));
  }, []);

  async function save() {
    const res = await fetch('/api/provider-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
      body: JSON.stringify({ name, type: 'custom', base_url: baseUrl, api_key: apiKey })
    });
    if (!res.ok) throw new Error(await responseError(res));
    const data = await res.json();
    setProfiles((current) => [data.provider_profile, ...current]);
    setName('');
    setApiKey('');
    setStatus('渠道已保存');
  }

  async function remove(id: number) {
    const res = await fetch(`/api/provider-profiles/${id}`, { method: 'DELETE', headers: clientHeaders() });
    if (!res.ok) throw new Error(await responseError(res));
    setProfiles((current) => current.filter((profile) => profile.id !== id));
    if (selected === String(id)) localStorage.removeItem(PROVIDER_PROFILE_KEY);
  }

  function useProfile(profile: ProviderProfile) {
    localStorage.setItem(PROVIDER_PROFILE_KEY, String(profile.id));
    localStorage.setItem(BASEURL_KEY, profile.base_url);
    localStorage.removeItem(APIKEY_KEY);
    setBaseUrl(profile.base_url);
    setStatus(`已选择渠道：${profile.name}`);
  }

  async function clearLocalSettings() {
    if (!confirm('确定清理本地表单和渠道选择？已保存渠道不会从服务器删除。')) return;
    localStorage.removeItem(PROVIDER_PROFILE_KEY);
    localStorage.removeItem(BASEURL_KEY);
    localStorage.removeItem(APIKEY_KEY);
    localStorage.removeItem('gpt_image_form');
    setBaseUrl('https://api.openai.com/v1');
    setStatus('本地设置已清理');
  }

  async function resetBrowserData() {
    if (!confirm('确定清理本浏览器里的历史、缓存和本地设置？服务端数据不会删除。')) return;
    localStorage.removeItem(PROVIDER_PROFILE_KEY);
    localStorage.removeItem(BASEURL_KEY);
    localStorage.removeItem(APIKEY_KEY);
    localStorage.removeItem('gpt_image_form');
    if ('caches' in window) await caches.delete(SERVER_IMAGE_CACHE);
    await deleteIndexedDB(DB_NAME);
    setStatus('本浏览器数据已重置');
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>渠道配置</h1>
          <p>保存 Base URL 和 API Key，创建页会优先使用选中的渠道 ID</p>
        </div>
      </header>
      {status && <div className="notice">{status}</div>}
      <section className="settings-form">
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="渠道名称" />
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
        <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API Key" type="password" />
        <button onClick={() => save().catch((error) => setStatus(errorMessage(error)))}>保存渠道</button>
      </section>
      <div className="profile-list">
        {profiles.map((profile) => (
          <article className="profile-row" key={profile.id}>
            <div>
              <strong>{profile.name}</strong>
              <p>{profile.base_url} · Key 尾号 {profile.api_key_hint || '未保存'}</p>
            </div>
            <div className="profile-actions">
              <button onClick={() => useProfile(profile)}>{selected === String(profile.id) ? '使用中' : '使用'}</button>
              <button onClick={() => remove(profile.id).catch((error) => setStatus(errorMessage(error)))}>删除</button>
            </div>
          </article>
        ))}
      </div>
      <section className="danger-zone">
        <div>
          <h2>危险区</h2>
          <p>这些操作只影响当前浏览器；服务器上的渠道、任务和图片不会被批量删除。</p>
        </div>
        <div className="profile-actions">
          <button onClick={() => clearLocalSettings().catch((error) => setStatus(errorMessage(error)))}>清理本地设置</button>
          <button onClick={() => resetBrowserData().catch((error) => setStatus(errorMessage(error)))}>重置浏览器数据</button>
        </div>
      </section>
    </div>
  );
}

function LegacyCreate() {
  return <iframe className="legacy-frame" src={legacyCreateSrc} title="GPT Image creator" />;
}

function Gallery() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'generation' | 'edit'>('all');
  const [status, setStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadCachedAssets().then((cached) => {
      if (alive) setAssets(cached);
    });
    refreshAssets().then((fresh) => {
      if (alive) setAssets(fresh);
    }).catch((error) => {
      if (alive) setStatus(errorMessage(error));
    });
    return () => {
      alive = false;
      Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    let alive = true;
    const missing = assets.filter((asset) => !imageUrls[asset.id]);
    Promise.all(missing.map(async (asset) => [asset.id, await cachedImageURL(asset.public_url)] as const))
      .then((pairs) => {
        if (!alive || pairs.length === 0) return;
        setImageUrls((current) => {
          const next = { ...current };
          for (const [id, url] of pairs) next[id] = url;
          return next;
        });
      });
    return () => {
      alive = false;
    };
  }, [assets, imageUrls]);

  const visible = useMemo(() => {
    return assets.filter((asset) => filter === 'all' || asset.task_type === filter);
  }, [assets, filter]);
  const lightboxAsset = lightboxIndex == null ? null : visible[lightboxIndex];

  async function remove(asset: Asset) {
    if (!confirm('确定删除这张服务端图片？')) return;
    const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE', headers: clientHeaders() });
    if (!res.ok) throw new Error(await responseError(res));
    await removeCachedAsset(asset.id, asset.public_url);
    setAssets((current) => current.filter((item) => item.id !== asset.id));
    setLightboxIndex(null);
    setImageUrls((current) => {
      const next = { ...current };
      if (next[asset.id]) URL.revokeObjectURL(next[asset.id]);
      delete next[asset.id];
      return next;
    });
  }

  async function reload() {
    setStatus('正在刷新图库');
    const fresh = await refreshAssets();
    setAssets(fresh);
    setStatus('图库已刷新');
  }

  async function clearImageCache() {
    if (!confirm('确定清理浏览器里的服务端图片缓存？服务端文件不会删除。')) return;
    if ('caches' in window) await caches.delete(SERVER_IMAGE_CACHE);
    Object.values(imageUrls).forEach((url) => URL.revokeObjectURL(url));
    setImageUrls({});
    setStatus('图片缓存已清理');
  }

  async function exportLocalHistory() {
    const history = await getAllHistory();
    const serverAssets = await loadCachedAssets();
    downloadJSON({
      version: 1,
      exported_at: new Date().toISOString(),
      history,
      server_assets_cache: serverAssets
    }, `gpt-image-local-history-${new Date().toISOString().slice(0, 10)}.json`);
  }

  async function importLocalHistory(file: File) {
    const text = await file.text();
    const data = JSON.parse(text);
    const history = Array.isArray(data) ? data : data.history;
    if (!Array.isArray(history)) throw new Error('导入文件缺少 history 数组');
    await putHistoryItems(history);
    setStatus(`已导入 ${history.length} 条旧本地历史`);
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>服务端图库</h1>
          <p>{visible.length ? `${visible.length} 张图片` : '暂无服务端图片'}</p>
        </div>
        <div className="segmented">
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>全部</button>
          <button className={filter === 'generation' ? 'active' : ''} onClick={() => setFilter('generation')}>生成</button>
          <button className={filter === 'edit' ? 'active' : ''} onClick={() => setFilter('edit')}>编辑</button>
        </div>
        <div className="toolbar-menu">
          <button className="icon-button" aria-label="图库设置" onClick={() => setMenuOpen((open) => !open)}>⚙</button>
          <div className={menuOpen ? 'menu open' : 'menu'}>
            <button onClick={() => { setMenuOpen(false); reload().catch((error) => setStatus(errorMessage(error))); }}>刷新</button>
            <button onClick={() => { setMenuOpen(false); clearImageCache().catch((error) => setStatus(errorMessage(error))); }}>清理图片缓存</button>
            <button onClick={() => { setMenuOpen(false); exportLocalHistory().catch((error) => setStatus(errorMessage(error))); }}>导出旧历史</button>
            <button onClick={() => { setMenuOpen(false); importRef.current?.click(); }}>导入旧历史</button>
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) importLocalHistory(file).catch((error) => setStatus(errorMessage(error)));
            }}
          />
        </div>
      </header>
      {status && <div className="notice">{status}</div>}
      <div className="asset-grid">
        {visible.map((asset) => (
          <article
            className="asset-card"
            key={asset.id}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a, button')) return;
              setLightboxIndex(indexOfAsset(visible, asset.id));
            }}
          >
            {imageUrls[asset.id] ? <img src={imageUrls[asset.id]} alt="" loading="lazy" /> : <div className="image-placeholder" />}
            <div className="asset-overlay">
              <p>{asset.prompt || '无提示词'}</p>
              <time>{formatDateTime(asset.created_at)}</time>
              <div className="asset-actions">
                <a href={imageUrls[asset.id] || asset.public_url} download={filename(asset)}>下载</a>
                <button onClick={() => remove(asset).catch((error) => setStatus(errorMessage(error)))}>删除</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {lightboxAsset && (
        <div className="lightbox" onClick={() => setLightboxIndex(null)}>
          <button className="lightbox-close" onClick={() => setLightboxIndex(null)}>×</button>
          <button className="lightbox-nav prev" disabled={lightboxIndex === 0} onClick={(event) => { event.stopPropagation(); setLightboxIndex((current) => current == null ? current : Math.max(0, current - 1)); }}>‹</button>
          <button className="lightbox-nav next" disabled={lightboxIndex === visible.length - 1} onClick={(event) => { event.stopPropagation(); setLightboxIndex((current) => current == null ? current : Math.min(visible.length - 1, current + 1)); }}>›</button>
          <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
            <img src={imageUrls[lightboxAsset.id] || lightboxAsset.public_url} alt="" />
            <div className="lightbox-meta">
              <div>
                <p>{lightboxAsset.prompt || '无提示词'}</p>
                <time>{formatDateTime(lightboxAsset.created_at)}</time>
              </div>
              <div className="asset-actions">
                <a href={imageUrls[lightboxAsset.id] || lightboxAsset.public_url} download={filename(lightboxAsset)}>下载</a>
                <button onClick={() => remove(lightboxAsset).catch((error) => setStatus(errorMessage(error)))}>删除</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    async function load() {
      try {
        const res = await fetch('/api/tasks', { headers: clientHeaders() });
        if (!res.ok) throw new Error(await responseError(res));
        const data = await res.json();
        const nextTasks = Array.isArray(data.tasks) ? data.tasks : [];
        if (!alive) return;
        setTasks(nextTasks);
        const hasActiveTask = nextTasks.some((task: Task) => task.status === 'queued' || task.status === 'running');
        if (hasActiveTask) timer = window.setTimeout(load, 8000);
      } catch (error) {
        if (alive) setStatus(errorMessage(error));
      }
    }
    load();
    return () => {
      alive = false;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>任务队列</h1>
          <p>{tasks.length ? `${tasks.length} 个最近任务` : '暂无任务'}</p>
        </div>
      </header>
      {status && <div className="notice">{status}</div>}
      <div className="task-list">
        {tasks.map((task) => {
          const failed = task.status === 'failed';
          const attempts = task.attempt_count || 0;
          const maxAttempts = task.max_attempts || 3;
          const showRetrySummary = failed && attempts > 1;
          return (
            <article className="task-row" key={task.id}>
              <span className={`badge ${task.status}`}>{task.status}</span>
              <div>
                <strong>{task.type} · {task.model}</strong>
                <p>{task.prompt}</p>
                {showRetrySummary && <p>已重试 {attempts}/{maxAttempts} 次后失败</p>}
                {failed && task.last_error && <p className="error">{task.last_error}</p>}
                {task.error && <p className="error">{task.error}</p>}
              </div>
              <time>{new Date(task.created_at).toLocaleString('zh-CN')}</time>
            </article>
          );
        })}
      </div>
    </div>
  );
}

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_SETTINGS)) db.createObjectStore(DB_SETTINGS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteIndexedDB(name: string) {
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_SETTINGS, 'readonly');
    const req = tx.objectStore(DB_SETTINGS).get(key);
    req.onsuccess = () => resolve((req.result?.value ?? fallback) as T);
    req.onerror = () => reject(req.error);
  });
}

async function setSetting(key: string, value: unknown) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_SETTINGS, 'readwrite');
    tx.objectStore(DB_SETTINGS).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllHistory(): Promise<unknown[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

async function putHistoryItems(items: unknown[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    for (const item of items) {
      if (item && typeof item === 'object' && 'id' in item) store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadCachedAssets() {
  return getSetting<Asset[]>(SERVER_ASSETS_SETTING, []);
}

async function refreshAssets() {
  const res = await fetch('/api/assets', { headers: clientHeaders() });
  if (!res.ok) throw new Error(await responseError(res));
  const data = await res.json();
  const assets = Array.isArray(data.assets) ? data.assets : [];
  await setSetting(SERVER_ASSETS_SETTING, assets);
  return assets;
}

async function loadProfiles() {
  const res = await fetch('/api/provider-profiles', { headers: clientHeaders() });
  if (!res.ok) throw new Error(await responseError(res));
  const data = await res.json();
  return Array.isArray(data.provider_profiles) ? data.provider_profiles : [];
}

function clientHeaders(): Record<string, string> {
  return { 'X-Client-ID': getClientID() };
}

function getClientID() {
  let id = localStorage.getItem(CLIENT_ID_KEY) || '';
  if (!id) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    id = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

async function cachedImageURL(url: string) {
  if (!('caches' in window)) return url;
  const cache = await caches.open(SERVER_IMAGE_CACHE);
  let response = await cache.match(url);
  if (!response) {
    const fresh = await fetch(url);
    if (!fresh.ok) throw new Error(`HTTP ${fresh.status}`);
    await cache.put(url, fresh.clone());
    response = fresh;
  }
  return URL.createObjectURL(await response.blob());
}

async function removeCachedAsset(assetId: string, publicUrl: string) {
  const cached = await loadCachedAssets();
  await setSetting(SERVER_ASSETS_SETTING, cached.filter((asset) => asset.id !== assetId));
  if ('caches' in window) {
    const cache = await caches.open(SERVER_IMAGE_CACHE);
    await cache.delete(publicUrl);
  }
}

function downloadJSON(value: unknown, name: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function responseError(res: Response) {
  const text = await res.text();
  try {
    const data = JSON.parse(text);
    return data?.error?.message || `HTTP ${res.status}`;
  } catch {
    return text || `HTTP ${res.status}`;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function filename(asset: Asset) {
  return asset.storage_key.split('/').pop() || `${asset.id}.png`;
}

function formatDateTime(value: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN');
}

function indexOfAsset(assets: Asset[], id: string) {
  return Math.max(0, assets.findIndex((asset) => asset.id === id));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
