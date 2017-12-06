var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);

server.listen(80);

//静态文件路径
app.use(express.static(__dirname + '/'));

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

io.on('connection', function (socket) {
	console.log('connection ID:'+socket.id);
  	socket.emit('news', { hello: 'world' ;id:socket.id});
  	socket.on('my other event', function (data) {
	    console.log(data);
	});
	var timer;
	socket.on('sendMsg', function (data) {
	    console.log(data);
	    if(data == 'start'){
	    	clearInterval(timer);
	    	timer = setInterval(function(){
	    		socket.emit('serverSend', 'start:'+socket.id);
	    	},2000);
	    }else if(data == 'stop'){
	    	clearInterval(timer);
	    	socket.emit('serverSend', 'stop:'+socket.id);
	    	console.log('stop:'+socket.id);
	    }else{
	    	socket.emit('serverSend', socket.id);
	    }
	});
});
