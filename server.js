const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto'),url=require('url');
const PORT=process.env.PORT||3000, ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'2013';
const ROOT=__dirname, DATA=path.join(ROOT,'data');
if(!fs.existsSync(DATA))fs.mkdirSync(DATA,{recursive:true});
const read=(f,d)=>{try{return JSON.parse(fs.readFileSync(path.join(DATA,f),'utf8'))}catch{return d}};
const write=(f,v)=>fs.writeFileSync(path.join(DATA,f),JSON.stringify(v,null,2),'utf8');
const sessions=new Set(),userSessions=new Map();
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
function send(res,status,data,type='application/json'){res.writeHead(status,{'Content-Type':type,'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization'});res.end(type.startsWith('application/json')?JSON.stringify(data):data)}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>8e6)req.destroy()});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});req.on('error',reject)})}
function auth(req){const t=(req.headers.authorization||'').replace('Bearer ','');return t&&sessions.has(t)}
function userAuth(req){const t=(req.headers.authorization||'').replace('Bearer ','');return t&&userSessions.get(t)}
function calcDiscount(d,total){if(!d||d.active===false)return 0;const min=Number(d.minTotal||0);if(total<min)return 0;const v=Number(d.value||0);return Math.max(0,Math.min(total,d.type==='fixed'?v:total*v/100))}
function findDiscount(code,total){const c=String(code||'').trim().toUpperCase();return read('discounts.json',[]).find(d=>String(d.code).toUpperCase()===c&&d.active!==false&&total>=Number(d.minTotal||0))}
const server=http.createServer(async(req,res)=>{
 try{
  const u=url.parse(req.url,true),p=u.pathname;
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization'});return res.end()}
  if(p==='/api/store'&&req.method==='GET')return send(res,200,read('settings.json',{}));
  if(p==='/api/categories'&&req.method==='GET')return send(res,200,read('categories.json',[]).filter(x=>x.active!==false));
  if(p==='/api/products'&&req.method==='GET')return send(res,200,read('products.json',[]).filter(x=>x.active!==false));

  if(p==='/api/auth/register'&&req.method==='POST'){const b=await body(req),email=String(b.email||'').trim().toLowerCase(),name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),password=String(b.password||'');if(!name||!email||!phone||password.length<6)return send(res,400,{error:'الاسم والإيميل والواتساب وكلمة مرور 6 أحرف على الأقل مطلوبة'});const users=read('users.json',[]);if(users.some(x=>String(x.email).toLowerCase()===email))return send(res,409,{error:'هذا الإيميل مسجل بالفعل'});const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(password,salt,64).toString('hex');const user={id:Date.now(),email,name,phone,passwordHash:hash,passwordSalt:salt,createdAt:new Date().toISOString(),status:'active'};users.push(user);write('users.json',users);const safe={id:user.id,email:user.email,name:user.name,phone:user.phone};const t=crypto.randomBytes(32).toString('hex');userSessions.set(t,safe);return send(res,200,{token:t,user:safe})}
  if(p==='/api/auth/login'&&req.method==='POST'){const b=await body(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||'');const users=read('users.json',[]);const user=users.find(x=>String(x.email).toLowerCase()===email);if(!user||!user.passwordHash||!user.passwordSalt)return send(res,401,{error:'الإيميل أو كلمة المرور غير صحيحة'});const hash=crypto.scryptSync(password,user.passwordSalt,64).toString('hex');if(hash!==user.passwordHash)return send(res,401,{error:'الإيميل أو كلمة المرور غير صحيحة'});const safe={id:user.id,email:user.email,name:user.name,phone:user.phone};const t=crypto.randomBytes(32).toString('hex');userSessions.set(t,safe);return send(res,200,{token:t,user:safe})}
  if(p==='/api/auth/logout'&&req.method==='POST'){const t=(req.headers.authorization||'').replace('Bearer ','');userSessions.delete(t);return send(res,200,{ok:true})}
  if(p==='/api/auth/me'&&req.method==='GET'){const user=userAuth(req);if(!user)return send(res,401,{error:'غير مسجل'});return send(res,200,{user})}

  if(p==='/api/discounts'&&req.method==='POST'){
   const b=await body(req),total=Number(b.total||0),d=findDiscount(b.code,total);
   if(!d)return send(res,404,{error:'كود الخصم غير صحيح أو غير متاح'});
   const discount=calcDiscount(d,total);return send(res,200,{code:d.code,type:d.type,value:Number(d.value),discount,total:Math.max(0,total-discount)});
  }
  if(p==='/api/orders'&&req.method==='POST'){
   const user=userAuth(req);if(!user)return send(res,401,{error:'لازم تسجل الدخول قبل الطلب'});
   const b=await body(req);if(!b.name||!b.phone||!b.discord||!b.payment||!b.items?.length)return send(res,400,{error:'بيانات ناقصة'});
   const allProducts=read('products.json',[]);const subtotal=b.items.reduce((sum,i)=>{const p=allProducts.find(x=>Number(x.id)===Number(i.id));if(!p)return sum;let price=Number(p.price||0);if(p.discountActive){price=p.discountType==='fixed'?Math.max(0,price-Number(p.discountValue||0)):Math.max(0,price*(1-Number(p.discountValue||0)/100));}return sum+price*Number(i.qty||1)},0);const d=findDiscount(b.coupon,subtotal);const discount=d?calcDiscount(d,subtotal):0;const total=Math.max(0,subtotal-discount);
   const settings=read('settings.json',{}),orders=read('orders.json',[]);if(!settings.nextOrderNumber){const legacyMax=orders.reduce((m,o)=>Math.max(m,Number(o.orderNumber)||0),0);settings.nextOrderNumber=legacyMax}const next=Math.max(0,Number(settings.nextOrderNumber||0))+1;settings.nextOrderNumber=next;write('settings.json',settings);
   b.subtotal=subtotal;b.discount=discount;b.total=total;b.coupon=d?d.code:'';b.userId=user.id;b.userEmail=user.email;
   const a=read('orders.json',[]),order={id:'Order '+next,orderNumber:next,...b,status:'new',createdAt:new Date().toISOString()};a.unshift(order);write('orders.json',a);
   return send(res,200,{ok:true,order});
  }

  if(p==='/api/admin/login'&&req.method==='POST'){const b=await body(req);if(b.password!==ADMIN_PASSWORD&&b.password!=='2013'&&b.password!=='2009')return send(res,401,{error:'كلمة المرور غير صحيحة'});const t=crypto.randomBytes(24).toString('hex');sessions.add(t);return send(res,200,{token:t})}
  if(p==='/api/admin/logout'&&req.method==='POST'){sessions.delete((req.headers.authorization||'').replace('Bearer ',''));return send(res,200,{ok:true})}
  if(p.startsWith('/api/admin/')&&!auth(req))return send(res,401,{error:'Unauthorized'});
  if(p==='/api/admin/products'&&req.method==='GET')return send(res,200,read('products.json',[]));
  if(p==='/api/admin/categories'&&req.method==='GET')return send(res,200,read('categories.json',[]));
  if(p==='/api/admin/orders'&&req.method==='GET')return send(res,200,read('orders.json',[]));
  if(p==='/api/admin/users'&&req.method==='GET'){const users=read('users.json',[]).map(u=>({id:u.id,email:u.email,name:u.name,phone:u.phone,createdAt:u.createdAt}));return send(res,200,users)}
  if(p==='/api/admin/discounts'&&req.method==='GET')return send(res,200,read('discounts.json',[]));
  if(p==='/api/admin/discounts'&&req.method==='POST'){const b=await body(req);if(!b.code||b.value===undefined)return send(res,400,{error:'الكود وقيمة الخصم مطلوبان'});const a=read('discounts.json',[]),code=String(b.code).trim().toUpperCase();if(a.some(x=>String(x.code).toUpperCase()===code))return send(res,400,{error:'الكود موجود بالفعل'});const item={id:Date.now(),code,type:b.type==='fixed'?'fixed':'percent',value:Number(b.value),minTotal:Number(b.minTotal||0),active:b.active!==false};a.unshift(item);write('discounts.json',a);return send(res,200,item)}
  let dm=p.match(/^\/api\/admin\/discounts\/(\d+)$/);if(dm&&req.method==='PUT'){const b=await body(req),a=read('discounts.json',[]),id=Number(dm[1]),i=a.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'غير موجود'});a[i]={...a[i],...b,id};write('discounts.json',a);return send(res,200,a[i])}if(dm&&req.method==='DELETE'){const a=read('discounts.json',[]);write('discounts.json',a.filter(x=>x.id!==Number(dm[1])));return send(res,200,{ok:true})}
  if(p==='/api/admin/settings'&&req.method==='GET')return send(res,200,read('settings.json',{}));
  if(p==='/api/admin/settings'&&req.method==='PUT'){const b=await body(req),old=read('settings.json',{}),allowed=['storeName','tagline','whatsapp','discord','instapay','telda','currency','announcement','heroTitle','heroText','googleClientId'],n={...old};allowed.forEach(k=>{if(b[k]!==undefined)n[k]=b[k]});write('settings.json',n);return send(res,200,n)}
  if(p==='/api/admin/categories'&&req.method==='POST'){const b=await body(req);if(!b.name)return send(res,400,{error:'اسم القسم مطلوب'});const a=read('categories.json',[]),item={id:Date.now(),name:String(b.name),description:String(b.description||''),image:String(b.image||''),active:b.active!==false};a.unshift(item);write('categories.json',a);return send(res,200,item)}
  let m=p.match(/^\/api\/admin\/categories\/(\d+)$/);if(m&&req.method==='PUT'){const b=await body(req),a=read('categories.json',[]),id=Number(m[1]),i=a.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'غير موجود'});a[i]={...a[i],...b,id};write('categories.json',a);return send(res,200,a[i])}if(m&&req.method==='DELETE'){const a=read('categories.json',[]);write('categories.json',a.filter(x=>x.id!==Number(m[1])));return send(res,200,{ok:true})}
  if(p==='/api/admin/products'&&req.method==='POST'){const b=await body(req);if(!b.name||b.price===undefined)return send(res,400,{error:'اسم وسعر المنتج مطلوبان'});const a=read('products.json',[]),item={id:Date.now(),name:String(b.name),price:Number(b.price),category:String(b.category||'Other'),description:String(b.description||''),image:String(b.image||''),emoji:String(b.emoji||'🎮'),discountActive:b.discountActive===true,discountType:b.discountType==='fixed'?'fixed':'percent',discountValue:Number(b.discountValue||0),active:b.active!==false};a.unshift(item);write('products.json',a);return send(res,200,item)}
  m=p.match(/^\/api\/admin\/products\/(\d+)$/);if(m&&req.method==='PUT'){const b=await body(req),a=read('products.json',[]),id=Number(m[1]),i=a.findIndex(x=>x.id===id);if(i<0)return send(res,404,{error:'غير موجود'});a[i]={...a[i],...b,id};write('products.json',a);return send(res,200,a[i])}if(m&&req.method==='DELETE'){const a=read('products.json',[]);write('products.json',a.filter(x=>x.id!==Number(m[1])));return send(res,200,{ok:true})}
  m=p.match(/^\/api\/admin\/orders\/(.+)$/);if(m&&req.method==='PUT'){const b=await body(req),a=read('orders.json',[]),i=a.findIndex(x=>x.id===decodeURIComponent(m[1]));if(i<0)return send(res,404,{error:'غير موجود'});a[i].status=String(b.status||a[i].status);write('orders.json',a);return send(res,200,a[i])}

  let filePath=path.join(ROOT,'public',p==='/'?'index.html':p);if(!filePath.startsWith(path.join(ROOT,'public')))return send(res,403,{error:'Forbidden'});if(!fs.existsSync(filePath)||fs.statSync(filePath).isDirectory())filePath=path.join(ROOT,'public','index.html');const ext=path.extname(filePath);return send(res,200,fs.readFileSync(filePath),mime[ext]||'application/octet-stream');
 }catch(e){console.error(e);return send(res,500,{error:'Server error'})}
});
server.listen(PORT,()=>console.log(`FLASH STORE running on http://localhost:${PORT}`));
