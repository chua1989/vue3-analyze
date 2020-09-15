文档：[Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)  
基本使用就不赘述，看文档即可  

## 通用  
1.Proxy可以包装任何形式的对象：包括原生数组，函数，甚至另一个代理  
2.代理实例中没有指定的handler,实际就是操作原对象target：[实例：打开控制台查看](http://jsrun.net/3RLKp/edit)  
``` 
let target = function(){return 'ddd'}
let proxy = new Proxy(target, {});
proxy.prototype.age = 12
console.log(proxy.prototype === target.prototype) // true
```
3.代理实例只是返回对象target的一个代理包装(只有在触发handler时，handler中可以操作target)，target的更改不会触发代理实例的handler：[实例：打开控制台查看](http://jsrun.net/7BLKp/edit)  

来看一下具体的运用    
MDN上有一个实例比较特别【拓展构造函数】，来看一下：[在线例子](http://jsrun.net/cRLKp/edit)     
``` 
function extend(sup, base) {
  var descriptor = Object.getOwnPropertyDescriptor(
    base.prototype, 'constructor'
  );
  base.prototype = Object.create(sup.prototype);
  var handler = {
    construct: function(target, args) {
      var obj = Object.create(base.prototype);
      this.apply(target, obj, args);
      return obj;
    },
    apply: function(target, that, args) {
      sup.apply(that, args);
      base.apply(that, args);
    }
  };
  var proxy = new Proxy(base, handler);
  descriptor.value = proxy;
  Object.defineProperty(base.prototype, 'constructor', descriptor);
  return proxy;
}

var Person = function(name) {
  this.name = name;
};

var Boy = extend(Person, function(name, age) {
  this.age = age;
});

Boy.prototype.gender = 'M';

var Peter = new Boy('Peter', 13);

console.log(Peter.gender);  // "M"
console.log(Peter.name);    // "Peter"
console.log(Peter.age);     // 13
```
执行完Boy.prototype.gender = 'M'后，数据结构是下面这个样子的   
![proxy-constructor1.png](./proxy-constructor1.png)
执行 var Peter = new Boy('Peter', 13);  
new操作进入到handler.construct，里面的上下文环境this绑定在handler（可以查看MDN文档描述）。直接调用this.apply进入handler.apply执行。new操作执行完毕之后的数据结构  
![proxy-constructor2.png](./proxy-constructor2.png)   
巧妙利用原型链和代理     
 


### handler形参中的receiver  
receiver是代理或继承代理的对象。通俗来讲，就是触发了handler的源头对象。一般receiver即是target的代理实例。  
但是如果对象继承了代理对象的情况，如下:  
``` 
"use strict"
const proxy = new Proxy({}, {
    get: function(target, prop, receiver) {
        if(proxy === receiver){
            console.log('receiver为proxy')
        }
        else if(obj === receiver){
            console.log('receiver为obj')
        }else{
            console.log('receiver不为proxy也不为obj')
        }
        return 'chua';
    }
});
proxy.dd // receiver为proxy
let obj = Object.create(proxy);
obj.msg // receiver为obj
```
proxy对象是obj对象的原型，obj对象本身并没有msg属性，所以根据原型链，会在proxy对象上读取该属性，导致被拦截。   
obj是obj.msg触发handler的原始调用（源头）
  
## handler.set

### set必须返回一个boolean类型  
必须返回一个boolean类型，true表示设置成功，返回false表示失败，严格模式下会抛错(下面的例子全部在严格模式下执行)  
**注意：**返回的数据如果不是boolean类型，会转换成布尔类型，假值包括：<font color="red">undefined，null，false, +0, -0, NaN, "" </font> ：[实例](http://jsrun.net/nRLKp/edit)       
``` 
const target = {
  msg: "hello"
};

const handler = {
    set: function(target, prop, value, receiver){
        target[prop] = value
        // return true
    }
};

const proxy = new Proxy(target, handler);
proxy.msg = 'wow' // Uncaught TypeError: 'set' on proxy: trap returned falsish for property 'msg'
```
handler.set在以下情况会抛错  
1.如果相应的目标对象属性是不可写的数据属性，则无法将属性的值更改为与相应目标对象属性的值不同的值。[实例:严格模式](http://jsrun.net/tRLKp/edit)
```
var obj = {}
Object.defineProperty(obj, 'year', { 
    // configurable: false, 默认false
    // writable: false, 默认false
    value: 2
})
Object.defineProperty(obj, 'class', { 
    configurable: true, 
    // writable: false, 默认false
    value: 'chua'
})
var proxy = new Proxy(obj, {
    set(target, prop, val){
        target[prop] = val
        return true
    }
})
proxy.card = 'sdf' // 设置成功
proxy.year = 10 // Uncaught TypeError: Cannot assign to read only property 'year' of object 
proxy.class = 'dd' // Uncaught TypeError: Cannot assign to read only property 'class' of object
```
2.如果相应的目标对象属性配置了[[Set]]为undefined，[实例](http://jsrun.net/GRLKp/edit)  
``` 
var obj = {}
const defineReactive =  function(data, key, val) {
    Object.defineProperty(data, key, {
        get: function(){
            return val
        },
        set: undefined // 应该设置成下面这个正确的函数
        // function(newVal) {
        //     val = newVal;
        // }
    });
}
defineReactive(obj, 'year', obj.year)
var proxy = new Proxy(obj, {
    set(target, prop, val){
        target[prop] = val
        return true
    }
})
obj.year = 20 // Uncaught TypeError: Cannot set property year of #<Object> which has only a getter
proxy.year = 30 // Uncaught TypeError: Cannot set property year of #<Object> which has only a getter
```
3.在严格模式下，handler.set错误返回值(转换为boolean后为false)将引发TypeError异常。
  
  
  
### 复杂对象 
Proxy只对其根属性（原型链上的也算）的值的更改做监听，如果某个属性key对应的值为一个引用类型，引用地址没有发生改变则不会进入到handler.set  
``` 
const target = {
    info: {
        name: 'chua',
        age: 18
    }
};

const handler = {
    set: function(target, prop, value, receiver){
        console.log('in handler.set', target, prop, value, receiver)
        target[prop] = value
        return true
    }
};

const proxy = new Proxy(target, handler);
proxy.info.name = 'chua1989' // 没有进入handler.set, 需要直接更改info属性才行
console.log(proxy.info.name) // chua1989
```  

## handler.has
报错的情况  
1.target的某属性为不可配置，则该属性不能被代理隐藏（即handle.has不能返回false）: [在线运行](http://jsrun.net/FMLKp/edit)  
``` 
var obj = {}
Object.defineProperty(obj, 'year', {
    configurable: false,
    value: 2
})
var proxy = new Proxy(obj, {
    has: function(target, prop) {
        console.log('called: ' + prop);
        return false;
    }
})
console.log('year' in proxy); // Uncaught TypeError: 'has' on proxy: trap returned falsish for property 'year' which exists in the proxy target as non-configurable
```
2.target对象不可拓展，则已经存在的属性不能被代理隐藏：[在线运行](http://jsrun.net/JMLKp/edit)  
``` 
var obj = { year: 2}
Object.preventExtensions(obj);

var proxy = new Proxy(obj, {
    has: function(target, prop) {
        console.log('called: ' + prop);
        return false;
    }
})
console.log('a' in proxy); // 不存在的属性没有问题
console.log('year' in proxy); // Uncaught TypeError: 'has' on proxy: trap returned falsish for property 'year' but the proxy target is not extensible
```
  
## handler.construct
只有当target能使用new方法该配置才能起作用。即target必须是函数   
``` 
const p = new Proxy({}, {
    construct: function(target, argumentsList, newTarget) {
        return function(){};
    }
});

new p(); // proxy.html:16 Uncaught TypeError: p is not a constructor
```
而且handler.construct必须返回一个Object[引用类型就行](这是new函数的特性)   
``` 
const p = new Proxy(function() {}, {
  construct: function(target, argumentsList, newTarget) {
    return 1;
  }
});

new p(); // TypeError is thrown
```
下面这个就不会报错 
``` 
const p = new Proxy(function() {}, {
    construct: function(target, argumentsList, newTarget) {
        return function(){};
    }
});

new p();
```
handler.construct中的this指向的是handler  
  
  
## handler.deleteProperty 
deleteProperty 必须返回一个 Boolean 类型的值，表示了该属性是否被成功删除。严格模式下false会报错    
``` 
var p = new Proxy({}, {
    deleteProperty: function(target, prop) {
        console.log('called: ' + prop);
        return false;
    }
});

delete p.a; // "called: a"
```
如果目标对象的属性是不可配置的，那么该属性不能被删除  
``` 
var obj = {}
Object.defineProperty(obj, 'a', {
    configurable: false
})
var p = new Proxy(obj, {
    deleteProperty: function(target, prop) {
        console.log('called: ' + prop);
        return true;
    }
});

delete p.a; // "called: a" // Uncaught TypeError: 'deleteProperty' on proxy: trap returned truish for property 'a' which is non-configurable in the proxy target
```  

## handler.defineProperty
如果目标对象不可扩展（non-extensible），则defineProperty()不能增加目标对象上不存在的属性，否则会报错。  
如果目标对象的某个属性不可写（writable）或不可配置（configurable），则defineProperty()方法不得改变这两个设置(这是Object.defineProperty的特性)。  


## handler.getPrototypeOf  
如果遇到了下面两种情况，JS 引擎会抛出 TypeError 异常：  
getPrototypeOf() 方法返回的不是对象也不是 null。
目标对象是不可扩展的，且 getPrototypeOf() 方法返回的原型不是目标对象本身的原型。
  
## handler.isExtensible
isExtensible方法必须返回一个 Boolean值或可转换成Boolean的值。  
Object.isExtensible(proxy) 必须同Object.isExtensible(target)返回相同值。也就是必须返回true或者为true的值,返回false和为false的值都会报错。  
  
## handler.ownKeys
有三类属性会被ownKeys()方法自动过滤，不会返回。  
1.目标对象上不存在的属性  
2.属性名为 Symbol 值  
3.不可遍历（enumerable）的属性  
  
如果违反了下面的约束，proxy将抛出错误 TypeError:  
1.ownKeys 的结果必须是一个数组.  
2.数组的元素类型要么是一个 String ，要么是一个 Symbol.   
3.结果列表必须包含目标对象的所有不可配置（non-configurable ）、自有（own）属性的key.  
4.如果目标对象不可扩展，那么结果列表必须包含目标对象的所有自有（own）属性的key，不能有其它值.     

## handler.preventExtensions
如果目标对象是可扩展的，那么只能返回 false。否则抛错  


## handler.setPrototypeOf
如果 target 不可扩展, 原型参数必须与Object.getPrototypeOf(target) 的值相同. 否则抛错   
如果你不想为你的对象设置一个新的原型，你的handler's的setPrototypeOf方法可以返回false，也可以抛出异常。  
``` 
var handlerReturnsFalse = {
    setPrototypeOf(target, newProto) {
        return false;
    }
};

var newProto = {}, target = {};

var p1 = new Proxy(target, handlerReturnsFalse);
Object.setPrototypeOf(p1, newProto); // throws a TypeError
Reflect.setPrototypeOf(p1, newProto); // returns false
```
为什么Object和Reflect调用setPrototypeOf结果会不同。这便是Reflect被例入标准的一个原因之一：操作对象时出现报错返回false。这样可以直接使用如下的方式     
``` 
if(Reflect.setPrototypeOf(p1, newProto)){
 ...
}
```  

## handler的属性方法中的this  
- 正常情况，handler的属性方法中this指向的是proxy实例，而不是target,要特别注意   
``` 
const target = new Date();
const handler = {};
const proxy = new Proxy(target, handler);

proxy.getDate();
// TypeError: this is not a Date object.
```
由于getDate必须要是Date实例才能有作用，所以此处报错  
- handler.construct中的this指向的是handler   






## 参考：  
[MDN: Proxy](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Proxy)  
[阮一峰：ECMAScript 6 入门：Proxy](https://es6.ruanyifeng.com/#docs/proxy)，里面有些例子很有意思    
