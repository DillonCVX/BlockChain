// backend/index.js
// Minimal Ethereum Event Scanner backend using plain JSON file persistence.
//
// Dependencies:
//   npm install express cors ethers socket.io uuid
//
// Usage:
//   Set env vars if needed:
//     WS_PROVIDER (e.g. ws://127.0.0.1:7546)
//     HTTP_PROVIDER (e.g. http://127.0.0.1:7546)
//   node index.js

const express = require('express');
const http = require('http');
const cors = require('cors');
const { ethers } = require('ethers');
const { v4: uuidv4 } = require('uuid');
const socketio = require('socket.io');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

const DB_PATH = path.join(__dirname, 'db.json');

// --- DB helpers (ensure file exists, read/write) ---
async function ensureDb(){
  try {
    if(!fsSync.existsSync(DB_PATH)){
      const init = { subscriptions: [], events: [] };
      await fs.writeFile(DB_PATH, JSON.stringify(init, null, 2), 'utf8');
      return init;
    } else {
      const raw = await fs.readFile(DB_PATH, 'utf8');
      if(!raw || raw.trim() === ''){
        const init = { subscriptions: [], events: [] };
        await fs.writeFile(DB_PATH, JSON.stringify(init, null, 2), 'utf8');
        return init;
      }
      try {
        return JSON.parse(raw);
      } catch(e){
        // corrupted file - reset
        const init = { subscriptions: [], events: [] };
        await fs.writeFile(DB_PATH, JSON.stringify(init, null, 2), 'utf8');
        return init;
      }
    }
  } catch(e){
    console.error('ensureDb error', e);
    throw e;
  }
}

async function readDb(){
  const raw = await fs.readFile(DB_PATH, 'utf8');
  return JSON.parse(raw || '{}');
}

