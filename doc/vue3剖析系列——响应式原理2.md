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


### ref.ts   
功能：基本类型转化为引用对象，并且如果value是引用类型，则生成对应的响应式数据。避免值传递导致响应丢失  
接受一个参数值并返回一个响应式且可改变的 ref 对象。ref 对象拥有一个指向内部值的单一属性 .value  
简单例子   
  ``` 
  import { ref } from 'vue'
  const count = ref(0)
  console.log(count.value) // 0
  
  count.value++
  console.log(count.value) // 1
  ```
  
  
主要函数对外暴露的接口  
ref(value),shallowRef(value)
ref创建的对象是RefImpl类的实例，RefIml类提供了get/set value的方法，在调用getter时，触发数据追踪track,
在调用setter时，将新值转化为响应式数据，并调用trigger通知所有的观察者。  
注意ref实例都有一个**__v_isRef**标志，用来识别是否是ref类型   
``` 
export function ref(value?: unknown) {
  return createRef(value)
}
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}
class RefImpl<T> {
  private _value: T

  public readonly __v_isRef = true

  constructor(private _rawValue: T, private readonly _shallow = false) {
    this._value = _shallow ? _rawValue : convert(_rawValue)
  }

  get value() {
    // 触发数据追踪track
    track(toRaw(this), TrackOpTypes.GET, 'value')
    return this._value
  }

  set value(newVal) {
    if (hasChanged(toRaw(newVal), this._rawValue)) {
      this._rawValue = newVal
      //将新值转化为响应式数据，并调用trigger通知所有的观察者。
      this._value = this._shallow ? newVal : convert(newVal)
      trigger(toRaw(this), TriggerOpTypes.SET, 'value', newVal)
    }
  }
}

// 核心函数，创建引用，并根据情况创建数据代理
function createRef(rawValue: unknown, shallow = false) {
  if (isRef(rawValue)) {
    return rawValue
  }
  // 内除创建ref实例结构，并创建代理
  return new RefImpl(rawValue, shallow)
}
```  
根据上面的处理可以知道，如果只使用ref，get/set ref的值，本身不是响应式的。需要配合reactive或者computed使用。
比如下面的例子  
``` 
const count = ref(0)
const state = reactive({
  count,
})
console.log(state.count) // 0
state.count = 1
console.log(count.value) // 1
```
数据结构和流程大致如下  

  
toRef<T extends object, K extends keyof T>(object: T,key: K): Ref<T[K]>  
和ref函数类似，不过value替代已有的key。返回ObjectRefImpl的实例  

toRefs<T extends object>(object: T): ToRefs<T>  
将对象的所有的key都转成ref类型（对应的ObjectRefImpl的实例）。


proxyRefs<T extends object>(objectWithRefs: T)  
对ref类型进行代理，getter时会自动解开ref包裹，返回ref的原始值  
setter时，特殊处理ref包裹  

customRef<T>(factory: CustomRefFactory<T>): Ref<T>   
自定义ref类型，使用提供factory，factory有两个形参，并返回get set
``` 
class CustomRefImpl<T> {
  ...
  constructor(factory: CustomRefFactory<T>) {
    const { get, set } = factory(
      () => track(this, TrackOpTypes.GET, 'value'),
      () => trigger(this, TriggerOpTypes.SET, 'value')
    )
    this._get = get
    this._set = set
  }
  
  get value() {
    return this._get()
  }
  ...
}
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  return new CustomRefImpl(factory) as any
}
```

triggerRef(ref: Ref)   
顾名思义，触发通知观察者  


### computed.ts 
计算属性

computed<T>(getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>)    
传入一个 getter 函数，返回一个默认不可手动修改的 ref 对象。  
``` 
const count = ref(1)
const plusOne = computed(() => count.value + 1)

console.log(plusOne.value) // 2

plusOne.value++ // 错误！
```
或者传入一个拥有 get 和 set 函数的对象，创建一个可手动修改的计算状态  
``` 
const count = ref(1)
const plusOne = computed({
  get: () => count.value + 1,
  set: (val) => {
    count.value = val - 1
  },
})

plusOne.value = 1
console.log(count.value) // 0
```
实现原理  
计算属性返回的是一个ComputedRefImpl类的实例computedObject，提供了对value的getter/setter，
实例一开始将_dirty标记为true,表示数据是脏数据，和缓存的数据不一致，取值时应该以脏数据为准。  
构造函数调用时调生成一个lazy的作用函数（effect函数）,传入了scheduler 
当获取computedObject.value时，执行并返回作用函数的执行结果（一般来说就是computed函数的实参getter函数的结果），
并将_dirty标记为false,表示已经用过了，值已经缓存，不是脏数据了，下次再获取直接拿缓存结果。  
当设置computedObject.value时（readonly除外），调用computed的setter函数，执行里面的代码，如果里面有给反应式数据赋值，
将触发依赖的setter,从而触发作用函数内部执行scheduler，将_dirty标记为true，表示数据已经是脏值。
