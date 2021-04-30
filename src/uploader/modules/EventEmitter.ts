import { Subject, Subscription } from 'rxjs'
import { filter } from 'rxjs/operators'

interface UploadEvent {
  type: string
  data?: any[]
}

type EventListener = ((...data: unknown[]) => void) | Function

interface SubscriptionInfo {
  listener: EventListener
  subscription: Subscription
}

export class EventEmitter {
  private readonly eventSubject: Subject<UploadEvent> = new Subject()
  private readonly listenerMap: Map<string, SubscriptionInfo[]> = new Map()

  on(type: string, listener: EventListener): void {
    this.addListener(type, listener)
  }

  once(type: string, listener: EventListener): void {
    this.addListener(type, listener, true)
  }

  off(type: string, listener?: EventListener): void {
    this.removeListener(type, listener)
  }

  emit(type: string, ...data: any[]): void {
    type && this.eventSubject.next({ type, data })
  }

  addListener(type: string, listener: EventListener, once?: boolean): void {
    const list: SubscriptionInfo[] = this.getSubscriptionList(type)
    list.some((i) => i.listener === listener) && this.off(type, listener)

    const subscription = this.eventSubject.pipe(filter((e) => e.type === type)).subscribe({
      next: (e) => {
        once && this.off(type, listener)
        listener(...(e.data || []))
      },
    })

    list.push({ listener, subscription })
  }

  removeListener(type: string, listener?: EventListener): void {
    const list: SubscriptionInfo[] = this.getSubscriptionList(type)
    if (listener) {
      let index = list.findIndex((i) => i.listener === listener)
      index > -1 && list.splice(index, 1)[0].subscription?.unsubscribe()
    } else {
      list.splice(0, list.length).forEach((i) => i.subscription?.unsubscribe())
    }
  }

  private getSubscriptionList(evtType: string): SubscriptionInfo[] {
    const list: SubscriptionInfo[] = this.listenerMap.get(evtType) || []
    !this.listenerMap.has(evtType) && this.listenerMap.set(evtType, list)
    return list
  }
}
