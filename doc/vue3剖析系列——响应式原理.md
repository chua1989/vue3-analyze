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
hander取自baseHandlers(Object和Array类型)和collectionHandlers（Map/Set/WeakMap/WeakSet类型），分别在baseHandlers.ts和collectionHandlers.ts中定义  
内部调用createReactiveObject函数，创建代理数据  

readonly(target)  
和reactive类似，只不过创建只读proxy代理。缓存到readonlyMap  
  
  
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
