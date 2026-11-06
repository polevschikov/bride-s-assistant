import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import {serviceSeed,taskSeed,quizSeed,homeSeed,settingsSeed} from './content-seed.mjs';
import {localMediaRoot,storeMedia,deleteMedia,storageStatus} from './storage.mjs';

const app=express();
const db=new Database(process.env.DATABASE_PATH||'wedding.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,variant TEXT,answers TEXT,result TEXT,tasks TEXT,contact TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS partners(token TEXT PRIMARY KEY,project_id TEXT,answers TEXT,created_at TEXT,completed_at TEXT);
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,project_id TEXT,service TEXT,amount INTEGER,brief TEXT,contact TEXT,status TEXT,payment_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,order_id TEXT,provider TEXT,status TEXT,idempotency_key TEXT,raw TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT,variant TEXT,name TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,phone TEXT,data TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS auth_identities(id TEXT PRIMARY KEY,client_id TEXT,provider TEXT,provider_subject TEXT,created_at TEXT,UNIQUE(provider,provider_subject));
CREATE TABLE IF NOT EXISTS client_sessions(token TEXT PRIMARY KEY,client_id TEXT,created_at TEXT,expires_at TEXT);
CREATE TABLE IF NOT EXISTS services(id TEXT PRIMARY KEY,name TEXT,price INTEGER,result TEXT,includes_json TEXT,excludes TEXT,image TEXT,published INTEGER,sort_order INTEGER,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS pages(id TEXT PRIMARY KEY,slug TEXT UNIQUE,title TEXT,status TEXT,blocks TEXT,draft_blocks TEXT,version INTEGER,updated_at TEXT);
CREATE TABLE IF NOT EXISTS page_versions(id TEXT PRIMARY KEY,page_id TEXT,version INTEGER,blocks TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS quiz_definitions(id TEXT PRIMARY KEY,name TEXT,version INTEGER,status TEXT,data TEXT,draft_data TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS planner_templates(id TEXT PRIMARY KEY,name TEXT,version INTEGER,status TEXT,data TEXT,draft_data TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,name TEXT,url TEXT,storage_key TEXT,storage TEXT,mime TEXT,size INTEGER,alt TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS order_notes(id TEXT PRIMARY KEY,order_id TEXT,author TEXT,body TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS order_history(id TEXT PRIMARY KEY,order_id TEXT,status TEXT,comment TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS wallet_transactions(id TEXT PRIMARY KEY,client_id TEXT,amount INTEGER,type TEXT,reason TEXT,order_id TEXT,created_at TEXT);
`);
const addColumn=(table,column,type)=>{const columns=db.prepare(`PRAGMA table_info(${table})`).all();if(!columns.some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);};
addColumn('projects','client_id','TEXT');
addColumn('projects','quiz_version','INTEGER');
addColumn('orders','client_id','TEXT');

const now=()=>new Date().toISOString();
const json=(v,f)=>{try{return JSON.parse(v||'')}catch{return f}};
const id=(p='')=>p+crypto.randomBytes(9).toString('hex');
const safeJson=v=>JSON.stringify(v??{});
const serviceFromRow=s=>s?({id:s.id,name:s.name,price:s.price,result:s.result,includes:json(s.includes_json,[]),excludes:s.excludes,image:s.image||'',published:Boolean(s.published),sort_order:s.sort_order}):null;
const projectFromRow=p=>p?({...p,answers:json(p.answers,{}),result:json(p.result,{}),tasks:json(p.tasks,taskSeed),contact:json(p.contact,{})}):null;
const orderFromRow=o=>o?({...o,brief:json(o.brief,{}),contact:json(o.contact,{})}):null;
const pageFromRow=p=>p?({...p,blocks:json(p.blocks,[]),draft_blocks:json(p.draft_blocks,[])}):null;
const quizFromRow=q=>q?({...q,data:json(q.data,quizSeed),draft_data:json(q.draft_data,quizSeed)}):null;
const plannerFromRow=p=>p?({...p,data:json(p.data,taskSeed),draft_data:json(p.draft_data,taskSeed)}):null;
const getSettings=()=>Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(x=>[x.key,x.value]));
const getServices=includeHidden=>db.prepare(`SELECT * FROM services ${includeHidden?'':'WHERE published=1'} ORDER BY sort_order,name`).all().map(serviceFromRow);
const getQuiz=()=>quizFromRow(db.prepare("SELECT * FROM quiz_definitions WHERE id='main'").get());
const getPlanner=()=>plannerFromRow(db.prepare("SELECT * FROM planner_templates WHERE id='main'").get());
const walletBalance=clientId=>db.prepare('SELECT COALESCE(SUM(amount),0) AS balance FROM wallet_transactions WHERE client_id=?').get(clientId).balance;

const t=now();
for(const [i,s] of serviceSeed.entries())db.prepare('INSERT OR IGNORE INTO services(id,name,price,result,includes_json,excludes,image,published,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(s.id,s.name,s.price,s.result,safeJson(s.includes),s.excludes,'',1,i*10,t,t);
db.prepare('INSERT OR IGNORE INTO pages(id,slug,title,status,blocks,draft_blocks,version,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('home','home',homeSeed.title,'published',safeJson(homeSeed.blocks),safeJson(homeSeed.blocks),1,t);
db.prepare('INSERT OR IGNORE INTO quiz_definitions(id,name,version,status,data,draft_data,updated_at) VALUES (?,?,?,?,?,?,?)').run('main','Основной квиз',1,'published',safeJson(quizSeed),safeJson(quizSeed),t);
db.prepare('INSERT OR IGNORE INTO planner_templates(id,name,version,status,data,draft_data,updated_at) VALUES (?,?,?,?,?,?,?)').run('main','Основной планер',1,'published',safeJson(taskSeed),safeJson(taskSeed),t);
const setting=db.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES (?,?,?)');
for(const [key,value] of Object.entries(settingsSeed))setting.run(key,value,t);

app.use(cors());
app.use(express.json({limit:'14mb'}));
app.use('/uploads',express.static(localMediaRoot));
app.get('/api/health',(req,res)=>res.json({ok:true,database:true,payment:process.env.YOOKASSA_SHOP_ID?'yookassa-test':'sandbox',storage:storageStatus().driver,prototype:true}));

// Публичная конфигурация: только опубликованный контент, без секретов.
app.get('/api/public/config',(req,res)=>{
  const pages=db.prepare("SELECT * FROM pages WHERE status='published' ORDER BY title").all().map(pageFromRow);
  res.json({pages:Object.fromEntries(pages.map(p=>[p.slug,{id:p.id,slug:p.slug,title:p.title,version:p.version,blocks:p.blocks}])),services:getServices(false),quiz:getQuiz()?.data||quizSeed,quizVersion:getQuiz()?.version||1,settings:getSettings()});
});
app.post('/api/projects',(req,res)=>{
  const time=now(),pid=id('p_'),variant=req.body.variant==='A'?'A':'B',planner=getPlanner(),quiz=getQuiz();
  db.prepare('INSERT INTO projects(id,variant,answers,result,tasks,contact,created_at,updated_at,quiz_version) VALUES (?,?,?,?,?,?,?,?,?)').run(pid,variant,'{}','{}',safeJson(planner?.data||taskSeed),'{}',time,time,quiz?.version||1);
  res.json({id:pid,variant,answers:{},result:{},tasks:planner?.data||taskSeed,contact:{},quiz_version:quiz?.version||1});
});
app.get('/api/projects/:id',(req,res)=>{const p=projectFromRow(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));if(!p)return res.status(404).json({error:'Проект не найден'});res.json(p);});
app.put('/api/projects/:id',(req,res)=>{const p=db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id);if(!p)return res.status(404).json({error:'Проект не найден'});for(const k of ['answers','result','tasks','contact'])if(req.body[k]!==undefined)db.prepare(`UPDATE projects SET ${k}=?,updated_at=? WHERE id=?`).run(safeJson(req.body[k]),now(),p.id);res.json({ok:true});});
app.post('/api/events',(req,res)=>{db.prepare('INSERT INTO events(project_id,variant,name,created_at) VALUES (?,?,?,?)').run(req.body.projectId||null,req.body.variant||'B',String(req.body.name).slice(0,60),now());res.json({ok:true});});
app.post('/api/partners',(req,res)=>{const token=id('invite_');db.prepare('INSERT INTO partners(token,project_id,answers,created_at) VALUES (?,?,?,?)').run(token,req.body.projectId,'{}',now());res.json({token,url:`${req.protocol}://${req.get('host')}/?partner=${token}`});});
app.get('/api/partners/:token',(req,res)=>{const p=db.prepare('SELECT * FROM partners WHERE token=?').get(req.params.token);if(!p)return res.status(404).json({error:'Приглашение не найдено или устарело'});const owner=db.prepare('SELECT answers FROM projects WHERE id=?').get(p.project_id);res.json({...p,answers:json(p.answers,{}),ownerAnswers:json(owner?.answers,{})});});
app.put('/api/partners/:token',(req,res)=>{db.prepare('UPDATE partners SET answers=?,completed_at=? WHERE token=?').run(safeJson(req.body.answers||{}),now(),req.params.token);res.json({ok:true});});

// Демонстрационная авторизация. Внешние провайдеры не вызываются.
const clientFromRequest=req=>{
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(!token)return null;
  return db.prepare('SELECT c.* FROM client_sessions s JOIN clients c ON c.id=s.client_id WHERE s.token=? AND s.expires_at>?').get(token,now());
};
const requireClient=(req,res,next)=>{const client=clientFromRequest(req);if(!client)return res.status(401).json({error:'Войдите в демонстрационный кабинет'});req.client=client;next();};
const clientView=c=>({id:c.id,name:c.name,email:c.email,phone:c.phone||'',data:json(c.data,{}),created_at:c.created_at});
app.post('/api/auth/demo',(req,res)=>{
  const provider=['email','yandex','vk'].includes(req.body.provider)?req.body.provider:'email';
  const email=String(req.body.email||'').trim().toLowerCase();
  const name=String(req.body.name||'').trim()||email.split('@')[0]||'Демо-клиент';
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Укажите почту для демонстрационного входа'});
  let client=db.prepare('SELECT * FROM clients WHERE email=?').get(email);
  if(!client){const time=now(),cid=id('c_');db.prepare('INSERT INTO clients(id,name,email,phone,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(cid,name,email,'','{}',time,time);client=db.prepare('SELECT * FROM clients WHERE id=?').get(cid);}
  const identity=db.prepare('SELECT * FROM auth_identities WHERE provider=? AND provider_subject=?').get(provider,email);
  if(!identity)db.prepare('INSERT INTO auth_identities(id,client_id,provider,provider_subject,created_at) VALUES (?,?,?,?,?)').run(id('auth_'),client.id,provider,email,now());
  if(req.body.projectId){const project=db.prepare('SELECT * FROM projects WHERE id=?').get(req.body.projectId);if(project)db.prepare('UPDATE projects SET client_id=?,updated_at=? WHERE id=?').run(client.id,now(),project.id);db.prepare('UPDATE orders SET client_id=?,updated_at=? WHERE project_id=?').run(client.id,now(),req.body.projectId);}
  const token=id('session_'),expires=new Date(Date.now()+30*86400000).toISOString();
  db.prepare('INSERT INTO client_sessions(token,client_id,created_at,expires_at) VALUES (?,?,?,?)').run(token,client.id,now(),expires);
  res.json({token,client:clientView(client),demo:true});
});
app.post('/api/auth/logout',requireClient,(req,res)=>{const token=req.headers.authorization.replace(/^Bearer\s+/i,'');db.prepare('DELETE FROM client_sessions WHERE token=?').run(token);res.json({ok:true});});
app.get('/api/account',requireClient,(req,res)=>{
  const projects=db.prepare('SELECT * FROM projects WHERE client_id=? ORDER BY updated_at DESC').all(req.client.id).map(projectFromRow);
  const orders=db.prepare('SELECT * FROM orders WHERE client_id=? OR project_id IN (SELECT id FROM projects WHERE client_id=?) ORDER BY created_at DESC').all(req.client.id,req.client.id).map(orderFromRow);
  const wallet=db.prepare('SELECT * FROM wallet_transactions WHERE client_id=? ORDER BY created_at DESC').all(req.client.id);
  const identities=db.prepare('SELECT provider,created_at FROM auth_identities WHERE client_id=?').all(req.client.id);
  res.json({client:clientView(req.client),projects,orders,wallet,balance:walletBalance(req.client.id),identities,demo:true});
});
app.put('/api/account/profile',requireClient,(req,res)=>{
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),phone=String(req.body.phone||'').trim();
  if(!name||!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Проверьте имя и почту'});
  const other=db.prepare('SELECT id FROM clients WHERE email=? AND id<>?').get(email,req.client.id);if(other)return res.status(409).json({error:'Эта почта уже используется'});
  db.prepare('UPDATE clients SET name=?,email=?,phone=?,updated_at=? WHERE id=?').run(name,email,phone,now(),req.client.id);
  res.json({ok:true});
});
app.post('/api/account/link-project',requireClient,(req,res)=>{const p=db.prepare('SELECT * FROM projects WHERE id=?').get(req.body.projectId);if(!p)return res.status(404).json({error:'Проект не найден'});db.prepare('UPDATE projects SET client_id=?,updated_at=? WHERE id=?').run(req.client.id,now(),p.id);db.prepare('UPDATE orders SET client_id=?,updated_at=? WHERE project_id=?').run(req.client.id,now(),p.id);res.json({ok:true});});

// Заказы и локальная тестовая оплата.
app.post('/api/orders',(req,res)=>{
  const {projectId,service,brief,contact}=req.body;
  const selected=serviceFromRow(db.prepare('SELECT * FROM services WHERE id=? AND published=1').get(service));
  if(!selected||!contact?.phone)return res.status(400).json({error:'Проверьте услугу и телефон'});
  const project=db.prepare('SELECT * FROM projects WHERE id=?').get(projectId),oid=id('o_'),time=now();
  db.prepare('INSERT INTO orders(id,project_id,service,amount,brief,contact,status,payment_id,created_at,updated_at,client_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(oid,projectId,selected.name,selected.price,safeJson(brief||{}),safeJson(contact),'pending',null,time,time,project?.client_id||null);
  db.prepare('INSERT INTO order_history(id,order_id,status,comment,created_at) VALUES (?,?,?,?,?)').run(id('hist_'),oid,'pending','Заявка создана',time);
  if(project?.client_id){let client=db.prepare('SELECT * FROM clients WHERE id=?').get(project.client_id);if(client&&!client.phone)db.prepare('UPDATE clients SET phone=?,updated_at=? WHERE id=?').run(contact.phone,now(),client.id);}
  res.json({id:oid,service:selected.name,amount:selected.price,status:'pending'});
});
app.get('/api/orders/:id',(req,res)=>{const o=orderFromRow(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));if(!o)return res.status(404).json({error:'Заказ не найден'});res.json(o);});
app.post('/api/orders/:id/pay',async(req,res)=>{
  if(getSettings().payment_enabled==='false')return res.status(409).json({error:'Тестовая оплата временно отключена'});
  const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!o)return res.status(404).json({error:'Заказ не найден'});if(o.status==='paid')return res.json({status:'paid',orderId:o.id});
  const paymentId=id('pay_'),key=id('idem_');db.prepare('INSERT INTO payments VALUES (?,?,?,?,?,?,?)').run(paymentId,o.id,'sandbox','pending',key,'{}',now());db.prepare('UPDATE orders SET payment_id=?,status=?,updated_at=? WHERE id=?').run(paymentId,'pending',now(),o.id);
  try{
    if(process.env.YOOKASSA_SHOP_ID&&process.env.YOOKASSA_SECRET_KEY){
      const auth=Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64');
      const r=await fetch('https://api.yookassa.ru/v3/payments',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Idempotence-Key':key,'Content-Type':'application/json'},body:JSON.stringify({amount:{value:o.amount.toFixed(2),currency:'RUB'},confirmation:{type:'redirect',return_url:`${req.protocol}://${req.get('host')}/?order=${o.id}`},capture:true,description:o.service,metadata:{orderId:o.id}})});
      const data=await r.json();if(!r.ok)throw new Error(data.description||'Платёжный сервис недоступен');
      db.prepare('UPDATE payments SET provider=?,id=?,raw=? WHERE idempotency_key=?').run('yookassa',data.id,safeJson(data),key);db.prepare('UPDATE orders SET payment_id=? WHERE id=?').run(data.id,o.id);return res.json({confirmationUrl:data.confirmation.confirmation_url,status:'pending'});
    }
    res.json({confirmationUrl:`/sandbox/checkout/${o.id}`,status:'pending'});
  }catch(e){db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run('error',now(),o.id);res.status(502).json({error:e.message});}
});
const sign=(order,status)=>crypto.createHmac('sha256',process.env.SANDBOX_SECRET||'local-demo-secret').update(`${order}.${status}`).digest('hex');
app.use('/fonts/noto-sans',express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'node_modules/@fontsource/noto-sans/files')));
app.use('/fonts/noto-serif',express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'node_modules/@fontsource/noto-serif/files')));
app.get('/sandbox/checkout/:id',(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!o)return res.status(404).send('Заказ не найден');const token=sign(o.id,'succeeded'),cancelToken=sign(o.id,'canceled');res.type('html').send(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#EAF1E4"><title>Тестовая оплата · Ассистент невесты</title><style>@font-face{font-family:Noto Sans;src:url('/fonts/noto-sans/noto-sans-cyrillic-400-normal.woff2') format('woff2');font-weight:400;font-display:swap}@font-face{font-family:Noto Serif;src:url('/fonts/noto-serif/noto-serif-cyrillic-400-normal.woff2') format('woff2');font-weight:400;font-display:swap}*{box-sizing:border-box}body{min-width:320px;min-height:100dvh;margin:0;padding:64px 24px;background:#EEF0E6;color:#1C1718;font:16px/1.65 'Noto Sans',sans-serif}main{max-width:580px;margin:0 auto}.brand{display:flex;align-items:center;gap:12px;margin-bottom:24px;font-size:12px}.brand-mark{display:grid;place-items:center;width:40px;height:40px;border:1px solid #3F5B45;border-radius:50%;color:#3F5B45;font:24px 'Noto Serif',serif}section{position:relative;padding:40px;overflow:hidden;border:1px solid rgba(63,91,69,.25);border-radius:26px;background:#fff}section:before{position:absolute;top:0;right:40px;left:40px;height:2px;background:linear-gradient(90deg,#8A6A3F,#D4AF37,#F2D57E,#FFF3C4);content:''}small{display:block;color:#3F5B45;font-size:10px;font-weight:600;letter-spacing:.1em;line-height:1.7}h1,h2{font-family:'Noto Serif',serif;font-weight:400;letter-spacing:-.03em;line-height:1.15}h1{margin:24px 0 18px;font-size:42px}h2{margin:22px 0;font-size:34px}p{color:#566052}.service-name{margin-bottom:0;font-size:18px;color:#1C1718}a{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:14px;padding:13px 20px;border:1px solid #3F5B45;border-radius:999px;background:#3F5B45;color:#fff;font-size:13px;font-weight:600;text-align:center;text-decoration:none;transition:background .18s,transform .18s}a:hover{background:#2F4734}a:active{transform:translateY(1px)}a:focus-visible{outline:2px solid #3F5B45;outline-offset:4px}.secondary{background:transparent;color:#3F5B45}.secondary:hover{background:#EAF1E4}.note{margin:22px 0 0;font-size:11px;text-align:center}@media(max-width:600px){body{padding:32px 18px}section{padding:32px 24px;border-radius:22px}section:before{right:24px;left:24px}h1{font-size:36px}}@media(prefers-reduced-motion:reduce){a{transition:none}}</style></head><body><main><div class="brand"><span class="brand-mark">А</span><span>Ассистент невесты</span></div><section><small>ЛОКАЛЬНЫЙ SANDBOX · РЕАЛЬНЫЕ ДЕНЬГИ НЕ СПИСЫВАЮТСЯ</small><h1>Тестовая оплата</h1><p class="service-name">${o.service}</p><h2>${o.amount.toLocaleString('ru-RU')} ₽</h2><p>Данные банковской карты не требуются. Сервер подтвердит платёж подписанным уведомлением.</p><a href="/api/sandbox/confirm/${o.id}?status=succeeded&signature=${token}">Подтвердить тестовый платёж</a><a class="secondary" href="/api/sandbox/confirm/${o.id}?status=canceled&signature=${cancelToken}">Отменить</a><p class="note">Это демонстрация сценария, а не страница банка.</p></section></main></body></html>`);});
app.get('/api/sandbox/confirm/:id',(req,res)=>{const {status,signature}=req.query;if((status!=='succeeded'&&status!=='canceled')||signature!==sign(req.params.id,String(status)))return res.status(403).send('Неверная подпись');const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(o){if(o.status!=='paid'){const orderStatus=status==='succeeded'?'paid':'cancelled';db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(orderStatus,now(),o.id);db.prepare('UPDATE payments SET status=?,raw=? WHERE id=?').run(status,safeJson(req.query),o.payment_id);db.prepare('INSERT INTO order_history(id,order_id,status,comment,created_at) VALUES (?,?,?,?,?)').run(id('hist_'),o.id,orderStatus,status==='succeeded'?'Тестовая оплата подтверждена':'Тестовый платёж отменён',now());const p=db.prepare('SELECT variant FROM projects WHERE id=?').get(o.project_id);db.prepare('INSERT INTO events(project_id,variant,name,created_at) VALUES (?,?,?,?)').run(o.project_id,p?.variant||'B',status==='succeeded'?'order_paid':'order_cancelled',now());}}res.redirect(`/?order=${req.params.id}`);});
app.post('/api/payments/webhook',async(req,res)=>{const event=req.body,p=event.object;if(!p?.id)return res.sendStatus(400);try{const auth=Buffer.from(`${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`).toString('base64');const r=await fetch(`https://api.yookassa.ru/v3/payments/${p.id}`,{headers:{Authorization:`Basic ${auth}`}});if(!r.ok)return res.sendStatus(401);const verified=await r.json(),o=db.prepare('SELECT * FROM orders WHERE payment_id=?').get(verified.id);if(o){const status=verified.status==='succeeded'?'paid':verified.status==='canceled'?'cancelled':'pending';if(o.status!=='paid')db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status,now(),o.id);}res.sendStatus(200);}catch{res.sendStatus(500);}});
app.post('/api/orders/:id/refund',(req,res)=>{const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!o||o.status!=='paid')return res.status(400).json({error:'Возврат доступен только для оплаченного тестового заказа'});db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run('refunded',now(),o.id);res.json({status:'refunded'});});

// Администратор прототипа: один доступ, без ролевой модели.
const adminTokens=new Map();
const requireAdmin=(req,res,next)=>{const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,''),session=adminTokens.get(token);if(!session||session< Date.now())return res.status(401).json({error:'Требуется вход администратора'});next();};
app.post('/api/admin/login',(req,res)=>{const expected=process.env.ADMIN_ACCESS_CODE||'admin-demo';if(req.body.code!==expected)return res.status(401).json({error:'Неверный код доступа'});const token=id('admin_');adminTokens.set(token,Date.now()+7*86400000);res.json({token,demo:true});});
app.get('/api/admin/overview',requireAdmin,(req,res)=>{
  const count=(table,where='')=>db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).get().n;
  res.json({projects:count('projects'),clients:count('clients'),orders:count('orders'),newOrders:count('orders',"WHERE status IN ('pending','new','in_progress')"),paid:count('orders',"WHERE status='paid'"),media:count('media'),recentOrders:db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 6').all().map(orderFromRow),storage:storageStatus()});
});
app.get('/api/admin/orders',requireAdmin,(req,res)=>{
  const query=`%${String(req.query.query||'').trim()}%`,status=String(req.query.status||'');
  const rows=db.prepare(`SELECT o.*,c.name AS client_name,c.email AS client_email FROM orders o LEFT JOIN clients c ON c.id=o.client_id WHERE (?='' OR o.status=?) AND (o.id LIKE ? OR o.service LIKE ? OR o.contact LIKE ? OR c.name LIKE ? OR c.email LIKE ?) ORDER BY o.created_at DESC`).all(status,status,query,query,query,query,query);
  res.json(rows.map(orderFromRow));
});
app.get('/api/admin/orders/:id',requireAdmin,(req,res)=>{const order=orderFromRow(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));if(!order)return res.status(404).json({error:'Заказ не найден'});res.json({order,notes:db.prepare('SELECT * FROM order_notes WHERE order_id=? ORDER BY created_at DESC').all(order.id),history:db.prepare('SELECT * FROM order_history WHERE order_id=? ORDER BY created_at DESC').all(order.id),project:projectFromRow(db.prepare('SELECT * FROM projects WHERE id=?').get(order.project_id)),payments:db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC').all(order.id)});});
app.patch('/api/admin/orders/:id',requireAdmin,(req,res)=>{const order=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);if(!order)return res.status(404).json({error:'Заказ не найден'});const allowed=['new','pending','in_progress','awaiting_client','agreed','paid','completed','cancelled','refunded','error'],status=allowed.includes(req.body.status)?req.body.status:order.status;db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status,now(),order.id);db.prepare('INSERT INTO order_history(id,order_id,status,comment,created_at) VALUES (?,?,?,?,?)').run(id('hist_'),order.id,status,String(req.body.comment||'Статус изменён администратором'),now());res.json({ok:true});});
app.post('/api/admin/orders/:id/notes',requireAdmin,(req,res)=>{const body=String(req.body.body||'').trim();if(!body)return res.status(400).json({error:'Введите комментарий'});const note={id:id('note_'),order_id:req.params.id,author:'Администратор',body,created_at:now()};db.prepare('INSERT INTO order_notes(id,order_id,author,body,created_at) VALUES (?,?,?,?,?)').run(note.id,note.order_id,note.author,note.body,note.created_at);res.json(note);});
app.get('/api/admin/clients',requireAdmin,(req,res)=>{const query=`%${String(req.query.query||'').trim()}%`;const rows=db.prepare('SELECT c.*,(SELECT COUNT(*) FROM orders o WHERE o.client_id=c.id) AS orders_count FROM clients c WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? ORDER BY c.created_at DESC').all(query,query,query);res.json(rows.map(c=>({...clientView(c),orders_count:c.orders_count,balance:walletBalance(c.id)})));});
app.get('/api/admin/clients/:id',requireAdmin,(req,res)=>{const client=db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);if(!client)return res.status(404).json({error:'Клиент не найден'});res.json({client:clientView(client),projects:db.prepare('SELECT * FROM projects WHERE client_id=? ORDER BY updated_at DESC').all(client.id).map(projectFromRow),orders:db.prepare('SELECT * FROM orders WHERE client_id=? ORDER BY created_at DESC').all(client.id).map(orderFromRow),wallet:db.prepare('SELECT * FROM wallet_transactions WHERE client_id=? ORDER BY created_at DESC').all(client.id),balance:walletBalance(client.id),identities:db.prepare('SELECT provider,created_at FROM auth_identities WHERE client_id=?').all(client.id)});});
app.post('/api/admin/clients/:id/wallet',requireAdmin,(req,res)=>{const client=db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);if(!client)return res.status(404).json({error:'Клиент не найден'});const amount=Math.trunc(Number(req.body.amount)),reason=String(req.body.reason||'').trim();if(!amount||!reason)return res.status(400).json({error:'Укажите сумму и причину операции'});if(walletBalance(client.id)+amount<0)return res.status(409).json({error:'Баланс не может стать отрицательным'});const transaction={id:id('wallet_'),client_id:client.id,amount,type:amount>0?'credit':'debit',reason,order_id:null,created_at:now()};db.prepare('INSERT INTO wallet_transactions(id,client_id,amount,type,reason,order_id,created_at) VALUES (?,?,?,?,?,?,?)').run(transaction.id,client.id,amount,transaction.type,reason,null,transaction.created_at);res.json(transaction);});
app.get('/api/admin/services',requireAdmin,(req,res)=>res.json(getServices(true)));
app.post('/api/admin/services',requireAdmin,(req,res)=>{const s=req.body,time=now(),sid=id('service_');db.prepare('INSERT INTO services(id,name,price,result,includes_json,excludes,image,published,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(sid,String(s.name||'Новая услуга'),Math.max(0,Number(s.price)||0),String(s.result||''),safeJson(s.includes||[]),String(s.excludes||''),String(s.image||''),s.published===false?0:1,Number(s.sort_order)||0,time,time);res.json({id:sid});});
app.put('/api/admin/services/:id',requireAdmin,(req,res)=>{const current=db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id);if(!current)return res.status(404).json({error:'Услуга не найдена'});const s=req.body;db.prepare('UPDATE services SET name=?,price=?,result=?,includes_json=?,excludes=?,image=?,published=?,sort_order=?,updated_at=? WHERE id=?').run(String(s.name||''),Math.max(0,Number(s.price)||0),String(s.result||''),safeJson(s.includes||[]),String(s.excludes||''),String(s.image||''),s.published?1:0,Number(s.sort_order)||0,now(),current.id);res.json({ok:true});});
app.delete('/api/admin/services/:id',requireAdmin,(req,res)=>{const s=db.prepare('SELECT * FROM services WHERE id=?').get(req.params.id);if(!s)return res.status(404).json({error:'Услуга не найдена'});const used=db.prepare('SELECT COUNT(*) AS n FROM orders WHERE service=?').get(s.name).n;if(used)db.prepare('UPDATE services SET published=0,updated_at=? WHERE id=?').run(now(),s.id);else db.prepare('DELETE FROM services WHERE id=?').run(s.id);res.json({ok:true,archived:Boolean(used)});});
app.get('/api/admin/settings',requireAdmin,(req,res)=>res.json({settings:getSettings(),storage:storageStatus(),payment:{mode:'sandbox',realPayments:false}}));
app.put('/api/admin/settings',requireAdmin,(req,res)=>{const allowed=new Set(Object.keys(settingsSeed));for(const [key,value] of Object.entries(req.body||{}))if(allowed.has(key))db.prepare('INSERT INTO settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(key,String(value),now());res.json({ok:true});});

app.get('/api/admin/pages',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM pages ORDER BY title').all().map(pageFromRow)));
app.post('/api/admin/pages',requireAdmin,(req,res)=>{const slug=String(req.body.slug||'').trim().toLowerCase().replace(/[^a-z0-9-]/g,'-');if(!slug)return res.status(400).json({error:'Укажите адрес страницы латиницей'});const pid=id('page_');db.prepare('INSERT INTO pages(id,slug,title,status,blocks,draft_blocks,version,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(pid,slug,String(req.body.title||slug),'draft','[]','[]',0,now());res.json({id:pid});});
app.put('/api/admin/pages/:id',requireAdmin,(req,res)=>{db.prepare('UPDATE pages SET title=?,draft_blocks=?,updated_at=? WHERE id=?').run(String(req.body.title||''),safeJson(req.body.blocks||[]),now(),req.params.id);res.json({ok:true});});
app.post('/api/admin/pages/:id/publish',requireAdmin,(req,res)=>{const p=pageFromRow(db.prepare('SELECT * FROM pages WHERE id=?').get(req.params.id));if(!p)return res.status(404).json({error:'Страница не найдена'});const version=p.version+1,time=now();db.prepare("UPDATE pages SET status='published',blocks=draft_blocks,version=?,updated_at=? WHERE id=?").run(version,time,p.id);db.prepare('INSERT INTO page_versions(id,page_id,version,blocks,created_at) VALUES (?,?,?,?,?)').run(id('pv_'),p.id,version,safeJson(p.draft_blocks),time);res.json({ok:true,version});});
app.delete('/api/admin/pages/:id',requireAdmin,(req,res)=>{if(req.params.id==='home')return res.status(409).json({error:'Главную страницу нельзя удалить'});db.prepare("UPDATE pages SET status='draft',blocks='[]',updated_at=? WHERE id=?").run(now(),req.params.id);res.json({ok:true});});
app.get('/api/admin/quiz',requireAdmin,(req,res)=>res.json(getQuiz()));
app.put('/api/admin/quiz',requireAdmin,(req,res)=>{db.prepare('UPDATE quiz_definitions SET name=?,draft_data=?,updated_at=? WHERE id=?').run(String(req.body.name||'Основной квиз'),safeJson(req.body.data||quizSeed),now(),'main');res.json({ok:true});});
app.post('/api/admin/quiz/publish',requireAdmin,(req,res)=>{const q=getQuiz(),version=q.version+1;db.prepare("UPDATE quiz_definitions SET data=draft_data,version=?,status='published',updated_at=? WHERE id='main'").run(version,now());res.json({ok:true,version});});
app.get('/api/admin/planner',requireAdmin,(req,res)=>res.json(getPlanner()));
app.put('/api/admin/planner',requireAdmin,(req,res)=>{db.prepare('UPDATE planner_templates SET name=?,draft_data=?,updated_at=? WHERE id=?').run(String(req.body.name||'Основной планер'),safeJson(req.body.data||taskSeed),now(),'main');res.json({ok:true});});
app.post('/api/admin/planner/publish',requireAdmin,(req,res)=>{const p=getPlanner(),version=p.version+1;db.prepare("UPDATE planner_templates SET data=draft_data,version=?,status='published',updated_at=? WHERE id='main'").run(version,now());res.json({ok:true,version});});

app.get('/api/admin/media',requireAdmin,(req,res)=>res.json(db.prepare('SELECT * FROM media ORDER BY created_at DESC').all()));
app.post('/api/admin/media',requireAdmin,async(req,res)=>{
  const {name,mime,alt}=req.body,base64=String(req.body.data||'').replace(/^data:[^;]+;base64,/,'');
  if(!['image/jpeg','image/png','image/webp'].includes(mime))return res.status(400).json({error:'Поддерживаются JPG, PNG и WebP'});
  const buffer=Buffer.from(base64,'base64');if(!buffer.length)return res.status(400).json({error:'Файл пуст'});if(buffer.length>8*1024*1024)return res.status(413).json({error:'Максимальный размер файла — 8 МБ'});
  const mid=id('media_'),stored=await storeMedia({id:mid,name,mime,buffer}),time=now();
  db.prepare('INSERT INTO media(id,name,url,storage_key,storage,mime,size,alt,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(mid,String(name||'Изображение'),stored.url,stored.key,stored.storage,mime,buffer.length,String(alt||''),time);
  res.json(db.prepare('SELECT * FROM media WHERE id=?').get(mid));
});
app.put('/api/admin/media/:id',requireAdmin,(req,res)=>{db.prepare('UPDATE media SET alt=? WHERE id=?').run(String(req.body.alt||''),req.params.id);res.json({ok:true});});
app.delete('/api/admin/media/:id',requireAdmin,async(req,res)=>{const media=db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);if(!media)return res.status(404).json({error:'Файл не найден'});const pages=db.prepare('SELECT * FROM pages').all();const used=pages.some(p=>p.blocks.includes(media.url)||p.draft_blocks.includes(media.url))||db.prepare('SELECT COUNT(*) AS n FROM services WHERE image=?').get(media.url).n;if(used)return res.status(409).json({error:'Изображение используется. Сначала замените его в контенте.'});await deleteMedia(media.storage,media.storage_key);db.prepare('DELETE FROM media WHERE id=?').run(media.id);res.json({ok:true});});

const __dirname=path.dirname(fileURLToPath(import.meta.url));
if(process.env.NODE_ENV==='production'){app.use(express.static(path.join(__dirname,'dist')));app.use((req,res)=>res.sendFile(path.join(__dirname,'dist','index.html')));}
app.use((error,req,res,next)=>{console.error(error);if(res.headersSent)return next(error);res.status(500).json({error:'Внутренняя ошибка сервера'});});
const port=Number(process.env.PORT||3001);app.listen(port,()=>console.log(`API and test checkout: http://localhost:${port}`));
