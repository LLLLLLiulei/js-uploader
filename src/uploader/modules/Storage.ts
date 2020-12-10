import * as localforage from 'localforage'
import { extendPrototype as extendStartswith } from 'localforage-startswith'
import { extendPrototype as extendRemoveitems } from 'localforage-removeitems'
import { extendPrototype as extendSetitems } from 'localforage-setitems'
import { extendPrototype as extendGetitems } from 'localforage-getitems'

interface IStorage extends LocalForage {
  list: () => Promise<unknown[]>
}

function extendList (instance: LocalForage): IStorage {
  return Object.assign(instance, {
    list (): Promise<unknown[]> {
      return new Promise((resolve, reject) => {
        const list: unknown[] = []
        instance
          .iterate((value: unknown) => {
            list.push(value)
          })
          .then(() => resolve(list))
          .catch((err: Error) => reject(err))
      })
    },
  })
}

function createInstance (opts: LocalForageOptions): IStorage {
  const instance = localforage.createInstance(opts)
  extendStartswith(instance)
  extendRemoveitems(instance)
  extendSetitems(instance)
  extendGetitems(instance)
  extendList(instance)
  return instance as IStorage
}

const INSTANCE_NAME = 'uploader'
export class Storage {
  static readonly UploadTask: IStorage = createInstance({ name: INSTANCE_NAME, storeName: 'UploadTask' })
  static readonly UploadFile: IStorage = createInstance({ name: INSTANCE_NAME, storeName: 'UploadFile' })
  static readonly FileChunk: IStorage = createInstance({ name: INSTANCE_NAME, storeName: 'FileChunk' })
  static readonly BinaryLike: IStorage = createInstance({ name: INSTANCE_NAME, storeName: 'BinaryLike' })

  private static readonly Public: IStorage = createInstance({ name: INSTANCE_NAME, storeName: 'Public' })

  private constructor () {}

  static get = Storage.Public.getItem.bind(Storage.Public)
  static set = Storage.Public.setItem.bind(Storage.Public)
  static remove = Storage.Public.removeItem.bind(Storage.Public)
  static list = Storage.Public.list.bind(Storage.Public)
  static clear = Storage.Public.clear.bind(Storage.Public)
  static getItems = Storage.Public.getItems.bind(Storage.Public)
  static setItems = Storage.Public.setItems.bind(Storage.Public)
  static removeItems = Storage.Public.removeItems.bind(Storage.Public)
  static startsWith = Storage.Public.startsWith.bind(Storage.Public)
}
