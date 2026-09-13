window.onerror = function(message, source, lineno, colno, error) {
  // alert('HATA: ' + message + ' (Satır: ' + lineno + ')');
  console.error(message, error);
};

const socket = io();

// Oda (Room) Sistemini Başlat
const urlParams = new URLSearchParams(window.location.search);
let currentRoomId = urlParams.get('room');

if (!currentRoomId) {
  let savedRoomId = localStorage.getItem('tiktok_room_id');
  if (savedRoomId) {
    window.location.href = '?room=' + savedRoomId;
  } else {
    let userInput = prompt("Lütfen Yayıncı/Oda Adınızı Girin (OBS linkleri buna göre oluşacak, boşluk bırakmayın):");
    if (userInput && userInput.trim() !== "") {
        const cleanId = userInput.trim().replace(/[^a-zA-Z0-9_-]/g, "");
        localStorage.setItem("tiktok_room_id", cleanId);
        window.location.href = "?room=" + cleanId;
    } else {
        const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        localStorage.setItem('tiktok_room_id', randomId);
        window.location.href = '?room=' + randomId;
    }
  }
} else {
  localStorage.setItem('tiktok_room_id', currentRoomId);
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

const likesOverlayUrl = `${window.location.origin}/likes-overlay.html?room=${currentRoomId}`;
document.getElementById('likes-overlay-url').value = likesOverlayUrl;

const mekanOverlayUrl = `${window.location.origin}/mekan-overlay.html?room=${currentRoomId}`;
document.getElementById('mekan-overlay-url').value = mekanOverlayUrl;

const raconKraliOverlayUrl = `${window.location.origin}/raconkrali-overlay.html?room=${currentRoomId}`;
document.getElementById('raconkrali-overlay-url').value = raconKraliOverlayUrl;

const winOverlayUrl = `${window.location.origin}/win-overlay.html?room=${currentRoomId}`;
document.getElementById('win-overlay-url').value = winOverlayUrl;

const followerOverlayUrl = `${window.location.origin}/follower-overlay.html?room=${currentRoomId}`;
document.getElementById('follower-overlay-url').value = followerOverlayUrl;





function copyUrl(id, name) {
  const input = document.getElementById(id);
  if (!input) return;
  navigator.clipboard.writeText(input.value).then(() => {
    alert(`${name} Overlay URL'si kopyalandı:\n` + input.value);
  });
}

function copyOverlayUrl() { copyUrl('overlay-url', 'Oylama'); }
function copyRaconOverlayUrl() { copyUrl('racon-overlay-url', 'Racon Sıralaması'); }
function copyLeaderboardOverlayUrl() { copyUrl('leaderboard-overlay-url', 'Oylama Sıralaması'); }

// Eski copy fonksiyonlarını sildim.

// =============================================
// SOCKET EVENTS
// =============================================
socket.on('state:update', (data) => {
  globalState = data;
  updateConnectionUI(data.connected, data.tiktokUsername);
  updateVotingControls(data.votingActive, data.connected);
  document.getElementById('panel-win-count').textContent = `${data.wins || 0} / ${data.targetWins || 10}`;
  if (data.themeColor) document.getElementById('theme-color-input').value = data.themeColor;
  if (data.vsSettings) {
      if(document.getElementById('vs-green-gift')) document.getElementById('vs-green-gift').value = data.vsSettings.greenGift || '';
      if(document.getElementById('vs-red-gift')) document.getElementById('vs-red-gift').value = data.vsSettings.redGift || '';
  }
  if (data.vipOverride) {
      if (data.vipOverride.mekanName) document.getElementById('vip-mekan-input').value = data.vipOverride.mekanName;
      if (data.vipOverride.mekanText !== undefined) document.getElementById('vip-mekan-text').value = data.vipOverride.mekanText || '';
      if (data.vipOverride.raconName) document.getElementById('vip-racon-input').value = data.vipOverride.raconName;
      if (data.vipOverride.raconText !== undefined) document.getElementById('vip-racon-text').value = data.vipOverride.raconText || '';
  }
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
        let errMsg = data.error || 'Bir hata oluştu';
        if (data.details) errMsg += ' Detay: ' + data.details;
        showToast(errMsg, 'error');
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
    const vsGreenSelect = document.getElementById('vs-green-gift');
    const vsRedSelect = document.getElementById('vs-red-gift');
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
    const vsGreenSelect = document.getElementById('vs-green-gift');
    const vsRedSelect = document.getElementById('vs-red-gift');
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
  // Canlı istatistikler arayüzden kaldırıldı.
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
        html += `<option value="\">\ (\ 💎)</option>`;
    const btn = document.createElement('div');
    btn.className = 'btn-gift';
    btn.style.cssText = 'display:inline-flex; align-items:center; gap:5px; background:rgba(0,0,0,0.4); padding:5px 10px; border-radius:20px; cursor:pointer; border:1px solid #333; transition:0.2s;';
    
    btn.onmouseover = () => btn.style.border = '1px solid #FFD700';
    btn.onmouseout = () => btn.style.border = '1px solid #333';
    
    btn.onclick = () => {
      const select = document.getElementById('racon-gift-select');
    const vsGreenSelect = document.getElementById('vs-green-gift');
    const vsRedSelect = document.getElementById('vs-red-gift');
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


function updateWins(action) { socket.emit('updateWins', { roomId: currentRoomId, action }); }


function setWinCustomText() { 
    const text = document.getElementById('win-custom-text-input').value; 
    socket.emit('setWinCustomText', { roomId: currentRoomId, text }); 
}
function setTargetWin() {  const target = document.getElementById('win-target-input').value; socket.emit('setTargetWins', { roomId: currentRoomId, target }); }


function setThemeColor() { const color = document.getElementById('theme-color-input').value; socket.emit('setThemeColor', { roomId: currentRoomId, color }); }


function setVipOverride(type, inputId, textId) {
  const username = document.getElementById(inputId).value;
  const text = document.getElementById(textId).value;
  socket.emit('setVipOverride', { roomId: currentRoomId, type, username, text });
}

function clearVipOverride(type, inputId, textId) {
  document.getElementById(inputId).value = '';
  document.getElementById(textId).value = '';
  socket.emit('setVipOverride', { roomId: currentRoomId, type, username: null, text: null });
}





function updateGoal() {
  const title = document.getElementById('goal-title').value;
  const target = parseInt(document.getElementById('goal-target').value) || 0;
  socket.emit('updateGoal', { roomId: currentRoomId, title, target });
}
function addGoal(amount) {
  socket.emit('addGoalAmount', { roomId: currentRoomId, amount });
}
function timerAction(action) {
  socket.emit('timerAction', { roomId: currentRoomId, action });
}



document.getElementById("alert-overlay-url").value = `${window.location.origin}/alert-overlay.html?room=${currentRoomId}`;
document.getElementById("goal-overlay-url").value = `${window.location.origin}/goal-overlay.html?room=${currentRoomId}`;
document.getElementById("timer-overlay-url").value = `${window.location.origin}/timer-overlay.html?room=${currentRoomId}`;
  const kuleEl = document.getElementById('kule-overlay-url'); if(kuleEl) kuleEl.value = `${window.location.origin}/kule-overlay.html?room=${currentRoomId}`;
  const vsEl = document.getElementById('vs-overlay-url'); if(vsEl) vsEl.value = `${window.location.origin}/vs-overlay.html?room=${currentRoomId}`;
  const asEl = document.getElementById('allstar-overlay-url'); if(asEl) asEl.value = `${window.location.origin}/allstar-overlay.html?room=${currentRoomId}`;

  
  

fetch('/api/gifts')
  .then(res => res.json())
  .then(gifts => {
    const select = document.getElementById('racon-gift-select');
    const vsGreenSelect = document.getElementById('vs-green-gift');
    const vsRedSelect = document.getElementById('vs-red-gift');
    if(gifts && gifts.length > 0) {
      gifts.sort((a,b) => b.diamond_count - a.diamond_count);
      
      let html = '<option value="">-- Tüm Hediyeler --</option>';
      gifts.forEach(g => {
        html += `<option value="\">\ (\ 💎)</option>`;
        html += `<option value="${g.name}">${g.name} (${g.diamond_count} 💎)</option>`;
      });
      html += '<option value="custom">Özel (Alttan Yazın)</option>';
      select.innerHTML = html;
      if(vsGreenSelect) vsGreenSelect.innerHTML = html;
      if(vsRedSelect) vsRedSelect.innerHTML = html;
        
        let asHtml = '<option value="">-- Sadece Yorum --</option>';
          gifts.forEach(g => {
            const pic = g.image && g.image.url_list ? g.image.url_list[0] : '';
            asHtml += `<option value="${g.name}" data-image="${pic}">${g.name} (${g.diamond_count} Jeton)</option>`;
          });
          if(document.getElementById('as-gift-1')) document.getElementById('as-gift-1').innerHTML = asHtml;
          if(document.getElementById('as-gift-2')) document.getElementById('as-gift-2').innerHTML = asHtml;
          if(document.getElementById('as-gift-3')) document.getElementById('as-gift-3').innerHTML = asHtml;
          if(document.getElementById('as-gift-4')) document.getElementById('as-gift-4').innerHTML = asHtml;

          // Select2 Init
          setTimeout(() => {
            function formatGift(gift) {
              if (!gift.id) return gift.text;
              var imageUrl = $(gift.element).attr("data-image");
              if (!imageUrl) return gift.text;
              return $(`<span style="display:flex; align-items:center; gap:10px;"><img src="${imageUrl}" style="width:24px; height:24px; object-fit:contain; border-radius:4px;" /> ${gift.text}</span>`);
            }
            $(".as-gift").select2({
              templateResult: formatGift,
              templateSelection: formatGift
            });
          }, 100);

      
      // Select the current racon setting if possible
      // This part could be left alone, but we at least populate the list
    }
  });







// --- F9 KISAYOL TUŞU EKLENTİSİ ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'F9') {
    e.preventDefault();
    if (!document.getElementById('btn-start-voting').disabled) {
      startVoting();
    } else if (!document.getElementById('btn-stop-voting').disabled) {
      stopVoting();
    }
  }
});





function saveVSSettings() {
    const greenGift = document.getElementById('vs-green-gift').value;
    const redGift = document.getElementById('vs-red-gift').value;
    
    apiCall('/api/vs-settings', 'POST', { roomId: currentRoomId, greenGift, redGift }).then(() => {
        alert('VS Kapışma hediyeleri kaydedildi!');
    });
}

function addManualVS(team) {
    const inputId = team === 'green' ? 'vs-green-manual' : 'vs-red-manual';
    let username = document.getElementById(inputId).value.trim();
    if (username.startsWith('@')) username = username.substring(1);
    if (!username) return alert('Kullanıcı adı girin!');
    
    apiCall('/api/vs-manual', 'POST', { roomId: currentRoomId, team, username }).then(() => {
        document.getElementById(inputId).value = '';
    });
}




function saveAllStarSettings() {
  const players = [];
  for (let i = 1; i <= 4; i++) {
    players.push({
      id: i,
      name: document.getElementById('as-name-'+i).value.trim(),
      photo: document.getElementById('as-pic-'+i).value.trim(),
      gift: document.getElementById('as-gift-'+i).value,
      score: 0
    });
  }
  fetch('/api/allstar-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, players: players })
  }).then(r => r.json()).then(data => {
    if (data.success) alert("All-Star Ayarları Kaydedildi!");
  });
}

