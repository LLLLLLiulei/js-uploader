import { Subject, Subscription } from 'rxjs'

interface UploadEvent {
  type: string
  data?: any[]
}

type EventListener = ((...data: unknown[]) => void) | Function

export class EventEmitter {
  private readonly eventSubject: Subject<UploadEvent> = new Subject()
  private readonly listenerMap: Map<string, WeakMap<EventListener, Subscription>> = new Map()

  on (type: string, listener: EventListener): void {
    this.addListener(type, listener)
  }

  once (type: string, listener: EventListener): void {
    this.addListener(type, listener, true)
  }

  off (type: string, listener?: EventListener): void {
    this.removeListener(type, listener)
  }

  emit (type: string, ...data: any[]): void {
    type && this.eventSubject.next({ type, data })
  }

  addListener (type: string, listener: EventListener, once?: boolean): void {
    let map: WeakMap<EventListener, Subscription> = this.getSubscriptionMap(type)
    if (map.has(listener)) {
      this.off(type, listener)
    }
    const sub = this.eventSubject.subscribe(this.listenerWrap(type, listener, once))
    map.set(listener, sub)
  }

  removeListener (type: string, listener?: EventListener): void {
    let map: WeakMap<EventListener, Subscription> = this.getSubscriptionMap(type)
    if (listener) {
      let sub = map.get(listener)
      if (sub) {
        sub.unsubscribe()
        map.delete(listener)
      }
    } else {
    }
  }

  private getSubscriptionMap (evtType: string): WeakMap<EventListener, Subscription> {
    let map = this.listenerMap.get(evtType) || new WeakMap()
    if (!this.listenerMap.has(evtType)) {
      this.listenerMap.set(evtType, map)
    }
    return map
  }

  private listenerWrap (type: string, listener: EventListener, once?: boolean) {
    return (evt: UploadEvent) => {
      if (evt.type === type) {
        once && this.off(type, listener)
        try {
          listener(...(evt.data || []))
        } catch (e) {
          console.error(e)
        }
      }
    }
  }
}
