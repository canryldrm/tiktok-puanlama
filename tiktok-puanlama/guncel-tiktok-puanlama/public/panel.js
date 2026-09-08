window.onerror = function(message, source, lineno, colno, error) {
  // alert('HATA: ' + message + ' (Satır: ' + lineno + ')');
  console.error(message, error);
};

const socket = io();

// Oda (Room) Sistemini Başlat
const urlParams = new URLSearchParams(window.location.search);
let currentRoomId = urlParams.get('room');

if (!currentRoomId) {
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  window.location.href = `?room=${randomId}`;
}

// Odaya katıl
socket.on('connect', () => {
  socket.emit('joinRoom', currentRoomId);
});

let globalState = {};

// Overlay URL'lerini otomatik ayarla
const overlayUrl = `${window.location.origin}/overlay.html?room=${currentRoomId}`;
document.getElementById('overlay-url').value = overlayUrl;

const raconOverlayUrl = `${window.location.origin}/racon-overlay.html?room=${currentRoomId}`;
document.getElementById('racon-overlay-url').value = raconOverlayUrl;

const leaderboardOverlayUrl = `${window.location.origin}/leaderboard-overlay.html?room=${currentRoomId}`;
document.getElementById('leaderboard-overlay-url').value = leaderboardOverlayUrl;

function copyOverlayUrl() {
  const input = document.getElementById('overlay-url');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Ana Overlay URL kopyalandı!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Ana Overlay URL kopyalandı!', 'success');
  });
}

function copyRaconOverlayUrl() {
  const input = document.getElementById('racon-overlay-url');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Racon Overlay URL kopyalandı!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Racon Overlay URL kopyalandı!', 'success');
  });
}

function copyLeaderboardOverlayUrl() {
  const input = document.getElementById('leaderboard-overlay-url');
  navigator.clipboard.writeText(input.value).then(() => {
    showToast('Sıralama Overlay URL kopyalandı!', 'success');
  }).catch(() => {
    input.select();
    document.execCommand('copy');
    showToast('Sıralama Overlay URL kopyalandı!', 'success');
  });
}

// =============================================
// SOCKET EVENTS
// =============================================
socket.on('state:update', (data) => {
  globalState = data;
  updateConnectionUI(data.connected, data.tiktokUsername);
  updateVotingControls(data.votingActive, data.connected);
  updateStats(data);
  updateVotesTable(data.votes || []);
  updateRaconsTable(data.racons || []);
  updateQueue(data.queue || [], data.currentQueueIndex);
  updateHistoryTable(data.history || []);
});

// =============================================
// API CALLS
// =============================================
async function apiCall(endpoint, method = 'POST', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      body.roomId = currentRoomId;
      options.body = JSON.stringify(body);
    } else if (method === 'POST') {
      options.body = JSON.stringify({ roomId: currentRoomId });
    }

    const res = await fetch(endpoint, options);
    const data = await res.json();
    if (!data.success) {
      showToast(data.error || 'Bir hata oluştu', 'error');
    } else if (data.message) {
      showToast(data.message, 'success');
    }
    return data;
  } catch (err) {
    showToast('Sunucu bağlantı hatası!', 'error');
    console.error(err);
  }
}

// =============================================
// ACTION FUNCTIONS (HTML onclick)
// =============================================

function connectTikTok() {
  const username = document.getElementById('tiktok-username').value;
  if (!username) return showToast('Lütfen bir kullanıcı adı girin', 'error');
  const btn = document.getElementById('btn-connect');
  btn.disabled = true;
  btn.textContent = 'Bağlanıyor...';
  apiCall('/api/connect', 'POST', { username }).finally(() => {
    btn.disabled = false;
    btn.textContent = 'Bağlan';
  });
}

function disconnectTikTok() {
  apiCall('/api/disconnect', 'POST');
}

function updateRaconGiftInput() {
  const select = document.getElementById('racon-gift-select');
  const input = document.getElementById('racon-gift-name');
  if (select.value === 'custom') {
    input.style.display = 'block';
    input.value = '';
    input.focus();
  } else {
    input.style.display = 'none';
    input.value = select.value;
  }
}

