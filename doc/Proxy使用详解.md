文档：[Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy)  
基本使用就不赘述，看文档即可  

## handler.set
---
必须返回一个boolean类型，true表示设置成功，返回false表示失败，严格模式下会抛错(下面的例子全部在严格模式下执行)  
**注意：**返回的数据如果不是boolean类型，会转换成布尔类型，假值包括：<font color="red">undefined，null，false, +0, -0, NaN, "" </font>      
``` 
const target = {
  msg: "hello"
};

const handler = {
    set: function(target, prop, value, receiver){
        target[prop] = value
    }
};

const proxy = new Proxy(target, handler);
proxy.handler = 'wow' // Uncaught TypeError: 'set' on proxy: trap returned falsish for property 'handler'
```
