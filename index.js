const Koa = require('koa')
const path = require('path')
const static = require('koa-static')
const Router = require('koa-router');
const router = new Router();
const app = new Koa()
const bodyParser = require('koa-bodyparser');
const BattleAuthenticator = require('./BattleAuthenticator.js');
app.use(bodyParser());

const staticPath = './static'

app.use(static(
  path.join( __dirname,  staticPath)
))

app.listen(3000, () => {
  console.log('[demo] static-use-middleware is starting at port 3000')
})

router.get('/',function (ctx)   {
    ctx.body = 'hello world'
})
.post('/getcode',function(ctx){
    try {
        let res = BattleAuthenticator.restore(ctx.request.body.serial,ctx.request.body.restore_code)
        ctx.body = {
            success:true,
            code:res.code,
            msg:''
        };
    } catch (error) {
        ctx.body = {
            success:false,
            code:'',
            msg:'输入不合法'
        }
    }

})

app
  .use(router.routes())
  .use(router.allowedMethods());


/*
  const BattleAuthenticator = require('./BattleAuthenticator.js');
  let a = new BattleAuthenticator('US');
  a.serial='序列码'
  a.restore('还原码');
  console.log(`验证码：${a.code}`)

  or

  let b = BattleAuthenticator.restore('US-2302-0370-5788','5WWDQP4MH8')
  console.log(`验证码：${b.code}`)
*/


// const bb = new BattleAuthenticator('US');
// bb.initialize()
// console.log(bb.serial)
// console.log(bb.secret)
// console.log(bb.restore_code)

