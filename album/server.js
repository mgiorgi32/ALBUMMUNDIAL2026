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

// tablas
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
  PRIMARY KEY(user_id, sticker)
 )`);
})();

// register
app.post('/register', async (req,res)=>{
 const {username,password} = req.body;

 if(!username || !password){
  return res.status(400).json({error:"Datos inválidos"});
 }

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

// login
app.post('/login', async (req,res)=>{
 const {username,password} = req.body;

 const r = await pool.query("SELECT * FROM users WHERE username=$1",[username]);
 if(r.rows.length===0) return res.status(401).json({error:"Invalid"});

 const user = r.rows[0];
 const valid = await bcrypt.compare(password,user.password);

 if(!valid) return res.status(401).json({error:"Invalid"});

 res.json(user);
});

// progress
app.post('/progress', async (req,res)=>{
 const {user_id,sticker,owned} = req.body;

 await pool.query(
  `INSERT INTO progress(user_id,sticker,owned)
   VALUES($1,$2,$3)
   ON CONFLICT (user_id,sticker)
   DO UPDATE SET owned=$3`,
  [user_id,sticker,owned]
 );

 res.json({ok:true});
});

app.get('/progress/:id', async (req,res)=>{
 const r = await pool.query("SELECT * FROM progress WHERE user_id=$1",[req.params.id]);
 res.json(r.rows);
});

app.listen(3000, ()=>console.log("Running on 3000"));