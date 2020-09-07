import {
    mutableHandlers,
    readonlyHandlers,
    shallowReactiveHandlers,
    shallowReadonlyHandlers
} from './baseHandlers'
import {
    mutableCollectionHandlers,
    readonlyCollectionHandlers,
    shallowCollectionHandlers
} from './collectionHandlers'
import { UnwrapRef, Ref } from './ref'

export const reactiveMap = new WeakMap()


function targetTypeMap(rawType: string) {
    switch (rawType) {
        case 'Object':
        case 'Array':
            return TargetType.COMMON
        case 'Map':
        case 'Set':
        case 'WeakMap':
        case 'WeakSet':
            return TargetType.COLLECTION
        default:
            return TargetType.INVALID
    }
}

function getTargetType(value: Target) {
    return !Object.isExtensible(value)
        ? TargetType.INVALID
        : targetTypeMap(toRawType(value))
}

// 仅解开嵌套ref
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
    // 如果尝试观察只读proxy，则返回只读版本。
    if (target && (target as Target)[ReactiveFlags.IS_READONLY]) {
        return target
    }
    return createReactiveObject(
        target,
        false,
        mutableHandlers,
        mutableCollectionHandlers
    )
}

// 返回一个原始对象的反应式数据拷贝，其中只有根级别属性是反应式的
// 并且不会解开refs，也不会递归转换返回的属性
export function shallowReactive<T extends object>(target: T): T {
    return createReactiveObject(
        target,
        false,
        shallowReactiveHandlers,
        shallowCollectionHandlers
    )
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
    ? T
    : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
: T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
: T extends WeakMap<infer K, infer V>
    ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
: T extends Set<infer U>
    ? ReadonlySet<DeepReadonly<U>>
    : T extends ReadonlySet<infer U>
    ? ReadonlySet<DeepReadonly<U>>
    : T extends WeakSet<infer U>
    ? WeakSet<DeepReadonly<U>>
    : T extends Promise<infer U>
    ? Promise<DeepReadonly<U>>
    : T extends {}
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
: Readonly<T>

// 创建
export function readonly<T extends object>(
    target: T
): DeepReadonly<UnwrapNestedRefs<T>> {
    return createReactiveObject(
        target,
        true,
        readonlyHandlers,
        readonlyCollectionHandlers
    )
}

// 返回一个原始对象的反应式数据拷贝，其中只有根级别属性是只读的
// 并且不会解开引用，也不会递归转换返回的属性。
// 这用于为有状态组件创建props代理对象。
export function shallowReadonly<T extends object>(
    target: T
): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {
    return createReactiveObject(
        target,
        true,
        shallowReadonlyHandlers,
        readonlyCollectionHandlers
    )
}

/**
 * @desc 响应式数据核心函数，对可拓展的对象做proxy代理
 * @param target
 * @param isReadonly
 * @param baseHandlers
 * @param collectionHandlers
 */
function createReactiveObject(
    target: Target,
    isReadonly: boolean,
    baseHandlers: ProxyHandler<any>,
    collectionHandlers: ProxyHandler<any>
) {
    if (!isObject(target)) {
        if (__DEV__) {
            console.warn(`value cannot be made reactive: ${String(target)}`)
        }
        return target
    }
    // 已经代理，则直接返回
    //例外：在反应对象上调用readonly（）
    if (
        target[ReactiveFlags.RAW] &&
        !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
    ) {
        return target
    }
    // 目标已经有相应的代理
    const proxyMap = isReadonly ? readonlyMap : reactiveMap
    const existingProxy = proxyMap.get(target)
    if (existingProxy) {
        return existingProxy
    }
    // 只能观察类型在白名单中的数据类型。
    // 即Object'、'Array'、'Map'、'Set'、'WeakMap''WeakSet':
    const targetType = getTargetType(target)
    if (targetType === TargetType.INVALID) {
        return target
    }
    const proxy = new Proxy(
        target,
        targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers
    )
    proxyMap.set(target, proxy)
    return proxy
}


export function toRaw(observed) {
    return (
        (observed && toRaw(observed['__v_raw'])) || observed
    )
}
