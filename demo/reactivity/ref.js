import { track, trigger } from './effect.js'
import { isObject, hasChanged } from '../shared/src/index.js'
import { reactive, toRaw } from './reactive.js'


const convert = (val) => isObject(val) ? reactive(val) : val

export function isRef(r) {
  return Boolean(r && r.__v_isRef === true)
}

export function ref(value) {
  return createRef(value)
}

class RefImpl {
  __v_isRef = true;
  _rawValue;
  constructor(_rawValue) {
    this._rawValue = _rawValue
    this._value = convert(_rawValue)
  }

  get value() {
    // 触发数据追踪track
    track(toRaw(this), 'get', 'value')
    return this._value
  }

  set value(newVal) {
    if (hasChanged(toRaw(newVal), this._rawValue)) {
      this._rawValue = newVal
      //将新值转化为响应式数据，并调用trigger通知所有的观察者。
      this._value = convert(newVal)
      trigger(toRaw(this), 'set', 'value', newVal)
    }
  }
}

// 核心函数，创建引用，并根据情况创建数据代理
function createRef(rawValue) {
  if (isRef(rawValue)) {
    return rawValue
  }
  // 内除创建ref实例结构，并创建代理
  return new RefImpl(rawValue)
}
