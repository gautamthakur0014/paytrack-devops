const DB_NAME = 'PayTrack_db';
const DB_VERSION = 3; // bumped for new stores

let db = null;

const openDB = () => new Promise((resolve, reject) => {
  if (db) return resolve(db);

  const req = indexedDB.open(DB_NAME, DB_VERSION);

  req.onerror = () => reject(req.error);

  req.onsuccess = () => {
    db = req.result;
    resolve(db);
  };

  req.onupgradeneeded = (e) => {
    const d = e.target.result;

    if (!d.objectStoreNames.contains('expenses')) {
      const es = d.createObjectStore('expenses', { keyPath: '_id' });
      es.createIndex('expenseDate', 'expenseDate');
      es.createIndex('category', 'category');
    }

    if (!d.objectStoreNames.contains('groups')) {
      d.createObjectStore('groups', { keyPath: '_id' });
    }

    if (!d.objectStoreNames.contains('connections')) {
      d.createObjectStore('connections', { keyPath: '_id' });
    }

    if (!d.objectStoreNames.contains('notifications')) {
      const ns = d.createObjectStore('notifications', { keyPath: '_id' });
      ns.createIndex('createdAt', 'createdAt');
    }

    if (!d.objectStoreNames.contains('sync_queue')) {
      const sq = d.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
      sq.createIndex('ts', 'ts');
    }

    if (!d.objectStoreNames.contains('cache')) {
      d.createObjectStore('cache', { keyPath: 'key' });
    }
  };
});

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

const getStore = async (name, mode = 'readonly') => {
  const d = await openDB();
  return d.transaction(name, mode).objectStore(name);
};

// Generic store factory
function makeStore(storeName) {
  return {
    getAll: async () => wrap((await getStore(storeName)).getAll()),

    get: async (id) => wrap((await getStore(storeName)).get(id)),

    put: async (item) =>
      wrap((await getStore(storeName, 'readwrite')).put(item)),

    putMany: async (items = []) => {
      if (!items.length) return;
      const d = await openDB();
      const tx = d.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      return new Promise((res, rej) => {
        items.forEach(item => store.put(item));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    },

    delete: async (id) =>
      wrap((await getStore(storeName, 'readwrite')).delete(id)),

    clear: async () =>
      wrap((await getStore(storeName, 'readwrite')).clear()),
  };
}

export const idb = {
  expenses: {
    ...makeStore('expenses'),

    getByCategory: async (cat) => {
      const store = await getStore('expenses');
      const index = store.index('category');
      return wrap(index.getAll(cat));
    },
  },

  groups: makeStore('groups'),
  connections: makeStore('connections'),
  notifications: makeStore('notifications'),

  syncQueue: {
    getAll: async () => wrap((await getStore('sync_queue')).getAll()),

    add: async (item) =>
      wrap((await getStore('sync_queue', 'readwrite')).add({
        ...item,
        ts: Date.now(),
        retries: 0,
      })),

    delete: async (id) =>
      wrap((await getStore('sync_queue', 'readwrite')).delete(id)),

    clear: async () =>
      wrap((await getStore('sync_queue', 'readwrite')).clear()),
  },

  cache: {
    get: async (key) => {
      const store = await getStore('cache');
      const data = await wrap(store.get(key));
      if (!data) return null;
      if (data.expiresAt && data.expiresAt < Date.now()) {
        await wrap((await getStore('cache', 'readwrite')).delete(key));
        return null;
      }
      return data.value;
    },

    set: async (key, value, ttl = 300000) =>
      wrap((await getStore('cache', 'readwrite')).put({
        key,
        value,
        expiresAt: ttl > 0 ? Date.now() + ttl : 0,
      })),

    delete: async (key) =>
      wrap((await getStore('cache', 'readwrite')).delete(key)),

    clear: async () =>
      wrap((await getStore('cache', 'readwrite')).clear()),
  },
};
