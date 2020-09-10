let express = require('express'),
    path = require('path'),
    app = express();

app.use('/', express.static(path.resolve(__dirname, '.')));

// 路由中转
app.use('/', function(req, res, next){
    res.sendFile(path.resolve('./index.html'));
});

// 监听服务
app.listen(3000, function() {
    console.log(`Express server listening on port 3000`);
});


