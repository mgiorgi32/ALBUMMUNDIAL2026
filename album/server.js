const express = require('express');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ================= DB =================

(async ()=>{
 await pool.query(`
 CREATE TABLE IF NOT EXISTS users(
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE,
  password TEXT
 )`);

 await pool.query(`
 CREATE TABLE IF NOT EXISTS progress(
  user_id INT,
  sticker TEXT,
  owned INT,
  qty INT DEFAULT 0,
  PRIMARY KEY(user_id, sticker)
 )`);

 await pool.query(`
 CREATE TABLE IF NOT EXISTS friends(
  id SERIAL PRIMARY KEY,
  user_id INT,
  friend_id INT,
  status TEXT
 )`);
})();

// ================= AUTH =================

app.post('/register', async (req,res)=>{
 const {username,password} = req.body;
 const hash = await bcrypt.hash(password,10);

 try{
  const r = await pool.query(
   "INSERT INTO users(username,password) VALUES($1,$2) RETURNING id",
   [username,hash]
  );
  res.json(r.rows[0]);
 }catch{
  res.status(400).json({error:"Usuario ya existe"});
 }
});

app.post('/login', async (req,res)=>{
 const {username,password} = req.body;

 const r = await pool.query("SELECT * FROM users WHERE username=$1",[username]);
 if(r.rows.length===0) return res.status(401).json({error:"Invalid"});

 const user = r.rows[0];
 const valid = await bcrypt.compare(password,user.password);

 if(!valid) return res.status(401).json({error:"Invalid"});

 res.json(user);
});

// ================= PROGRESS =================

app.post('/progress', async (req,res)=>{
 try{

  let {user_id, sticker, owned, qty} = req.body;

  // 🔒 VALIDACIÓN
  if(!user_id || !sticker){
    return res.status(400).json({error:"Datos inválidos"});
  }

  // 🔥 FIX DEFINITIVO (anti undefined / NaN)
  owned = (owned === 1 || owned === "1") ? 1 : 0;

  if(qty === undefined || qty === null || isNaN(qty)){
    qty = 0;
  }else{
    qty = parseInt(qty);
  }

  await pool.query(`
    INSERT INTO progress(user_id,sticker,owned,qty)
    VALUES($1,$2,$3,$4)
    ON CONFLICT (user_id,sticker)
    DO UPDATE SET owned=$3, qty=$4
  `,[user_id, sticker, owned, qty]);

  res.json({ok:true});

 }catch(err){
  console.error("ERROR /progress:", err);
  res.status(500).json({error:"Server error"});
 }
});

app.get('/progress/:id', async (req,res)=>{
 const r = await pool.query(
   "SELECT * FROM progress WHERE user_id=$1",
   [req.params.id]
 );
 res.json(r.rows);
});

app.get('/progress-user/:username', async (req,res)=>{
 const user = await pool.query(
   "SELECT id FROM users WHERE username=$1",
   [req.params.username]
 );

 if(user.rows.length===0){
   return res.status(404).json({error:"No existe"});
 }

 const data = await pool.query(
   "SELECT * FROM progress WHERE user_id=$1",
   [user.rows[0].id]
 );

 res.json(data.rows);
});

// ================= FRIENDS =================

app.get('/search/:username', async (req,res)=>{
 const r = await pool.query(
  "SELECT id, username FROM users WHERE username ILIKE $1 LIMIT 5",
  ['%'+req.params.username+'%']
 );
 res.json(r.rows);
});

app.post('/add-friend', async (req,res)=>{
 const {user_id, friend_id} = req.body;

 await pool.query(`
 INSERT INTO friends(user_id,friend_id,status)
 VALUES($1,$2,'pending')
 `,[user_id,friend_id]);

 res.json({ok:true});
});

app.get('/requests/:id', async (req,res)=>{
 const r = await pool.query(`
 SELECT f.id, u.username
 FROM friends f
 JOIN users u ON u.id = f.user_id
 WHERE f.friend_id=$1 AND f.status='pending'
 `,[req.params.id]);

 res.json(r.rows);
});

app.post('/accept-friend', async (req,res)=>{
 const {id} = req.body;

 const r = await pool.query(
   "SELECT * FROM friends WHERE id=$1",
   [id]
 );

 if(!r.rows.length){
   return res.status(404).json({error:"Solicitud no encontrada"});
 }

 await pool.query(
   "UPDATE friends SET status='accepted' WHERE id=$1",
   [id]
 );

 await pool.query(`
 INSERT INTO friends(user_id,friend_id,status)
 VALUES($1,$2,'accepted')
 `,[r.rows[0].friend_id, r.rows[0].user_id]);

 res.json({ok:true});
});

app.get('/friends/:id', async (req,res)=>{
 const r = await pool.query(`
 SELECT u.id, u.username
 FROM friends f
 JOIN users u ON u.id = f.friend_id
 WHERE f.user_id=$1 AND f.status='accepted'
 `,[req.params.id]);

 res.json(r.rows);
});

// ================= RANKING =================

app.get('/ranking', async (req,res)=>{
 const r = await pool.query(`
 SELECT u.username,
 COUNT(p.sticker) FILTER (WHERE p.owned=1) as total
 FROM users u
 LEFT JOIN progress p ON u.id=p.user_id
 GROUP BY u.id
 ORDER BY total DESC
 `);

 res.json(r.rows);
});

app.get('/ranking-friends/:id', async (req,res)=>{
 const r = await pool.query(`
 SELECT u.username,
 COUNT(p.sticker) FILTER (WHERE p.owned=1) as total
 FROM friends f
 JOIN users u ON u.id = f.friend_id
 LEFT JOIN progress p ON u.id=p.user_id
 WHERE f.user_id=$1
 GROUP BY u.username
 ORDER BY total DESC
 `,[req.params.id]);

 res.json(r.rows);
});

// ================= SERVER =================

app.listen(3000, ()=>console.log("Running on port 3000"));