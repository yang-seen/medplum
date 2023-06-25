/*
 * Based on: https://developer.mozilla.org/en-US/docs/Web/API/EventTarget
 */

interface Event {
  readonly type: string;
  readonly defaultPrevented?: boolean;
}

type EventListener = (e: Event) => void;

export class EventTarget {
  private readonly listeners: Map<string, EventListener[]>;

  constructor() {
    this.listeners = new Map<string, EventListener[]>();
  }

  addEventListener(type: string, callback: EventListener): void {
    let array = this.listeners.get(type);
    if (!array) {
      array = [];
      this.listeners.set(type, array);
    }
    array.push(callback);
  }

  removeEventListeneer(type: string, callback: EventListener): void {
    const array = this.listeners.get(type);
    if (!array) {
      return;
    }
    for (let i = 0; i < array.length; i++) {
      if (array[i] === callback) {
        array.splice(i, 1);
        return;
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const array = this.listeners.get(event.type);
    if (array) {
      array.forEach((listener) => listener.call(this, event));
    }
    return !event.defaultPrevented;
  }
}
