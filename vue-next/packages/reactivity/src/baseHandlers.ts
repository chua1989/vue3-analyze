import {
  reactive,
  readonly,
  toRaw,
  ReactiveFlags,
  Target,
  readonlyMap,
  reactiveMap
} from './reactive'
import { TrackOpTypes, TriggerOpTypes } from './operations'
import { track, trigger, ITERATE_KEY } from './effect'
import {
  isObject,
  hasOwn,
  isSymbol,
  hasChanged,
  isArray,
  isIntegerKey,
  extend
} from '@vue/shared'
import { isRef } from './ref'

// 将Symbol对象中的所有属性的值为Symbol类型的值提取出来
// 比如Symbol.match值为Symbol(Symbol.match)，将Symbol(Symbol.match)保存到Set中
const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

// 对于数组的几个查询方法做特殊处理，比如将数组的数据都加入追踪
const arrayInstrumentations: Record<string, Function> = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args: any[]): any {
    const arr = toRaw(this) as any
    // 数组中的每一项数据都添加追踪
    for (let i = 0, l = (this as any).length; i < l; i++) {
      track(arr, TrackOpTypes.GET, i + '')
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
function createGetter(isReadonly = false, shallow = false) {
  return function get(target: Target, key: string | symbol, receiver: object) {
    // 几种特殊的key取值，不做数据追踪
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (
      key === ReactiveFlags.RAW &&
      receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)
    ) {
      // 获取源数据
      return target
    }

    // 如果目标是数组，针对arrayInstrumentations中的几个数组查询操作做特殊处理
    // arrayInstrumentations中对数组中的每一项数据都添加追踪
    const targetIsArray = isArray(target)
    if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }

    const res = Reflect.get(target, key, receiver)

    // key是builtInSymbols中的值或者是“__proto__”或__v_isRef则直接返回结果
    const keyIsSymbol = isSymbol(key)
    if (
      keyIsSymbol
        ? builtInSymbols.has(key as symbol)
        : key === `__proto__` || key === `__v_isRef`
    ) {
      return res
    }

    // 不是只读key,则加入追踪
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }
    // 浅处理，则直接返回
    if (shallow) {
      return res
    }

    // 如果是引用？？？
    if (isRef(res)) {
      // 展开引用 - 不适用于数组+整数键。
      const shouldUnwrap = !targetIsArray || !isIntegerKey(key)
      return shouldUnwrap ? res.value : res
    }

    if (isObject(res)) {
      //将返回值也转换为代理。
      // 我们在此处进行isObject检查，以避免出现无效值警告。
      // 还需要在这里延迟只读访问和响应访问以避免循环依赖。
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

// 核心函数，用来创建handler.set
function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    const oldValue = (target as any)[key]
    if (!shallow) {
      value = toRaw(value)
      // 如果数据不是数组，且旧值是引用，且新值不是引用，直接赋值
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        return true
      }
    } else {
      // 在浅模式下，无论反应与否，对象都按原样设置
    }

    // key的特殊情况：对于数组来说当key为数字时，要判断这个数字是否小于数组长度，大于等于就被认为没有这个key
    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwn(target, key)
    const result = Reflect.set(target, key, value, receiver)
    // 如果目标是原始数据原型链中的某个对象，请勿触发
    if (target === toRaw(receiver)) {
      // 非本身监听的属性更改，触发add,否则触发set
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}

function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}

function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.ownKeys(target)
}

export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  has,
  ownKeys,
  set(target, key) {
    if (__DEV__) {
      console.warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      console.warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}

export const shallowReactiveHandlers: ProxyHandler<object> = extend(
  {},
  mutableHandlers,
  {
    get: shallowGet,
    set: shallowSet
  }
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers: ProxyHandler<object> = extend(
  {},
  readonlyHandlers,
  {
    get: shallowReadonlyGet
  }
)
