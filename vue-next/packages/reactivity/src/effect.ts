import { TrackOpTypes, TriggerOpTypes } from './operations'
import { EMPTY_OBJ, isArray, isIntegerKey } from '@vue/shared'

// 主要WeakMap,存储格式{target-> key-> dep}。
// 从概念上讲，将依赖关系视为维护一组订阅者的Dep类会更容易，
// 但是我们只是将它们存储为原始Set来减少内存开销。
type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<any, Dep>
const targetMap = new WeakMap<any, KeyToDepMap>()

export interface ReactiveEffect<T = any> {
  (): T
  _isEffect: true
  id: number
  active: boolean
  raw: () => T
  deps: Array<Dep>
  options: ReactiveEffectOptions
}

export interface ReactiveEffectOptions {
  lazy?: boolean
  scheduler?: (job: ReactiveEffect) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export type DebuggerEvent = {
  effect: ReactiveEffect
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
} & DebuggerEventExtraInfo

export interface DebuggerEventExtraInfo {
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

const effectStack: ReactiveEffect[] = []
let activeEffect: ReactiveEffect | undefined

export const ITERATE_KEY = Symbol(__DEV__ ? 'iterate' : '')
export const MAP_KEY_ITERATE_KEY = Symbol(__DEV__ ? 'Map key iterate' : '')

// 判断数是否已经是响应式数据
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn && fn._isEffect === true
}

/**
 * @desc 包装fn,options为effect数据，初次调用会主动执行一次，数据将加入到effectStack中
 * @param fn
 * @param options
 */
export function effect<T = any>(fn: () => T, options: ReactiveEffectOptions = EMPTY_OBJ): ReactiveEffect<T> {
  if (isEffect(fn)) {
    fn = fn.raw
  }
  // fn初次进入创建反应式数据，返回的effect是一个函数
  const effect = createReactiveEffect(fn, options)
  // 不是lazy立马执行一次，(lazy effect主要用于computed)
  if (!options.lazy) {
    // 立马执行，加入到effectStack
    effect()
  }
  return effect
}

// 停止响应式数据
export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect)
    if (effect.options.onStop) {
      effect.options.onStop()
    }
    effect.active = false
  }
}

let uid = 0

/**
 * @desc 用当前fn和options创建一个effect,并将之返回
 * 这个返回的effect初次执行时将被设置为activeEffect，并将该effect添加到effectStack的队尾，与之对应的trackStack添加对应的shouldTrack标志
 * @param fn
 * @param options
 */
function createReactiveEffect<T = any>( fn: () => T, options: ReactiveEffectOptions): ReactiveEffect<T> {
  // 创建effect
  const effect = function reactiveEffect(): unknown {
    // 当effect初次执行时将被设置为activeEffect，并将该effect添加到effectStack的队尾，
    // 与之对应的trackStack添加对应的shouldTrack标志
    // 并返回fn()
    if (!effect.active) {
      return options.scheduler ? undefined : fn()
    }
    if (!effectStack.includes(effect)) {
      // 清理残留
      cleanup(effect)
      try {
        enableTracking()
        effectStack.push(effect)
        // 当前effect设置为activeEffect
        // 第一次track被调用时，该effect会被加入effectStack
        activeEffect = effect
        return fn()
      } finally {
        effectStack.pop()
        resetTracking()
        activeEffect = effectStack[effectStack.length - 1]
      }
    }
  } as ReactiveEffect
  effect.id = uid++
  effect._isEffect = true
  effect.active = true
  effect.raw = fn
  effect.deps = []
  effect.options = options
  return effect
}

// 清理effect的deps数组中每一项元素的effect数据
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}

let shouldTrack = true
const trackStack: boolean[] = []

export function pauseTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

export function enableTracking() {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

export function resetTracking() {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * @desc: 将target数据存入targetMap中，格式为{target-> key-> dep}
 * 并将activeEffect添加到dep（Set类型）中。【先要调用effect函数添加activeEffect】
 *
 * target为传入的响应式数据对象，type为操作类型，key为target上被追踪的key
 */
export function track(target: object, type: TrackOpTypes, key: unknown) {
  // 如果shouldTrack为false 或者 当前没有活动中的effect，不需要执行追踪的逻辑
  // shouldTrack为依赖追踪提供一个全局的开关，可以很方便暂停/开启，比如用于setup以及生命周期执行的时候
  if (!shouldTrack || activeEffect === undefined) {
    return
  }
  // 所有响应式数据都是被封装的对象，所以用一个Map来保存更方便，Map的key为响应式数据的对象
  // 存储格式{target-> key-> dep}。
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }
  // 同样为每个响应式数据按key建立一个Set，用来保存target[key]所影响的effects
  let dep = depsMap.get(key)
  if (!dep) {
    // 用一个Set去保存effects，省去了去重的判断
    depsMap.set(key, (dep = new Set()))
  }

  if (!dep.has(activeEffect)) {
    // 如果target[key]下面没有当前活动中的effect，就把这个effect加入到这个deps中
    // 结合effect函数可以知道activeEffect在effect函数初次调用时会创建
    dep.add(activeEffect)
    activeEffect.deps.push(dep)
    if (__DEV__ && activeEffect.options.onTrack) {
      activeEffect.options.onTrack({
        effect: activeEffect,
        target,
        type,
        key
      })
    }
  }
}

/**
 * @desc 触发响应
 * @param target
 * @param type
 * @param key
 * @param newValue
 * @param oldValue
 * @param oldTarget
 */
export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }

  const effects = new Set<ReactiveEffect>()
  const add = (effectsToAdd: Set<ReactiveEffect> | undefined) => {
    if (effectsToAdd) {
      effectsToAdd.forEach(effect => {
        if (effect !== activeEffect) {
          effects.add(effect)
        }
      })
    }
  }

  if (type === TriggerOpTypes.CLEAR) {
    // 集合已经被清除
    // 触发目标的所有效果
    depsMap.forEach(add)
  } else if (key === 'length' && isArray(target)) {
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        add(dep)
      }
    })
  } else {
    // 计划用来运行 SET | ADD | DELETE
    if (key !== void 0) {
      add(depsMap.get(key))
    }
    // 运行 ADD | DELETE | Map.SET 的迭代key
    const shouldTriggerIteration =
      (type === TriggerOpTypes.ADD &&
        (!isArray(target) || isIntegerKey(key))) ||
      (type === TriggerOpTypes.DELETE && !isArray(target))
    if (
      shouldTriggerIteration ||
      (type === TriggerOpTypes.SET && target instanceof Map)
    ) {
      add(depsMap.get(isArray(target) ? 'length' : ITERATE_KEY))
    }
    if (shouldTriggerIteration && target instanceof Map) {
      add(depsMap.get(MAP_KEY_ITERATE_KEY))
    }
  }

  const run = (effect: ReactiveEffect) => {
    if (__DEV__ && effect.options.onTrigger) {
      effect.options.onTrigger({
        effect,
        target,
        key,
        type,
        newValue,
        oldValue,
        oldTarget
      })
    }
    if (effect.options.scheduler) {
      effect.options.scheduler(effect)
    } else {
      effect()
    }
  }

  effects.forEach(run)
}
