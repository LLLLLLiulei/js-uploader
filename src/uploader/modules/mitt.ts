type Arguments<T> = [T] extends [(...args: infer U) => any] ? U : [T] extends [void] ? [] : [T]

interface TypedEventEmitter<Events> {
  on<E extends keyof Events>(event: E, listener: Events[E]): this
  off<E extends keyof Events>(event: E, listener: Events[E]): this
  emit<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>): this
}

interface UploadEvents {
  complete: (a: string, b: boolean) => void
}

export class EventEmitter<Events> implements TypedEventEmitter<Events> {
  private readonly _evtmap: Map<keyof Events, Array<unknown>> = new Map()

  on<E extends keyof Events>(event: E, listener: Events[E]): this {
    let arr = this._evtmap.get(event)
    arr ? arr.push(listener) : this._evtmap.set(event, [listener])
    return this
  }
  off<E extends keyof Events>(event: E, listener?: Events[E]): this {
    let arr = this._evtmap.get(event)
    if (arr) {
      let index = listener ? arr.indexOf(listener) : -1
      index === -1 ? arr.splice(0, arr.length) : arr.splice(index, 1)
    }
    return this
  }
  emit<E extends keyof Events>(event: E, ...args: Arguments<Events[E]>): this {
    this._evtmap.get(event)?.forEach((fn) => typeof fn === 'function' && fn(...args))
    return this
  }
}

let emitter = new EventEmitter<UploadEvents>()
emitter.on('complete', (...args) => {
  console.log(...args)
})

emitter.emit('complete', '', false)
