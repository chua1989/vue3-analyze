# 响应式原理
源码目录：https://github.com/vuejs/vue-next/tree/master/packages/reactivity  

## 模块
ref：   
reactive：  
computed：  
effect：  
operations：提供TrackOpTypes和TriggerOpTypes两个枚举类型，供其他模块使用

## 剖析
详细剖析每一个模块的功能  

### Vue2响应式原理
在vue2中的相应式原理：https://www.cnblogs.com/chuaWeb/articles/13554465.html
大概的逻辑是这几个模块Observer，Watcher，Dep。
Observer负责通过defineProperty劫持数据Data，每个被劫持的Data都各自在闭包中维护一个Dep的实例，用于收集依赖着它的Watcher（都实现了一个update方法），被收集的Watcher存入Dep实例的subs数组中。如果Data是对象，则递归搜集。  
Dep维护一个公共的Target属性，在触发劫持前，将Target设置为当前Watcher, 然后触发getter将Target（Watcher）收集到subs中。然后再将Target置为null  
Data数据变更的时候触发setter,然后从Data维护的Dep实例的subs数组中将Watcher取出来一一执行其update方法。如果变更的值是数组，再劫持之。  

就上面的过程，实际上还是有比较大的问题  
首先，如果Watcher使用的Data是对象类型，那么Data中所有的递归子属性都需要将Watcher收集，这是个资源浪费。  
其次，对数组的劫持也没有做好，部分操作不是相应式的。  


### effect.ts  
主要函数有  
  
track(target, type, key)  
添加追踪数据，所有的target数据都被缓存到targetMap中以{target-> key-> dep}格式存储，优化内存开销。  
并收集激活的反应式数据activeEffect（在调用effect函数时会激活），添加到dep中  
当前target的dep数据也会被activeEffect收集（push到activeEffect.deps）
  
effect(fn, options):ReactiveEffect   
工厂函数，返回一个反应式数据：ReactiveEffect函数。执行ReactiveEffect即可将数据加入可追踪队列effectStack，并将当前数据设置为activeEffect，并执行fn。  
      
trigger(target, type, key, newValue, oldValue, oldTarget)      
触发target上的响应式数据，即target-> key-> dep中存放的数据（全部key的），全部一一取出来执行  


### reactive.ts 
反应式数据保存在reactiveMap和readonlyMap中，便于存取（已经存在的，直接读取）  
只能对可拓展的对象才能做proxy代理，并存入reactiveMap或readonlyMap中  
  
reactive(target)    
对target数据进行proxy代理，存入reactiveMap中,返回代理后的数据  
handler取自baseHandlers(Object和Array类型)和collectionHandlers（Map/Set/WeakMap/WeakSet类型），分别在baseHandlers.ts和collectionHandlers.ts中定义  
内部调用createReactiveObject函数，创建代理数据  

readonly(target)  
和reactive类似，只不过创建只读proxy代理。缓存到readonlyMap  
  
shallowReactive(target)  
对target进行浅反应式数据代理，proxy的handler取自shallowReactiveHandlers和shallowCollectionHandlers  
其中只有根级别属性是反应式的

shallowReadonly(target)   
返回一个原始对象的反应式数据拷贝，其中只有根级别属性是只读的。
并且不会解开引用，也不会递归转换返回的属性。
这用于为有状态组件创建props代理对象。
   
上面这些创建代理数据都通过调用核心函数createReactiveObject得到，createReactiveObject中使用Proxy做代理，逻辑还比较简单的，读一下就明白  
   

### baseHandlers.ts  
这个函数主要是对proxy代理的handler做通用处理  
  
createGetter(isReadonly = false, shallow = false)  
一个工厂函数，用来创建handler.get。get/shallowGet/readonlyGet/shallowReadonlyGet都是使用createGetter创建  
内部调用readonly或reactive做代理  
目前只有当key对应的value值是对象的情况才做proxy代理  
但是有几种情况不需要做代理：  
1.几个特殊key,  ReactiveFlags.IS_REACTIVE/IS_READONLY/RAW   
2.数组中['includes', 'indexOf', 'lastIndexOf']几个属性  
3.key是builtInSymbols（Symbol对象的属性value中属于Symbol类型的几个值）中的值或者是__proto__或__v_isRef则直接返回结果  
4.浅处理（shallow为true），浅处理只是加入了track,但是没有做反应式代理  
5.key对应的value值是引用的情况  


createSetter(shallow = false)  
一个工厂函数，用来创建handler.set。set/shallowSet都是用createSetter创建。内部通过调用trigger来通知所有的观察者  
里面有几个特殊处理。  
对于非浅反应式数据（即非shallowReactive创建代理），如果数据不是数组，且旧值是引用，且新值不是引用，直接赋值，不通知观察者响应  
```
const oldValue = (target as any)[key]
if (!shallow) {
  ...
  // 如果数据不是数组，且旧值是引用，且新值不是引用，直接赋值
  if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }
} else {
  // 在浅模式下，无论反应与否，对象都按原样设置
}
```
目前不清楚这样做的目的：可能考虑到某个属性本身是一个引用类型（对象），在监听过程这种，不应该从引用类型更改成基本类型  
还有一个特殊处理，如果target是原始数据原型链上的某个对象，不触发  
```
Array.prototype.tt = 'chua'
var arr = [];
var pr = new Proxy(arr, {
    set(target, key, val, receiver){
        target[key] = val
        console.log('set', key, val)
        return true
    }
})
pr.tt = 'yang'
```
打印结果  
```
set tt yang
```
反应式数据只处理对象本身的数据，原型链上的数据不处理。  

而且，如果key不是target本身的属性（比如原型链上的属性或者没有），则触发ADD,否则触发SET。
举个例子，数组的原型链上的方法push在执行的时候，会进handler.set两次，一次push本身，一次是设置length。
```
var arr = [];
var pr = new Proxy(arr, {
    set(target, key, val, receiver){
        target[key] = val
        console.log('set', key, val)
        return true
    }
})
pr.push(1)
```
打印结果  
```
set 0 1
set length 1
```
第一次，target上么有key为0的属性，触发了ADD，第二次则触发SET。源码逻辑如下  
``` 
// key的特殊情况：对于数组来说当key为数字时，要判断这个数字是否小于数组长度，
// 大于等于就被认为没有这个key
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
```
  
deleteProperty(target, key)   
删除对象的属性，内部通过调用trigger通知所有的观察者



### ref
对外暴露的接口  
  ref,
  shallowRef,
  isRef,
  toRef,
  toRefs,
  unref,
  proxyRefs,
  customRef,
  triggerRef,
  Ref,
  ToRefs,
  UnwrapRef,
  ShallowUnwrapRef,
  RefUnwrapBailTypes  