function saveRaconSettings() {
  const select = document.getElementById('racon-gift-select');
  const giftName = select.value === 'custom' ? document.getElementById('racon-gift-name').value : select.value;
  const sortType = document.getElementById('racon-sort-type').value;
  apiCall('/api/settings/racon', 'POST', { giftName, sortType });
}

function startVoting() {
  const durationInput = document.getElementById('voting-duration');
  const duration = durationInput ? parseInt(durationInput.value, 10) : 30;
  apiCall('/api/voting/start', 'POST', { duration: duration });
}

function stopVoting() {
  apiCall('/api/voting/stop', 'POST');
}

function addVote() {
  const username = document.getElementById('vote-username').value || 'PanelUser';
  const score = document.getElementById('vote-score').value;
  if (!score) return showToast('Puan girin', 'error');
  apiCall('/api/vote', 'POST', { username, score });
  document.getElementById('vote-username').value = '';
  document.getElementById('vote-score').value = '';
}

function quickScore(score) {
  const username = document.getElementById('vote-username').value || 'PanelUser';
  apiCall('/api/vote', 'POST', { username, score });
  document.getElementById('vote-username').value = '';
  document.getElementById('vote-score').value = '';
}

function addRacon() {
  const username = document.getElementById('racon-username').value || 'RaconKralı';
  const coins = parseInt(document.getElementById('racon-coins').value, 10) || 100;
  apiCall('/api/racon', 'POST', { username, coins });
  document.getElementById('racon-username').value = '';
  document.getElementById('racon-coins').value = '';
}

function addToQueue() {
  const name = document.getElementById('queue-name').value;
  if (!name) return;
  apiCall('/api/queue/add', 'POST', { name }).then(() => {
    document.getElementById('queue-name').value = '';
  });
}

function nextInQueue() {
  apiCall('/api/queue/next', 'POST');
}

function removeQueueItem(index) {
  fetch(`/api/queue/remove/${index}?roomId=${currentRoomId}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
      if(data.success) showToast(data.message, 'success');
      else showToast(data.error, 'error');
    });
}

function resetAll() {
  if (confirm('Tüm oylar, kuyruk ve geçmiş silinecek. Emin misiniz?')) {
    apiCall('/api/reset', 'POST');
  }
}

function sendTestData(type) {
  apiCall('/api/test/trigger', 'POST', { type });
}

// =============================================
// UI UPDATERS
// =============================================
function updateConnectionUI(connected, username) {
  const statusDot = document.getElementById('connection-dot');
  const statusText = document.getElementById('connection-text');
  
  if (connected) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = `@${username} yayınına bağlı`;
    document.getElementById('btn-disconnect').disabled = false;
    document.getElementById('btn-connect').disabled = true;
  } else {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'Bağlı değil';
    document.getElementById('btn-disconnect').disabled = true;
    document.getElementById('btn-connect').disabled = false;
  }
}

function updateVotingControls(votingActive, connected) {
  const startBtn = document.getElementById('btn-start-voting');
  const stopBtn = document.getElementById('btn-stop-voting');
  
  if (votingActive) {
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

function updateStats(data) {
  document.getElementById('stat-total-votes').textContent = data.totalVotes || 0;
  document.getElementById('stat-avg-score').textContent = (data.average || 0).toFixed(1);
  document.getElementById('stat-time-left').textContent = `${data.timeLeft || 0}s`;

  let max = 0, min = 10;
  if (data.votes && data.votes.length > 0) {
    data.votes.forEach(v => {
      if (v.score > max) max = v.score;
      if (v.score < min) min = v.score;
    });
    document.getElementById('stat-highest').textContent = max;
    document.getElementById('stat-lowest').textContent = min;
  } else {
    document.getElementById('stat-highest').textContent = '-';
    document.getElementById('stat-lowest').textContent = '-';
  }
}

function formatTime(ms) {
  const d = new Date(ms);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
}

function updateVotesTable(votes) {
  const tbody = document.querySelector('#votes-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  [...votes].sort((a, b) => b.timestamp - a.timestamp).forEach(vote => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${vote.username}</td><td>${vote.score}</td><td><small>${formatTime(vote.timestamp)}</small></td>`;
    tbody.appendChild(tr);
  });
}