function controlAllStar(action) {
  const time = parseInt(document.getElementById('as-time').value) || 300;
  fetch('/api/allstar-timer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, action: action, time: time })
  }).then(r => r.json()).then(data => {
    if (data.success) console.log("All-Star " + action + " sent");
  });
}



function testAllStar(slotId) {
  fetch('/api/test-allstar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: currentRoomId, slotId: slotId, points: document.getElementById('as-manual-pts').value })
  });
}


async function fetchAvatar(slotId) {
    const nameInput = document.getElementById('as-name-' + slotId);
    const picInput = document.getElementById('as-pic-' + slotId);
    let val = nameInput.value.trim();
    if (!val) return;
    
    // Parse URL if pasted directly
    if (val.includes('tiktok.com/')) {
        const match = val.match(/@([a-zA-Z0-9_.-]+)/);
        if (match) {
            val = match[1];
            nameInput.value = val; // update field to just username
        }
    }
    
    // Check if pic is empty, if empty try to fetch
    if (!picInput.value) {
        picInput.value = "Yükleniyor...";
        try {
            const res = await fetch('/api/get-avatar/' + val);
            const data = await res.json();
            if (data.success && data.avatar) {
                picInput.value = data.avatar;
            } else {
                picInput.value = "";
            }
        } catch(e) {
            picInput.value = "";
        }
    }
}



