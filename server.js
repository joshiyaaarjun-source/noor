const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "noor_dev_secret_change_me";

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(express.static(__dirname));

const db = {
  users: [],
  periods: [],
  chats: [],
  webinars: [
    { id:"web_mental", title:"Mental Health & Self-Care", mentor:"Dr. Priya Sharma", mentorId:"demo_mentor_priya", date:addDaysKey(3), time:"18:00", category:"Mental Health", attendees:42, joinedUsers:[], createdBy:"system" },
    { id:"web_career", title:"Career Growth Strategies", mentor:"Anita Desai", mentorId:"demo_mentor_anita", date:addDaysKey(8), time:"17:30", category:"Career", attendees:31, joinedUsers:[], createdBy:"system" },
    { id:"web_nutrition", title:"Nutrition for Women's Health", mentor:"Dr. Meera Singh", mentorId:"demo_mentor_meera", date:addDaysKey(12), time:"19:00", category:"Nutrition", attendees:56, joinedUsers:[], createdBy:"system" }
  ],
  notifications: [],
  profiles: {}
};

function addDaysKey(days) {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}
function sign(user) {
  return jwt.sign({ id:user.id, type:user.type, email:user.email }, JWT_SECRET, { expiresIn:"7d" });
}
function safeUser(u) {
  return { id:u.id, name:u.name, email:u.email, type:u.type, verified:u.verified, trial:u.trial, expertise:u.expertise || "", createdAt:u.createdAt };
}
function auth(req,res,next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ message:"Authentication required" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message:"Invalid or expired token" });
  }
}
function mentorOnly(req,res,next) {
  if (req.user.type !== "mentor") return res.status(403).json({ message:"Mentor access required" });
  next();
}
function seedUser(id) {
  if (!db.notifications.some(n => n.userId === id)) {
    const now = new Date().toISOString();
    db.notifications.push(
      {id:id+"_"+id+"n1", userId:id, type:"Period", title:"Your period is expected in 3 days", message:"Based on your demo cycle prediction.", time:now, read:false},
      {id:id+"_"+id+"n2", userId:id, type:"Webinar", title:"New webinar: Mental Health & Self-Care", message:"A new session is available for you.", time:now, read:false},
      {id:id+"_"+id+"n3", userId:id, type:"Wellness", title:"Reminder: Stay hydrated today!", message:"Small wellness habits can make a difference.", time:now, read:false}
    );
  }
  if (!db.chats.some(c => c.userId === id)) {
    db.chats.push({id:id("chat"), userId:id, sender:"ai", text:"Hi! I'm your Noor demo companion. Tell me how you're feeling, ask for a wellness idea, or simply talk. 🌷", time:new Date().toISOString()});
  }
}

app.get("/api/health", (req,res) => res.json({ ok:true, service:"Noor API", database:"in-memory", message:"Backend is running without MongoDB." }));

app.post("/api/auth/register", async (req,res) => {
  try {
    const {name,email,password,type="user",expertise=""} = req.body;
    if (!name || !email || !password) return res.status(400).json({message:"Name, email and password are required."});
    if (!["user","mentor"].includes(type)) return res.status(400).json({message:"Invalid account type."});
    const normalized = email.trim().toLowerCase();
    if (db.users.some(u => u.email === normalized)) return res.status(409).json({message:"An account with this email already exists."});
    const passwordHash = await bcrypt.hash(password, 12);
    const user = {id:id("user"), name:name.trim(), email:normalized, passwordHash, type, verified:type==="mentor", trial:type==="user", expertise:String(expertise||"").trim(), createdAt:new Date().toISOString()};
    db.users.push(user);
    db.profiles[user.id] = {name:user.name,email:user.email,phone:"",bio:"",expertise:user.expertise};
    seedUser(user.id);
    res.status(201).json({user:safeUser(user), token:sign(user)});
  } catch (e) { res.status(500).json({message:"Registration failed."}); }
});

app.post("/api/auth/login", async (req,res) => {
  const {email,password,type="user"} = req.body;
  const user = db.users.find(u => u.email === String(email||"").trim().toLowerCase() && u.type === type);
  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) return res.status(401).json({message:"Invalid email, password, or account type."});
  seedUser(user.id);
  res.json({user:safeUser(user), token:sign(user)});
});

app.get("/api/auth/me", auth, (req,res) => {
  const u = db.users.find(x => x.id === req.user.id);
  if (!u) return res.status(404).json({message:"User not found"});
  res.json({user:safeUser(u)});
});

