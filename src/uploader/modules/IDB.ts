import { ConnectableObservable, from, Observable } from 'rxjs'
import { concatMap, publishReplay } from 'rxjs/operators'

enum Constants {
  Key = 'key',
  Value = 'value',
  Readonly = 'readonly',
  Readwrite = 'readwrite',
  DefaultStoreName = 'key-value',
}

export interface KeyValueItems<K, V> {
  [Constants.Key]: K
  [Constants.Value]: V
}

export class IDB<K extends string | number = string, V extends any = unknown> {
  private conn$: ConnectableObservable<IDBDatabase>

  static createInstance<K extends string | number = string, V extends any = unknown>(
    dbName: string,
    tableName?: string,
  ): IDB<K, V> {
    return new IDB<K, V>(dbName, tableName)
  }

  constructor(private dbName: string, private tableName: string = Constants.DefaultStoreName) {
    if (!this.dbName || typeof dbName !== 'string' || !this.tableName || typeof tableName !== 'string') {
      throw new Error()
    }

    this.conn$ = from(this.initConn()).pipe(publishReplay(1)) as ConnectableObservable<IDBDatabase>
    this.conn$.connect()
  }

  private initConn(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1)
      request.onsuccess = (e: Event) => {
        const db = ((e.target as unknown) as { result: IDBDatabase }).result
        if (!db.objectStoreNames.contains(this.tableName)) {
          console.warn('no such store', this.tableName, db)
        }
        resolve(db)
      }
      request.onupgradeneeded = (e: Event) => {
        const db = ((e.target as unknown) as { result: IDBDatabase }).result
        if (!db.objectStoreNames.contains(this.tableName)) {
          db.createObjectStore(this.tableName, { autoIncrement: true })
        }
        resolve(db)
      }
      request.onerror = () => reject(new Error())
    })
  }

  setItem(key: K, value: V): Observable<V> {
    const setItem = (db: IDBDatabase) => {
      return new Promise<V>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.put(value, String(key))
        request.onsuccess = () => resolve(value)
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(setItem))
  }
  getItem(key: K): Observable<V | undefined> {
    const getItem = (db: IDBDatabase) => {
      return new Promise<V | undefined>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readonly).objectStore(this.tableName)
        const request = table.get(String(key))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(getItem))
  }
  list(): Observable<Record<K, V>> {
    const list = (db: IDBDatabase) => {
      return new Promise<Record<K, V>>((resolve, reject) => {
        const transaction = db.transaction(this.tableName, Constants.Readonly)
        const request = transaction.objectStore(this.tableName).openCursor()
        const record = {} as Record<K, V>
        request.onsuccess = (e: Event) => {
          let cursor = request.result
          if (cursor) {
            const { key, value } = cursor
            record[key as K] = value as V
            cursor.continue()
          } else {
            resolve(record)
          }
        }
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(list))
  }
  removeItem(key: K): Observable<void> {
    const removeItem = (db: IDBDatabase) => {
      return new Promise<void>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.delete(String(key))
        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(removeItem))
  }
  clear(): Observable<void> {
    const clear = (db: IDBDatabase) => {
      return new Promise<void>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.clear()
        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(clear))
  }
  size(): Observable<number> {
    const size = (db: IDBDatabase) => {
      return new Promise<number>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.count()
        request.onsuccess = () => resolve(request.result || 0)
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(size))
  }
  keys(): Observable<K[]> {
    const keys = (db: IDBDatabase) => {
      return new Promise<K[]>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.getAllKeys()
        request.onsuccess = () => resolve(request.result as K[])
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(keys))
  }
  values(): Observable<V[]> {
    const values = (db: IDBDatabase) => {
      return new Promise<V[]>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const request = table.getAll()
        request.onsuccess = () => resolve(request.result as V[])
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(values))
  }
  getItems(keys: K[]): Observable<Record<K, V>> {
    const getItems = (db: IDBDatabase) => {
      return new Promise<Record<K, V>>((resolve, reject) => {
        const record = {} as Record<K, V>
        if (!keys?.length) {
          resolve(record)
          return
        }
        keys = keys.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const keyRangeValue = IDBKeyRange.bound(keys[0], keys[keys.length - 1], false, false)
        const request = table.openCursor(keyRangeValue)
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            resolve(record)
            return
          }

          const key = cursor.key
          let i = 0
          while (key > keys[i]) {
            i++
            if (i === keys.length) {
              resolve(record)
              return
            }
          }
          if (key === keys[i]) {
            const value = cursor.value
            record[key as K] = value
            cursor.continue()
          } else {
            cursor.continue(keys[i])
          }
        }
        request.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(getItems))
  }
  setItems(items: Record<K, V>): Observable<void>
  setItems(items: KeyValueItems<K, V>[]): Observable<void>
  setItems(items: Record<K, V> | KeyValueItems<K, V>[]): Observable<void> {
    const setItems = (db: IDBDatabase) => {
      return new Promise<void>((resolve, reject) => {
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        let promises = []
        if (Array.isArray(items)) {
          promises = items.map((item) => {
            return new Promise<void>((resolve, reject) => {
              const req = table.put(item[Constants.Value], String(item[Constants.Key]))
              req.onsuccess = () => resolve()
              req.onerror = () => reject(new Error())
            })
          })
        } else {
          promises = Object.keys(items).map((key) => {
            const value = items[key as K]
            return new Promise<void>((resolve, reject) => {
              const req = table.put(value, String(key))
              req.onsuccess = () => resolve()
              req.onerror = () => reject(new Error())
            })
          })
        }

        Promise.all(promises)
          .then(() => resolve())
          .catch((e) => reject(e))
      })
    }
    return this.conn$.pipe(concatMap(setItems))
  }
  removeItems(keys: K[]): Observable<void> {
    const removeItems = (db: IDBDatabase) => {
      return new Promise<void>((resolve, reject) => {
        if (!keys?.length) {
          resolve()
          return
        }
        const table = db.transaction(this.tableName, Constants.Readwrite).objectStore(this.tableName)
        const requests = keys.map((key) => {
          return new Promise<void>((resolve, reject) => {
            const req = table.delete(key)
            req.onerror = () => reject(new Error())
            req.onsuccess = () => resolve()
          })
        })
        Promise.all(requests)
          .then(() => resolve())
          .catch((e) => reject(e))
      })
    }
    return this.conn$.pipe(concatMap(removeItems))
  }
  getItemsWhenKeyStartsWith(prefix: K): Observable<Record<K, V>> {
    const getItemsWhenKeyStartsWith = (db: IDBDatabase) => {
      return new Promise<Record<K, V>>((resolve, reject) => {
        const record = {} as Record<K, V>
        if (!prefix) {
          resolve(record)
          return
        }
        const table = db.transaction(this.tableName, Constants.Readonly).objectStore(this.tableName)
        const keyRangeValue = IDBKeyRange.bound(String(prefix), prefix + 'uffff', false, false)
        const req = table.openCursor(keyRangeValue)
        req.onsuccess = () => {
          let cursor = req.result
          if (cursor) {
            let { key, value } = cursor
            record[key as K] = value as V
            cursor.continue()
          } else {
            resolve(record)
          }
        }
        req.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(getItemsWhenKeyStartsWith))
  }
  getKeysWhenKeyStartsWith(prefix: string): Observable<K[]> {
    const getValuesWhenKeyStartsWith = (db: IDBDatabase) => {
      return new Promise<K[]>((resolve, reject) => {
        if (!prefix) {
          resolve([])
          return
        }
        const table = db.transaction(this.tableName, Constants.Readonly).objectStore(this.tableName)
        const keyRangeValue = IDBKeyRange.bound(String(prefix), prefix + 'uffff', false, false)
        const req = table.getAllKeys(keyRangeValue)
        req.onsuccess = () => resolve(req.result as K[])
        req.onerror = () => reject(new Error())
      })
    }
    return this.conn$.pipe(concatMap(getValuesWhenKeyStartsWith))
  }
}
