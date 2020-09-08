import {
  reactive,
  toRaw,
} from './reactive.js'
import { track, trigger } from './effect.js'
import {
  hasOwn,
  hasChanged,
  isArray,
  isIntegerKey,
} from '../shared/src/index.js'
import {isRef} from "./ref.js";


const get = /*#__PURE__*/ createGetter()

// 对于数组的几个查询方法做特殊处理，比如将数组的数据都加入追踪
const arrayInstrumentations = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args){
    const arr = toRaw(this)
    // 数组中的每一项数据都添加追踪
    for (let i = 0, l = this.length; i < l; i++) {
      track(arr, 'get', i + '')
    }
    // 我们首先使用原始args运行该方法（可能是反应性的）
    const res = arr[key](...args)
    if (res === -1 || res === false) {
      // 如果那不起作用，请使用原始值再次运行它。
      return arr[key](...args.map(toRaw))
    } else {
      return res
    }
  }
})

// 核心函数，用来创建handler.get
function createGetter() {
  return function get(target, key, receiver) {
    // 如果目标是数组，针对arrayInstrumentations中的几个数组查询操作做特殊处理
    // arrayInstrumentations中对数组中的每一项数据都添加追踪
    const targetIsArray = isArray(target)
    if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }

    const res = Reflect.get(target, key, receiver)

    // 不是只读key,则加入追踪
    track(target, 'get', key)

    // 如果是引用，在数据是ref配合reactive/computed使用时进入
    if (isRef(res)) {
      // 展开引用 - 不适用于数组+整数键。
      const shouldUnwrap = !targetIsArray || !isIntegerKey(key)
      return shouldUnwrap ? res.value : res
    }

    if (typeof res === 'object') {
      //将返回值也转换为代理。
      // 我们在此处进行isObject检查，以避免出现无效值警告。
      // 还需要在这里延迟只读访问和响应访问以避免循环依赖。
      return reactive(res)
    }

    return res
  }
}

const set = /*#__PURE__*/ createSetter()

// 核心函数，用来创建handler.set
function createSetter(shallow = false) {
  return function set(target, key, value, receiver) {
    const oldValue = target[key]

    value = toRaw(value)
    // 如果数据不是数组，且旧值是引用，且新值不是引用，直接赋值
    if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
      // 专门处理ref数据
      oldValue.value = value
      return true
    }

    // key的特殊情况：对于数组来说当key为数字时，要判断这个数字是否小于数组长度，大于等于就被认为没有这个key
    const hadKey =
        Array.isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // 如果目标是原始数据原型链中的某个对象，请勿触发
    if (target === toRaw(receiver)) {
      // 非本身监听的属性更改，触发add,否则触发set
      if (!hadKey) {
        trigger(target, 'add', key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, 'set', key, value, oldValue)
      }
    }
    return result
  }
}
export const mutableHandlers = {
  get,
  set,
  // deleteProperty,
  // has,
  // ownKeys
}
