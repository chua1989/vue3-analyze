import { effect, trigger, track } from './effect.js'
import { isFunction, NOOP } from '../shared/src/index.js'
import { toRaw } from './reactive.js'


class ComputedRefImpl {
  _value;
  _dirty = true;
  effect;
  __v_isRef = true;
  __v_isReadonly;
  _setter;
  constructor(getter, setter, isReadonly) {
    this._setter = setter
    this.effect = effect(getter, {
      lazy: true,
      scheduler: () => {
        // 这个函数在计算属性执行setter时，依赖的数据执行对应的setter,从依赖数据的观察者中获取出来执行
        // scheduler函数和作用函数effect二选一执行，scheduler优先
        // 由于计算属性提供了scheduler函数，所以回进入该函数体，将数标记为脏值（和缓存的值不同）
        if (!this._dirty) {
          // 标记为脏数据，并触发通知观察者执行set
          this._dirty = true
          trigger(toRaw(this), 'set', 'value')
        }
      }
    })
    this.__v_isReadonly = isReadonly
  }

  get value() {
    // 获取数据的时候，先看数据是否脏值（即有赋为新值，和缓存的值不同）
    // 有脏值，则以脏值为准，并缓存脏值为value,同时去掉脏值标记
    if (this._dirty) {
      this._value = this.effect()
      this._dirty = false
    }
    track(toRaw(this), 'get', 'value')
    return this._value
  }

  set value(newValue) {
    this._setter(newValue)
  }
}

export function computed( getterOrOptions ) {
  let getter
  let setter

  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
    setter = NOOP
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  return new ComputedRefImpl(
    getter,
    setter,
    isFunction(getterOrOptions) || !getterOrOptions.set
  )
}
