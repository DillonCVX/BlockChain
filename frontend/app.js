// frontend/app.js
// Single-file vanilla JS SPA for Eth Event Scanner
// Expects backend at http://localhost:4000 and Socket.IO there.
// Make sure style.css is in same folder.

const API_BASE = 'http://localhost:4000';
const APP_ROOT_ID = 'app';

// small DOM helpers
const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).flat().forEach(c => {
    if (!c) return;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  });
  return e;
};

// Router: render based on hash (#/subscribe, #/events, default #/)
function navigate(path) {
  history.pushState(null, '', path.startsWith('#') ? path : ('#' + path));
  render();
}
function currentRoute(){
  const h = location.hash || '#/';
  return h.replace(/^#/, '');
}

// render main layout / navbar
function renderLayout(contentNode) {
  const root = document.getElementById(APP_ROOT_ID);
  root.innerHTML = '';
  const header = el('header', { class: 'navbar' }, [
    el('div', { class: 'logo', html: 'Eth Event Scanner' }),
    el('nav', {}, [
      navLink('#/', 'Home'),
      navLink('#/subscribe', 'Subscribe'),
      navLink('#/events', 'Events'),
      window.currentUser ? el('a', { href: '#/login', html: 'Logout', class: 'logout-link' }) : null
    ])
  ]);
  root.appendChild(header);
  const main = el('main', { class: 'container' }, contentNode);
  root.appendChild(main);
  const footer = el('footer', {}, el('div', { html: '&copy; 2025 Ethereum Event Scanner' }));
  root.appendChild(footer);
  // update active nav
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  const active = document.querySelector(`nav a[href="${location.hash || '#/'}"]`);
  if (active) active.classList.add('active');

  // Add logout functionality
  const logoutLink = document.querySelector('.logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      logout(); // Call the logout function from Login.js
    });
  }
}
function navLink(href, text){
  const a = el('a', { href, html: text });
  a.addEventListener('click', (ev) => { ev.preventDefault(); navigate(href); });
  return a;
}

// common state
let provider; // ethers provider (injected)
let signer;
let currentAccount = null;
let socket; // socket.io client
let eventsCache = [];