function updateRaconsTable(racons) {
  const tbody = document.querySelector('#racons-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  [...racons].sort((a, b) => b.timestamp - a.timestamp).forEach(racon => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${racon.username}</td><td>${racon.coins || '-'}</td><td><small>${formatTime(racon.timestamp)}</small></td>`;
    tbody.appendChild(tr);
  });
}

function updateQueue(queue, currentIndex) {
  const container = document.getElementById('queue-list');
  if(!container) return;
  container.innerHTML = '';
  queue.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'queue-item' + (index === currentIndex ? ' active' : '');
    
    let resultBadge = '';
    if (item.result !== null) {
      resultBadge = `<span class="badge" style="background:#00ff88;color:#000;padding:2px 6px;border-radius:4px;font-size:12px;">${item.result} Puan</span>`;
    }

    div.innerHTML = `
      <span>${index === currentIndex ? '👉 ' : ''}<strong>${item.name}</strong> ${resultBadge}</span>
      <button class="btn btn-danger" style="padding:4px 8px; font-size:12px;" onclick="removeQueueItem(${index})">X</button>
    `;
    container.appendChild(div);
  });
}

function updateHistoryTable(history) {
  const tbody = document.querySelector('#history-table tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  history.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${item.name}</td><td><strong>${item.average}</strong></td><td>${item.totalVotes}</td><td><small>${formatTime(item.timestamp)}</small></td>`;
    tbody.appendChild(tr);
  });
}

// Basit bir Toast
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast-container');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-container';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '9999';
    document.body.appendChild(toast);
  }
  
  const el = document.createElement('div');
  el.style.background = type === 'error' ? '#ff4444' : (type === 'success' ? '#00C851' : '#33b5e5');
  el.style.color = 'white';
  el.style.padding = '10px 20px';
  el.style.borderRadius = '5px';
  el.style.marginTop = '10px';
  el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
  el.textContent = message;
  
  toast.appendChild(el);
  
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.5s';
    setTimeout(() => el.remove(), 500);
  }, 3000);
}

socket.on('gifts:update', (gifts) => {
  renderKnownGifts(gifts);
});

function renderKnownGifts(gifts) {
  const container = document.getElementById('known-gifts-container');
  if (!container) return;
  container.innerHTML = '';
  
  if (!gifts || gifts.length === 0) {
    container.innerHTML = '<span style="color:#aaa; font-size:12px;">Henüz hediye algılanmadı...</span>';
    return;
  }
  
  gifts.forEach(g => {
    const btn = document.createElement('div');
    btn.className = 'btn-gift';
    btn.style.cssText = 'display:inline-flex; align-items:center; gap:5px; background:rgba(0,0,0,0.4); padding:5px 10px; border-radius:20px; cursor:pointer; border:1px solid #333; transition:0.2s;';
    
    btn.onmouseover = () => btn.style.border = '1px solid #FFD700';
    btn.onmouseout = () => btn.style.border = '1px solid #333';
    
    btn.onclick = () => {
      const select = document.getElementById('racon-gift-select');
      const input = document.getElementById('racon-gift-name');
      select.value = 'custom';
      input.style.display = 'block';
      input.value = g.name;
      saveRaconSettings();
      showToast(g.name + ' Racon hediyesi seçildi!', 'success');
    };
    
    if (g.pictureUrl) {
      const img = document.createElement('img');
      img.src = g.pictureUrl;
      img.style.cssText = 'width:24px; height:24px; border-radius:50%; object-fit:cover;';
      btn.appendChild(img);
    }
    
    const text = document.createElement('span');
    text.textContent = g.name + ' (' + g.coins + ')';
    text.style.cssText = 'color:white; font-size:12px;';
    btn.appendChild(text);
    
    container.appendChild(btn);
  });
}

