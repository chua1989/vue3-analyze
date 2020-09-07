
// 主要WeakMap,存储格式{target-> key-> dep}。
// 从概念上讲，将依赖关系视为维护一组订阅者的Dep类会更容易，
// 但是我们只是将它们存储为原始Set来减少内存开销。
import {isArray, isIntegerKey} from "../../vue-next/packages/shared/src";
import {ITERATE_KEY, TriggerOpTypes} from "../../vue-next/packages/reactivity/src";
import {MAP_KEY_ITERATE_KEY} from "../../vue-next/packages/reactivity/src/effect";

const targetMap = new WeakMap()

const effectStack = []
let activeEffect

/**
 * @desc 包装fn,options为effect数据，初次调用会主动执行一次，数据将加入到effectStack中
 * @param fn
 * @param options
 */
export function effect(fn, options) {
    if (fn._isEffect) {
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

let uid = 0

/**
 * @desc 用当前fn和options创建一个effect,并将之返回
 * 这个返回的effect初次执行时将被设置为activeEffect，并将该effect添加到effectStack的队尾，与之对应的trackStack添加对应的shouldTrack标志
 * @param fn
 * @param options
 */
function createReactiveEffect( fn, options) {
    // 创建effect
    const effect = function reactiveEffect() {
        // 当effect初次执行时将被设置为activeEffect，并将该effect添加到effectStack的队尾，
        // 与之对应的trackStack添加对应的shouldTrack标志
        // 并返回fn()
        if (!effect.active) {
            // 停止响应式数据后，不再执行数据追踪等
            return options.scheduler ? undefined : fn()
        }
        if (!effectStack.includes(effect)) {
            try {
                effectStack.push(effect)
                // 当前effect设置为activeEffect
                // 第一次track被调用时，该effect会被加入effectStack
                activeEffect = effect
                // 执行fn的过程中会对activeEffect做处理
                return fn()
            } finally {
                effectStack.pop()
                activeEffect = effectStack[effectStack.length - 1]
            }
        }
    }
    effect.id = uid++
    effect._isEffect = true
    effect.active = true
    effect.raw = fn
    effect.deps = []
    effect.options = options
    return effect
}

/**
 * @desc: 将target数据存入targetMap中，格式为{target-> key-> dep}
 * 并将activeEffect添加到dep（Set类型）中。【先要调用effect函数添加activeEffect】
 *
 * target为传入的响应式数据对象，type为操作类型，key为target上被追踪的key
 */
export function track(target, type, key) {
    // 当前没有活动中的effect，不需要执行追踪的逻辑
    if (activeEffect === undefined) {
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
    }
}

/**
 * @desc 触发响应,通知观察者
 * @param target
 * @param type
 * @param key
 * @param newValue
 * @param oldValue
 * @param oldTarget
 */
export function trigger(target, type, key, newValue, oldValue, oldTarget) {
    const depsMap = targetMap.get(target)
    if (!depsMap) {
        // never been tracked
        return
    }

    const effects = new Set()
    const add = (effectsToAdd) => {
        if (effectsToAdd) {
            effectsToAdd.forEach(effect => {
                if (effect !== activeEffect) {
                    effects.add(effect)
                }
            })
        }
    }
    // 数组的length更改需要特殊处理
    if (key === 'length' && isArray(target)) {
        depsMap.forEach((dep, key) => {
            if (key === 'length' || key >= newValue) {
                add(dep)
            }
        })
    } else {
        // 计划用来运行 SET | ADD | DELETE
        if (key !== void 0) {
            add(depsMap.get(key))
        }
    }

    const run = (effect) => {
        // 如果有提供scheduler则执行scheduler，否则执行函数本身
        if (effect.options.scheduler) {
            effect.options.scheduler(effect)
        } else {
            effect()
        }
    }

    effects.forEach(run)
}