// lazy load socket.io client
async function loadSocketIo(){
  if (socket) return socket;
  // dynamic script tag for socket.io (v4)
  await new Promise((resolve, reject) => {
    if (window.io) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
  socket = io(API_BASE, { transports: ['websocket','polling'] });
  return socket;
}

// helper: connect injected wallet
async function connectWallet(elWalletInfo) {
  if (!window.ethereum) {
    elWalletInfo.textContent = 'No injected wallet (MetaMask).';
    return false;
  }
  if (typeof ethers === 'undefined') {
    console.error('Ethers library is not loaded.');
    elWalletInfo.textContent = 'Ethers library not loaded.';
    return false;
  }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
    await provider.send('eth_requestAccounts', []);
    signer = provider.getSigner();
    currentAccount = await signer.getAddress();
    const net = await provider.getNetwork();
    elWalletInfo.textContent = `Account: ${currentAccount.slice(0, 10)}…  Chain:${net.chainId}`;
    return true;
  } catch (e) {
    console.error('connectWallet', e);
    elWalletInfo.textContent = 'Wallet connect failed';
    return false;
  }
}

// fetch artifacts from backend
async function fetchArtifacts(){
  try {
    const res = await fetch(API_BASE + '/artifacts');
    if (!res.ok) throw new Error('artifacts failed');
    return await res.json();
  } catch(e){
    console.warn('fetchArtifacts', e);
    return [];
  }
}

// ---------- Views ---------- //

async function renderHome(){
  const card = el('div', { class: 'card' }, [
    el('h1', { html: 'Ethereum Event Scanner' }),
    el('p', { html: 'Single-file SPA. Use Subscribe to pick a contract (auto-detect from build artifacts). Use Events to watch detected events.'}),
    el('div', { html: '<br>' }),
    el('div', { html: `<a class="btn" href="#/subscribe">Go to Subscribe</a> <a class="btn" href="#/events" style="background:#94a3b8">View Events</a>`})
  ]);
  renderLayout(card);
}

// Subscribe view (ERC20 friendly)
async function renderSubscribe(){
  // elements
  const walletInfo = el('div', { class: 'small', html: 'Not connected' });
  const connectBtn = el('button', { class: 'btn', html: 'Connect Wallet' });
  connectBtn.addEventListener('click', async () => { await connectWallet(walletInfo); });

  const artifactSelect = el('select', { style: 'margin-left:auto;padding:8px;border-radius:8px;border:1px solid #e6eef5' }, [ el('option', { html: 'Loading artifacts...' }) ]);
  const refreshBtn = el('button', { class: 'btn', html: 'Refresh' });
  refreshBtn.addEventListener('click', async () => { await populateArtifacts(); });

  const artifactDetails = el('div', { class: 'small', html: 'Choose a contract artifact with deployed address (build/contracts/*.json).' });

  const recipientInput = el('input', { type: 'text', id: 'recipient', placeholder: '0x...' });
  const amountInput = el('input', { type: 'text', id: 'amount', placeholder: '1.0' });
  recipientInput.style.width = '100%'; amountInput.style.width = '100%';
  const sendBtn = el('button', { class: 'btn', html: 'Send Transfer' });
  const subscribeBtn = el('button', { class: 'btn secondary', html: 'Subscribe to Transfer events' });
  const status = el('div', { class: 'small', html: '' });

  const subsList = el('div', { class: 'small', html: 'Loading subscriptions...' });

  // layout card
  const card = el('div', { class: 'card' }, [
    el('h2', { html: 'ERC-20 Transfer & Subscribe (auto address)' }),
    el('div', { style: 'display:flex;gap:10px;align-items:center;margin-bottom:12px' }, [ connectBtn, walletInfo, artifactSelect, refreshBtn ]),
    artifactDetails,
    el('div', { html: '<hr style="margin:12px 0; border:none; border-top:1px solid #eef2f7;">' }),
    el('div', { id: 'ercBlock' }, [
      el('label', { html: 'Recipient address' }), recipientInput,
      el('label', { html: 'Amount (human units)' }), amountInput,
      el('div', { style: 'margin-top:10px; display:flex; gap:8px; align-items:center;' }, [ sendBtn, subscribeBtn, status ])
    ]),
    el('div', { class: 'subscriptions', style: 'margin-top:18px' }, [ el('h3', { html: 'Existing Subscriptions' }), subsList ])
  ]);

  renderLayout(card);

  // state
  let artifacts = [];
  let selectedArtifact = null;
  let selectedAddress = '';

  async function populateArtifacts(){
    artifactSelect.innerHTML = '';
    artifactSelect.appendChild(el('option', { value:'', html: 'Loading artifacts…' }));
    artifacts = await fetchArtifacts();
    artifactSelect.innerHTML = '';
    artifactSelect.appendChild(el('option', { value:'', html: '— select contract —' }));
    artifacts.forEach((a, idx) => {
      const first = (a.addresses && Object.keys(a.addresses).length>0) ? Object.values(a.addresses)[0] : '';
      const label = `${a.name}${first ? ' — ' + first : ''}`;
      artifactSelect.appendChild(el('option', { value: String(idx), html: label }));
    });
    artifactSelect.appendChild(el('option', { value: '-1', html: '— Manual / no artifact —' }));
  }
  await populateArtifacts();

  artifactSelect.addEventListener('change', (ev) => {
    const v = artifactSelect.value;
    selectedArtifact = null;
    selectedAddress = '';
    artifactDetails.textContent = '';
    if (!v) return;
    if (v === '-1') { artifactDetails.textContent = 'Manual mode'; return; }
    const art = artifacts[Number(v)];
    if (!art) return;
    selectedArtifact = art;
    const addrs = art.addresses || {};
    let addr = addrs['1337'] || Object.values(addrs)[0] || '';
    selectedAddress = addr;
    artifactDetails.innerHTML = `<strong>${art.name}</strong> ${addr ? ('— ' + addr) : '<em>(no deployed address)</em>'} <div class="small">ABI: ${art.abi? 'yes' : 'no'}</div>`;
    // if ERC20, enable inputs
    if (art.abi && isERC20(art.abi) && addr) {
      document.getElementById('ercBlock')?.style && (document.getElementById('ercBlock').style.display = 'block');
    } else {
      document.getElementById('ercBlock')?.style && (document.getElementById('ercBlock').style.display = 'none');
    }
  });

  async function refreshSubscriptions(){
    try {
      const r = await fetch(API_BASE + '/subscriptions');
      const j = await r.json();
      subsList.innerHTML = '';
      if (!j || j.length === 0) { subsList.innerHTML = '<div class="small">No subscriptions.</div>'; return; }
      j.forEach(s => {
        const d = el('div', { class: 'sub-item' }, [
          el('div', { html: `<strong>${s.contractAddress}</strong>` }),
          el('div', { class: 'small', html: `id: ${s.id} lastBlock: ${s.lastProcessedBlock ?? 'N/A'}` })
        ]);
        subsList.appendChild(d);
      });
    } catch(e){
      subsList.innerHTML = '<div class="small">Failed to load subscriptions</div>';
    }
  }
  await refreshSubscriptions();

  function isERC20(abi){
    if (!abi) return false;
    const names = abi.filter(x => x.type === 'function').map(f => f.name);
    return names.includes('transfer') && names.includes('decimals');
  }

  // Send token transfer
  sendBtn.addEventListener('click', async () => {
    try {
      status.style.color = '#475569'; status.textContent = 'Preparing...';
      if (!signer) {
        await connectWallet(walletInfo);
        if (!signer) { status.style.color='red'; status.textContent = 'Connect wallet first'; return; }
      }
      if (!selectedArtifact || !selectedAddress) { status.style.color='red'; status.textContent = 'Select artifact with deployed address'; return; }
      const abi = selectedArtifact.abi;
      if (!isERC20(abi)) { status.style.color='red'; status.textContent = 'Selected contract is not ERC20'; return; }
      const contract = new ethers.Contract(selectedAddress, abi, signer);
      const to = recipientInput.value.trim();
      if (!ethers.utils.isAddress(to)) { status.style.color='red'; status.textContent = 'Invalid recipient address'; return; }
      const human = amountInput.value.trim();
      if (!human || isNaN(Number(human))) { status.style.color='red'; status.textContent = 'Invalid amount'; return; }
      // decimals
      let decimals = 18;
      try { decimals = await contract.decimals(); if (decimals && decimals.toNumber) decimals = decimals.toNumber(); } catch(e){ decimals = 18; }
      const units = ethers.utils.parseUnits(human, decimals);
      status.textContent = 'Sending transfer...';
      const tx = await contract.transfer(to, units);
      status.textContent = 'Tx sent: ' + tx.hash;
      await tx.wait();
      status.style.color = 'green';
      status.textContent = 'Transfer mined: ' + tx.hash;
    } catch(e){
      console.error(e);
      status.style.color = 'red';
      status.textContent = 'Error: ' + (e && e.message ? e.message : String(e));
    }
  });

  // subscribe to Transfer events on backend
  subscribeBtn.addEventListener('click', async () => {
    try {
      status.style.color = '#475569'; status.textContent = 'Creating subscription...';
      if (!selectedArtifact || !selectedAddress){ status.style.color='red'; status.textContent='Select artifact with deployed address'; return; }
      const payload = { contractAddress: selectedAddress, eventSignature: 'Transfer(address,address,uint256)', abi: selectedArtifact.abi || null, fromBlock: 0 };
      const r = await fetch(API_BASE + '/subscribe', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok){ status.style.color='red'; status.textContent = 'Subscribe failed: ' + (j.error || JSON.stringify(j)); return; }
      status.style.color='green'; status.textContent = 'Subscribed id=' + (j.id || 'unknown');
      await refreshSubscriptions();
    } catch(e){
      console.error(e);
      status.style.color='red';
      status.textContent = 'Subscribe error: ' + (e && e.message ? e.message : String(e));
    }
  });
}

// Events view: shows historical events and listens via socket.io
async function renderEvents(){
  const card = el('div', { class: 'card' });
  const heading = el('h2', { html: 'Detected Events' });
  const exportBtn = el('button', { class: 'btn', html: 'Export CSV' });
  const filterAddress = el('input', { type: 'text', placeholder: 'Filter by contract address (0x...)' });
  const filterEvent = el('input', { type: 'text', placeholder: 'Filter by event name (Ping, Transfer)' });
  const applyFilter = el('button', { class: 'btn', html: 'Apply' });
  const clearFilter = el('button', { class: 'btn', html: 'Clear' });
  const table = el('table', {}, [
    el('thead', {}, [ el('tr', {}, [ el('th',{html:'Block'}), el('th',{html:'Tx Hash'}), el('th',{html:'Event'}), el('th',{html:'Args / Data'}), el('th',{html:'Contract'}), el('th',{html:'Time'}) ]) ]),
    el('tbody', { html: '<tr class="placeholder"><td colspan="6">Loading events...</td></tr>' })
  ]);
  card.appendChild(heading);
  const controls = el('div', { class: 'controls' }, [ filterAddress, filterEvent, applyFilter, clearFilter, exportBtn ]);
  card.appendChild(controls);
  card.appendChild(el('div', { style: 'overflow:auto' }, table));
  renderLayout(card);

  let events = [];

  function escapeHtml(s){ if(s === null || s === undefined) return ''; return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
  function renderTable(filtered){
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    const list = filtered || events.slice().sort((a,b)=>b.timestamp - a.timestamp);
    if(list.length === 0){
      tbody.innerHTML = '<tr class="placeholder"><td colspan="6">No events found.</td></tr>'; return;
    }
    list.forEach(ev => {
      const argsText = ev.decoded ? JSON.stringify(ev.decoded.args) : ev.data;
      const evName = ev.decoded ? ev.decoded.name : 'raw';
      const time = new Date(ev.timestamp).toLocaleString();
      const tr = el('tr', {}, [
        el('td', { html: String(ev.blockNumber) }),
        el('td', {}, [ el('a', { href:'#', html: ev.transactionHash.slice(0,12) + '…' }) ]),
        el('td', { html: escapeHtml(evName) }),
        el('td', {}, [ el('pre', { style:'white-space:pre-wrap;margin:0;font-family:monospace', html: escapeHtml(argsText) }) ]),
        el('td', { html: escapeHtml(ev.address) }),
        el('td', { class: 'small', html: escapeHtml(time) })
      ]);
      tbody.appendChild(tr);
    });
  }

  async function loadEvents(){
    try {
      const r = await fetch(API_BASE + '/events');
      events = await r.json() || [];
      renderTable();
    } catch(e){
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '<tr class="placeholder"><td colspan="6">Failed to load events: '+ (e && e.message ? e.message : String(e)) +'</td></tr>';
    }
  }
  await loadEvents();

  // socket live updates
  try {
    await loadSocketIo();
    socket.on('connect', ()=> console.log('socket connected', socket.id));
    socket.on('event', (ev) => {
      if(!events.find(e => e.id === ev.id)){ events.push(ev); renderTable(); }
    });
  } catch(e){ console.warn('socket failed', e); }

  function applyFilters(){
    const addr = (filterAddress.value || '').trim().toLowerCase();
    const name = (filterEvent.value || '').trim().toLowerCase();
    const f = events.filter(ev => {
      if (addr && (!ev.address || ev.address.toLowerCase().indexOf(addr) === -1)) return false;
      if (name) {
        const en = ev.decoded ? ev.decoded.name.toLowerCase() : 'raw';
        if (en.indexOf(name) === -1) return false;
      }
      return true;
    }).sort((a,b)=>b.timestamp - a.timestamp);
    renderTable(f);
  }
  applyFilter.addEventListener('click', applyFilters);
  clearFilter.addEventListener('click', ()=> { filterAddress.value=''; filterEvent.value=''; renderTable(); });

  exportBtn.addEventListener('click', ()=> {
    const rows = [['Block','TxHash','Event','Args','Address','Time']];
    for(const ev of events.slice().sort((a,b)=>b.timestamp - a.timestamp)){
      const argsText = ev.decoded ? JSON.stringify(ev.decoded.args) : ev.data;
      const time = new Date(ev.timestamp).toLocaleString();
      rows.push([ev.blockNumber, ev.transactionHash, ev.decoded ? ev.decoded.name : 'raw', argsText, ev.address, time]);
    }
    const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'events.csv'; a.click();
    URL.revokeObjectURL(url);
  });
}


// Ensure render is globally accessible
window.render = async function render() {
  // Redirect to login if user is not logged in
  if (!window.currentUser && currentRoute() !== '/login') {
    window.location.hash = "#/login";
    return renderLogin();
  }

  const route = currentRoute();
  if (route === '/' || route === '') return renderHome();
  if (route.startsWith('/subscribe')) return renderSubscribe();
  if (route.startsWith('/events')) return renderEvents();
  if (route.startsWith('/login')) return renderLogin();
  // default
  renderHome();
};

// Login view
function renderLogin() {
  const loginForm = el('div', { class: 'card' }, [
    el('h2', { html: 'Login' }),
    el('input', { id: 'username', placeholder: 'Enter your username', style: 'width:100%;margin-bottom:10px;' }),
    el('button', { class: 'btn', html: 'Login' }),
  ]);
  loginForm.querySelector('button').addEventListener('click', login); // Call the login function from Login.js
  renderLayout(loginForm);
}

// initial boot
window.addEventListener('popstate', render);
render();
