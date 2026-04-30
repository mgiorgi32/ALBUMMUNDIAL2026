const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

const db = new sqlite3.Database('./album.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER,
    sticker TEXT,
    owned INTEGER,
    PRIMARY KEY(user_id, sticker)
  )`);
});

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  db.run("INSERT INTO users (username,password) VALUES (?,?)", [username, password], function(err){
    if(err) return res.status(400).send(err.message);
    res.send({ id: this.lastID });
  });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username=? AND password=?", [username,password], (err,row)=>{
    if(!row) return res.status(401).send("Invalid");
    res.send(row);
  });
});

app.post('/progress', (req,res)=>{
  const { user_id, sticker, owned } = req.body;
  db.run(`INSERT OR REPLACE INTO progress(user_id, sticker, owned) VALUES(?,?,?)`, [user_id, sticker, owned]);
  res.send("ok");
});

app.get('/progress/:user_id', (req,res)=>{
  db.all("SELECT * FROM progress WHERE user_id=?", [req.params.user_id], (err,rows)=>{
    res.send(rows);
  });
});

app.listen(3000, ()=> console.log("Server running on http://localhost:3000"));
