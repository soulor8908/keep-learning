//https://github.com/mysqljs/mysql
var mysql = require('mysql'); //调用MySQL模块

//创建一个connection
var connection = mysql.createConnection({
    //debug: true,//debug
    //host     : '192.168.0.200',       //主机
    host: 'localhost', //主机
    user: 'root', //MySQL认证用户名
    password: 'kh9001', //MySQL认证用户密码
    port: '3306', //端口号
    database: 'xplat'
});


//创建一个connection
connection.connect(function(err) {
  if (err) {
    console.error('error connecting: ' + err.stack);
    return;
  }

  console.log('connected as id ' + connection.threadId);
});


searchEdriver();

//runtest();//demo
function runtest(){
    //执行SQL语句
    //查询
    connection.query('SELECT 1 + 1 AS solution', function(err, rows, fields) {
        if (err) {
            console.log('[query] - :' + err);
            return;
        }
        console.log('The solution is: ', rows[0].solution);
    });
    connection.query('SELECT * from e_driver limit 10', function(err, rows, fields) {
        if (err) {
            console.log('[query] - :' + err);
            return;
        }
        console.log('The solution is: ', rows.length);
    });

    connection.query({sql: 'SELECT * from e_driver limit 10', timeout: 60000}, function (error, results, fields) {
      if (error && error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
        throw new Error('too long to count table rows!');
      }

      if (error) {
        throw error;
      }

      console.log(results[0].count + ' rows');
    });

    var userId = 1;
    connection.query('SELECT * FROM e_driver WHERE id = ?', [userId], function (error, results, fields) {
      if (error) throw error;
      console.log('The solution is: ', rows[0].solution);
    });
    searchEdriver(11);
    //插入
    var  userAddSql = 'INSERT INTO e_driver(id,driver_name,tel_number,company,card_id,status,province_code,city_code,district_code,create_time,update_time) VALUES(11,"xiaozhang",123456,"kehua",?,?,1,2,3,"2017-08-23 02:19:00","2017-08-23 02:19:00")';
    var  userAddSql_Params = ['1000', 0];
    connection.query(userAddSql,userAddSql_Params,function (err, result) {
            if(err){
             console.log('[INSERT ERROR] - ',err.message);
             return;
            }

           console.log('--------------------------INSERT----------------------------');
           //console.log('INSERT ID:',result.insertId);
           console.log('INSERT ID:',result);
           console.log('-----------------------------------------------------------------\n\n');  
    });

    var e_driver  = {id:12,driver_name:'1241',tel_number:'13434534411',company:'11',card_id:'1234',status:0,province_code:1,city_code:2,district_code:3,create_time:'2017-08-23 02:19:00',update_time:'2017-08-23 02:19:00'};
    var userAddSql = 'INSERT INTO e_driver SET ?';
    var query = connection.query(userAddSql, e_driver, function (error, results, fields) {
      if (error) throw error;
      // Neat!
    });
    console.log(query.sql); // INSERT INTO e_driver SET `id` = 1, `title` = 'Hello MySQL'

    searchEdriver(11);

    //改
    var userModSql = 'UPDATE e_driver SET driver_name = ?,tel_number = ? WHERE id = ?';
    var userModSql_Params = ['钟慰', '5678',11];
    connection.query(userModSql,userModSql_Params,function (err, result) {
       if(err){
             console.log('[UPDATE ERROR] - ',err.message);
             return;
       }
      console.log('--------------------------UPDATE----------------------------');
      console.log('UPDATE affectedRows',result.affectedRows);
      console.log('-----------------------------------------------------------------\n\n');
    });

    searchEdriver(11);

    //删除
    var userDelSql = 'DELETE FROM e_driver where id=11';
    connection.query(userDelSql, function(err, result) {
        if (err) {
            console.log('[DELETE ERROR] - ', err.message);
            return;
        }

        console.log('--------------------------DELETE----------------------------');
        console.log('DELETE affectedRows', result.affectedRows);
        console.log('-----------------------------------------------------------------\n\n');
    });

    searchEdriver(11);

    //存储过程
    // var  userProc = 'call P_edriver(?,?,?,@ExtReturnVal);';
    // var userProc_Params = [11,'Wilson Z','abcd'];
    // //调用存储过程
    // connection.query(userProc,userProc_Params,function (err, retsult) {
    //         if(err){
    //             console.log('[EXEC PROC ERROR] - ',err.message);
    //             return;
    //         }

    //        console.log('--------------------------PROC----------------------------');
    //        console.log(retsult);
    //        console.log(retsult[0][0].ExtReturnVal);
    //        console.log('-----------------------------------------------------------------\n\n');
    // });

    /*
     *断线重连
     */
    function handleDisconnect() {
      connection = mysql.createConnection(db_config);
      connection.connect(function(err) {
        if(err) {
          console.log("进行断线重连：" + new Date());
          setTimeout(handleDisconnect, 2000);   //2秒重连一次
          return;
        }
         console.log("连接成功");
      });
      connection.on('error', function(err) {
        console.log('db error', err);
        if(err.code === 'PROTOCOL_CONNECTION_LOST') {
          handleDisconnect();
        } else {
          throw err;
        }
      });
    }
    // handleDisconnect();


    /*
     *防止SQL注入
     */
    // var pool = mysql.createPool({
    //     host: 'localhost', //主机
    //     user: 'root', //MySQL认证用户名
    //     password: 'kh9001', //MySQL认证用户密码
    //     port: '3306', //端口号
    //     database: 'xplat'
    // });
    // pool.getConnection(function(err,connection){

    //     connection.query('SELECT * FROM userinfo WHERE id = ' + '5 OR ID = 6',function(err,result){
    //         //console.log(err);
    //         console.log(result);
    //         connection.release();
    //     });

    //     connection.query('SELECT * FROM userinfo WHERE id = ' + pool.escape('5 OR ID = 6') ,function(err,result){
    //         //console.log(err);
    //         console.log(result);
    //         connection.release();
    //     });
    // });


}


function searchEdriver(id) {
    var id = id ? 'where id =' + id : '';
    var userGetSql = 'SELECT * from e_driver ' + id + ' limit 10';
    //查
    connection.query(userGetSql, function(err, result) {
        if (err) {
            console.log('[SELECT ERROR] - ', err.message);
            return;
        }
        console.log('--------------------------SELECT----------------------------');
        console.log(result);
        console.log('The solution is: ', result.length);
        console.log('-----------------------------------------------------------------\n\n');
    });
}


//关闭connection
connection.end(function(err) {
    if (err) {
        return;
    }
    console.log('[connection end] succeed!');
});