async function writeDb(obj){
  await fs.writeFile(DB_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

// initialize DB memory
let db = { subscriptions: [], events: [] };
(async function initDbNow(){
  db = await ensureDb();
})();

// --- App setup ---
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = socketio(server, { cors: { origin: '*' } });

// --- Provider init (safe) ---
const HTTP_URL = process.env.HTTP_PROVIDER || 'http://127.0.0.1:7546';
const WS_URL = process.env.WS_PROVIDER || 'ws://127.0.0.1:7546';

let provider;

function useHttpProvider() {
  console.warn('Using HTTP provider (no realtime). URL=', HTTP_URL);
  provider = new ethers.providers.JsonRpcProvider(HTTP_URL);
}

// Try to initialize WebSocket provider with graceful fallback & handlers
(function initProvider(){
  try {
    console.log('Attempting WebSocket provider at', WS_URL);
    provider = new ethers.providers.WebSocketProvider(WS_URL);

    // attach handlers so async websocket errors won't crash Node
    if (provider && provider._websocket) {
      provider._websocket.on('error', (err) => {
        console.warn('WebSocket error:', err && err.message ? err.message : err);
        try { useHttpProvider(); } catch(e) { console.error('HTTP fallback failed', e); }
      });
      provider._websocket.on('close', (code, reason) => {
        console.warn('WebSocket closed. code=', code, 'reason=', reason && reason.toString ? reason.toString() : reason);
        try { useHttpProvider(); } catch(e) { console.error('HTTP fallback failed', e); }
      });
    }
  } catch (e) {
    console.warn('WebSocket provider init failed:', e && e.message ? e.message : e);
    useHttpProvider();
  }
})();

// --- Helpers ---
const eventId = (log) => `${log.transactionHash}-${log.logIndex}`;

async function persistEvent(eventObj){
  db = await readDb();
  db.events = db.events || [];
  if(db.events.find(e => e.id === eventObj.id)) return false;
  db.events.push(eventObj);
  await writeDb(db);
  return true;
}

function parsedArgsToObject(args){
  const out = {};
  if(!args) return out;
  for(let i=0;i<args.length;i++){
    try { out[i] = args[i]?.toString ? args[i].toString() : args[i]; }
    catch(e){ out[i] = String(args[i]); }
  }
  for(const k in args){
    if(Number.isNaN(Number(k))) {
      try { out[k] = args[k]?.toString ? args[k].toString() : args[k]; }
      catch(e){ out[k] = String(args[k]); }
    }
  }
  return out;
}

// decode + persist logs
async function handleLogs(logs, subId){
  if(!logs || logs.length === 0) return;
  db = await readDb();
  const sub = db.subscriptions.find(s => s.id === subId);
  for(const log of logs){
    const id = eventId(log);
    if((db.events || []).find(e => e.id === id)) continue;
    let decoded = null;
    if(sub && sub.abi){
      try {
        const iface = new ethers.utils.Interface(sub.abi);
        decoded = iface.parseLog(log);
      } catch(e){
        decoded = null;
      }
    }
    const ev = {
      id,
      subscriptionId: subId,
      transactionHash: log.transactionHash,
      logIndex: log.logIndex,
      blockNumber: log.blockNumber,
      address: log.address,
      topics: log.topics,
      data: log.data,
      decoded: decoded ? { name: decoded.name, args: parsedArgsToObject(decoded.args) } : null,
      timestamp: Date.now()
    };
    const added = await persistEvent(ev);
    if(added) io.emit('event', ev);
  }
}

// subscription management
const managers = new Map();

async function startSubscription(sub){
  if(managers.has(sub.id)) return;

  let topics = [];
  if(sub.eventSignature){
    topics.push(ethers.utils.id(sub.eventSignature));
  } else if(sub.abi && sub.eventName){
    try {
      const iface = new ethers.utils.Interface(sub.abi);
      const frag = iface.getEvent(sub.eventName);
      topics.push(iface.getEventTopic(frag));
    } catch(e){
      topics.push(null);
    }
  } else {
    topics.push(null);
  }

  const filterBase = { address: sub.contractAddress, topics };

  db = await readDb();
  let fromBlock = (sub.lastProcessedBlock !== null && sub.lastProcessedBlock !== undefined) ? sub.lastProcessedBlock + 1 : (sub.fromBlock || 0);

  let latest;
  try { latest = await provider.getBlockNumber(); }
  catch(e) {
    console.warn('provider.getBlockNumber failed:', e.message || e);
    latest = fromBlock;
  }

  const BATCH = 2000;
  if(typeof latest === 'number' && fromBlock <= latest){
    for(let start = fromBlock; start <= latest; start += BATCH){
      const end = Math.min(start + BATCH - 1, latest);
      const histFilter = { ...filterBase, fromBlock: start, toBlock: end };
      try {
        const logs = await provider.getLogs(histFilter);
        await handleLogs(logs, sub.id);
      } catch(e){
        console.error('getLogs error', e.message || e);
      }
    }
    // update lastProcessedBlock
    db = await readDb();
    const stored = db.subscriptions.find(s => s.id === sub.id);
    if(stored){ stored.lastProcessedBlock = latest; await writeDb(db); }
  }

  // realtime listener (works if provider supports .on)
  const onLog = async (log) => {
    await handleLogs([log], sub.id);
    db = await readDb();
    const stored = db.subscriptions.find(s => s.id === sub.id);
    if(stored){
      if(!stored.lastProcessedBlock || log.blockNumber > stored.lastProcessedBlock){
        stored.lastProcessedBlock = log.blockNumber;
        await writeDb(db);
      }
    }
  };

  try {
    if (typeof provider.on === 'function') {
      provider.on(filterBase, onLog);
      managers.set(sub.id, { filter: filterBase, onLog });
      console.log('Realtime listener started for', sub.contractAddress, 'topics', topics);
    } else {
      console.warn('Provider does not support realtime .on for filters; realtime disabled for', sub.id);
    }
  } catch(e){
    console.warn('provider.on failed or not supported:', e.message || e);
  }
}

// REST endpoints
app.post('/subscribe', async (req, res) => {
  try {
    const { contractAddress, abi, eventSignature, eventName, fromBlock } = req.body;
    if(!contractAddress) return res.status(400).json({ error: 'contractAddress required' });
    const id = uuidv4();
    db = await readDb();
    const entry = {
      id,
      contractAddress,
      abi: abi || null,
      eventSignature: eventSignature || null,
      eventName: eventName || null,
      fromBlock: (fromBlock !== undefined && fromBlock !== null) ? Number(fromBlock) : null,
      lastProcessedBlock: null
    };
    db.subscriptions.push(entry);
    await writeDb(db);
    startSubscription(entry).catch(console.error);
    return res.json({ id });
  } catch(e){
    console.error('subscribe error', e);
    return res.status(500).json({ error: String(e) });
  }
});

app.get('/subscriptions', async (req, res) => {
  db = await readDb();
  res.json(db.subscriptions || []);
});

app.get('/events', async (req, res) => {
  db = await readDb();
  res.json(db.events || []);
});

// optional: trigger rescan for a subscription id
app.post('/rescan/:id', async (req, res) => {
  const id = req.params.id;
  db = await readDb();
  const sub = db.subscriptions.find(s => s.id === id);
  if(!sub) return res.status(404).json({ error: 'subscription not found' });
  // reset lastProcessedBlock to sub.fromBlock or 0, then start subscription
  sub.lastProcessedBlock = (sub.fromBlock !== undefined && sub.fromBlock !== null) ? sub.fromBlock : 0;
  await writeDb(db);
  startSubscription(sub).catch(console.error);
  res.json({ ok: true });
});

// serve static files one folder up (if your html lives there)
app.use(express.static(path.join(__dirname, '..')));

// socket.io connection
io.on('connection', socket => {
  console.log('socket connected', socket.id);
  socket.on('disconnect', () => {
    // nothing special
  });
});

// resume subscriptions on startup
(async function resumeAll(){
  try {
    db = await readDb();
    if(db && Array.isArray(db.subscriptions)){
      for(const s of db.subscriptions){
        if(s.lastProcessedBlock === undefined) s.lastProcessedBlock = null;
        startSubscription(s).catch(console.error);
      }
    }
  } catch(e){
    console.error('resume error', e);
  }
})();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log('Backend listening on', PORT));