app.get("/api/dashboard", auth, (req,res) => {
  seedUser(req.user.id);
  const periods = db.periods.filter(p=>p.userId===req.user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const notifications = db.notifications.filter(n=>n.userId===req.user.id).sort((a,b)=>new Date(b.time)-new Date(a.time));
  const webinars = [...db.webinars].sort((a,b)=>a.date.localeCompare(b.date));
  res.json({periods, notifications, webinars, unreadNotifications:notifications.filter(n=>!n.read).length, profile:db.profiles[req.user.id]||{}});
});

app.get("/api/periods", auth, (req,res) => res.json(db.periods.filter(p=>p.userId===req.user.id).sort((a,b)=>b.date.localeCompare(a.date))));
app.post("/api/periods", auth, (req,res) => {
  const p = {...req.body, id:id("period"), userId:req.user.id, createdAt:new Date().toISOString()};
  if (!p.date) return res.status(400).json({message:"Period date is required."});
  p.cycleLength = Number(p.cycleLength)||28;
  p.periodLength = Number(p.periodLength)||5;
  p.symptoms = Array.isArray(p.symptoms)?p.symptoms:[];
  db.periods.push(p);
  db.notifications.push({id:id("n"),userId:req.user.id,type:"Period",title:"Period entry saved",message:`Your ${p.date} cycle entry has been added.`,time:new Date().toISOString(),read:false});
  res.status(201).json(p);
});

app.get("/api/chat", auth, (req,res) => res.json(db.chats.filter(c=>c.userId===req.user.id).sort((a,b)=>new Date(a.time)-new Date(b.time))));
function aiResponse(text) {
  const t=String(text||"").toLowerCase();
  if(t.includes("period")||t.includes("cycle")) return "Cycle tracking can help you notice patterns. Remember that predictions are estimates, not medical advice. 🌷";
  if(t.includes("stress")||t.includes("anxious")||t.includes("sad")) return "That sounds difficult. Try taking one small, gentle step right now: breathe slowly, drink some water, and give yourself a little space.";
  if(t.includes("food")||t.includes("eat")||t.includes("nutrition")) return "A balanced meal, enough fluids, and regular nourishment can support everyday wellbeing.";
  if(t.includes("tired")||t.includes("fatigue")) return "It sounds like your body may be asking for kindness. A short break, water, a nourishing snack, and gentle movement may help.";
  if(t.includes("hi")||t.includes("hello")||t.includes("hey")) return "Hey 🌷 I'm here with you. What's on your mind today?";
  return "Your feelings are valid. You deserve support, rest and a little softness today.";
}
app.post("/api/chat", auth, (req,res) => {
  const text=String(req.body.text||"").trim();
  if(!text) return res.status(400).json({message:"Message is required."});
  const userMsg={id:id("chat"),userId:req.user.id,sender:"user",text,time:new Date().toISOString()};
  const aiMsg={id:id("chat"),userId:req.user.id,sender:"ai",text:aiResponse(text),time:new Date().toISOString()};
  db.chats.push(userMsg,aiMsg);
  res.json({messages:[userMsg,aiMsg]});
});

app.get("/api/webinars", auth, (req,res) => res.json([...db.webinars].sort((a,b)=>a.date.localeCompare(b.date))));
app.post("/api/webinars", auth, mentorOnly, (req,res) => {
  const {title,category,date,time}=req.body;
  if(!title||!category||!date||!time) return res.status(400).json({message:"Title, category, date and time are required."});
  const u=db.users.find(x=>x.id===req.user.id);
  const w={id:id("web"),title,category,date,time,mentor:u.name,mentorId:u.id,attendees:0,joinedUsers:[],createdBy:u.id};
  db.webinars.push(w);
  res.status(201).json(w);
});
app.post("/api/webinars/:id/join", auth, (req,res) => {
  const w=db.webinars.find(x=>x.id===req.params.id);
  if(!w) return res.status(404).json({message:"Webinar not found."});
  w.joinedUsers=w.joinedUsers||[];
  if(!w.joinedUsers.includes(req.user.id)){w.joinedUsers.push(req.user.id);w.attendees=(w.attendees||0)+1;}
  db.notifications.push({id:id("n"),userId:req.user.id,type:"Webinar",title:"Webinar registration confirmed",message:`You're registered for ${w.title}.`,time:new Date().toISOString(),read:false});
  res.json(w);
});

app.get("/api/notifications", auth, (req,res) => res.json(db.notifications.filter(n=>n.userId===req.user.id).sort((a,b)=>new Date(b.time)-new Date(a.time))));
app.patch("/api/notifications/:id/read", auth, (req,res) => {
  const n=db.notifications.find(x=>x.id===req.params.id&&x.userId===req.user.id);
  if(!n) return res.status(404).json({message:"Notification not found."});
  n.read=true; res.json(n);
});
app.patch("/api/notifications/read-all", auth, (req,res) => {
  db.notifications.filter(n=>n.userId===req.user.id).forEach(n=>n.read=true);
  res.json({ok:true});
});

app.get("/api/profile", auth, (req,res) => res.json(db.profiles[req.user.id]||{}));
app.put("/api/profile", auth, (req,res) => {
  const p=db.profiles[req.user.id]||{};
  const next={...p,name:String(req.body.name||p.name||""),phone:String(req.body.phone||""),bio:String(req.body.bio||""),expertise:String(req.body.expertise||p.expertise||""),email:p.email};
  db.profiles[req.user.id]=next;
  const u=db.users.find(x=>x.id===req.user.id);
  if(u){u.name=next.name;u.expertise=next.expertise;}
  res.json(next);
});

app.get("/api/mentor/webinars", auth, mentorOnly, (req,res) => res.json(db.webinars.filter(w=>w.createdBy===req.user.id)));
app.get("/", (req,res)=>res.sendFile(path.join(__dirname,"index.html")));

app.listen(PORT,()=>console.log(`Noor API running on http://localhost:${PORT} (in-memory mode)`));