// ROULETTE LOGIC
function startRoulette() {
  fetch("/api/roulette/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: currentRoomId, time: parseInt(document.getElementById("roulette-time-input").value) || 45 })
  }).then(r => r.json()).then(data => {
    if (data.success) alert("Çekiliş Başlatıldı! OBS ekranına bakın.");
  });
}

function copyRouletteLink() {
  const url = window.location.origin + "/roulette-overlay.html?room=" + currentRoomId;
  navigator.clipboard.writeText(url).then(() => {
    alert("Çekiliş ekran linki kopyalandı!\n" + url);
  });
}

function testRouletteVote() {
  fetch("/api/test/trigger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId: currentRoomId, type: "roulette" })
  }).then(r => r.json()).then(data => {
    if (data.success) console.log("Sahte oy gönderildi");
  });
}

// Update the roulette link input automatically when page loads
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        const linkInput = document.getElementById("roulette-obs-link");
        if(linkInput) {
            linkInput.value = window.location.origin + "/roulette-overlay.html?room=" + currentRoomId;
        }
    }, 500);
});


// F9 Tuş Ataması (Oylama Başlat/Durdur)
document.addEventListener("keydown", (e) => {
    if (e.key === "F9") {
        e.preventDefault();
        const startBtn = document.getElementById("btn-start-voting");
        const stopBtn = document.getElementById("btn-stop-voting");
        
        if (startBtn && !startBtn.disabled) {
            startVoting();
        } else if (stopBtn && !stopBtn.disabled) {
            stopVoting();
        }
    }
});
