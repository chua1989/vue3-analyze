import {
    mutableHandlers
} from './baseHandlers.js'

import {isObject} from "../shared/src/index.js";

export const reactiveMap = new WeakMap()

export function reactive(target) {
    return createReactiveObject(
        target,
        false,
        mutableHandlers
    )
}

/**
 * @desc 响应式数据核心函数，对可拓展的对象做proxy代理
 * @param target
 * @param isReadonly
 * @param baseHandlers
 */
function createReactiveObject(target, isReadonly, baseHandlers) {
    if (!isObject(target)) {
        return target
    }
    // 已经代理，则直接返回
    // 这里面有个bug，没有地方给target设置__v_raw属性
    if (target['__v_raw']) {
        return target
    }
    // 目标已经有相应的代理
    const existingProxy = reactiveMap.get(target)
    if (existingProxy) {
        return existingProxy
    }

    const proxy = new Proxy(
        target,
        baseHandlers
    )
    reactiveMap.set(target, proxy)
    return proxy
}


export function toRaw(observed) {
    return (
        (observed && toRaw(observed['__v_raw'])) || observed
    )
}
