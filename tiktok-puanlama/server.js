const express = require('express');

const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-connector');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;

app.use(express.json());
const session = require('express-session');

// =============================================
// 🔐 GİRİŞ BİLGİLERİ — Buradan değiştirin
// =============================================
const AUTH_USERNAME = 'selibon';
const AUTH_PASSWORD = 'medya2023';
// =============================================

app.use(session({
  secret: 'selibon-medya-gizli-anahtar-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 saat
}));

// Auth middleware — panel ve API'yi koru
function requireAuth(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  if (req.path === '/login.html' || req.path === '/login' || req.path === '/api/login') return next();
  if (req.path.startsWith('/socket.io')) return next();
  // Overlay'lere erişim serbest (OBS için)
  const overlayPaths = ['-overlay.html', '-overlay.css', '-overlay.js', '/logo.png', '/background.png', '/panel.css', '/panel.js'];
  if (overlayPaths.some(p => req.path.endsWith(p) || req.path.includes(p))) return next();
  // Panel.html → login'e yönlendir
  if (req.path === '/panel.html' || req.path === '/') return res.redirect('/login.html');
  // API'ler → 401
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  next();
}

app.use(requireAuth);

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    req.session.loggedIn = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı!' });
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

const axios = require('axios');
let tikfinityGifts = [];
axios.get('https://tikfinity.zerody.one/api/getAllGifts?lang=tr-TR&room_id=7398945797854776082').then(res => { tikfinityGifts = res.data; console.log('[TİKTOK] ' + tikfinityGifts.length + ' adet hediye Tikfinity API sinden çekildi.'); }).catch(err => console.error('Hediye çekme hatası:', err.message));

app.use(express.static(path.join(__dirname, 'public')));

// =============================================
// ROOMS (MULTI-TENANT)
// =============================================

const fs = require("fs");
const DATA_FILE = path.join(__dirname, "rooms_data.json");

const rooms = new Map();

// 1) Yükleme
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    for (const [k, v] of Object.entries(parsed)) {
      // Restore Sets and defaults
      v.rouletteVoters = new Set(v.rouletteVotersArray || []);
      rooms.set(k, v);
    }
    console.log("nceki veriler yklendi.");
  }
} catch(e) {
  console.log("Veri ykleme hatas", e);
}

// 2) Kaydetme
function saveRooms() {
  try {
    const obj = {};
    for (const [k, v] of rooms.entries()) {
      // Avoid circular / complex objects
      const copy = { ...v };
      delete copy.timerInterval;
      delete copy.allstarInterval;
      delete copy.rouletteInterval;
      delete copy.tiktokConnection;
      
      // Convert Set to Array for JSON
      copy.rouletteVotersArray = copy.rouletteVoters ? Array.from(copy.rouletteVoters) : [];
      delete copy.rouletteVoters;

      obj[k] = copy;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.log("Veri kaydetme hatas", e);
  }
}
setInterval(saveRooms, 5000);


function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      rouletteVoters: new Set(),
      state: {
      vs: { green: 0, red: 0, greenLast: null, redLast: null },
      allstar: {
        isActive: false,
        timer: 0,
        players: [
          { id: 1, name: "", photo: "", gift: "", score: 0 },
          { id: 2, name: "", photo: "", gift: "", score: 0 },
          { id: 3, name: "", photo: "", gift: "", score: 0 },
          { id: 4, name: "", photo: "", gift: "", score: 0 }
        ]
      },
      vsSettings: { greenGift: '', redGift: '' },
      activeUsers: [],
      roulette: { phase: 'idle', winner: null, timer: 0, totalVotes: 0, totalScore: 0, average: 0 },
        connected: false,
        tiktokUsername: '',
                votingActive: false,
                winCustomText: '',
        themeColor: '#FFD700',
        timeLeft: 30,
        totalTime: 30,
        average: 0,
        totalVotes: 0,
        votes: [],
        racons: [],
        likes: [],
        gifters: [],
        alertsEnabled: true,
        goal: { title: 'Motor İçin Hedef', current: 0, target: 50000 },
        timer: { running: false, startTime: null, elapsed: 0 },
        wins: 0,
        targetWins: 10,
        vipOverride: { mekanSahibi: null, raconKrali: null },
        latestFollower: null,
        queue: [],
        currentQueueIndex: -1,
        history: [],
        raconGiftName: 'Şapka & Bıyık',
        raconSortType: 'coins'
      },
      tiktokConnection: null,
      timerInterval: null,
      userCache: {},
      giftCache: [
        { name: 'Şapka & Bıyık', coins: 99 }
      ]
    });
  }
  return rooms.get(roomId);
}

// =============================================
// HELPERS
// =============================================
function broadcastState(roomId) {
  const room = getRoom(roomId);
  if (room.broadcastTimeout) return;
  room.broadcastTimeout = setTimeout(() => {
    io.to(roomId).emit('state:update', room.state);
    room.broadcastTimeout = null;
  }, 500);
}

function calculateAverage(roomId) {
  const room = getRoom(roomId);
  const state = room.state;
  if (state.votes.length === 0) {
    state.average = 0;
    state.totalVotes = 0;
    return;
  }
  const sum = state.votes.reduce((acc, v) => acc + v.score, 0);
  state.average = Number((sum / state.votes.length).toFixed(1));
  state.totalVotes = state.votes.length;
}

function cacheUser(room, uniqueId, nickname, profilePic) {
  if (profilePic) {
    if (uniqueId) room.userCache[uniqueId.toLowerCase()] = profilePic;
    if (nickname) room.userCache[nickname.toLowerCase()] = profilePic;
  }
}

function processVote(roomId, userId, username, profilePic, score) {
  const room = getRoom(roomId);
  cacheUser(room, userId, username, profilePic);
// ...
  const state = room.state;
  if (!state.votingActive) return false;
  if (score < 1 || score > 10) return false;

  const existingVoteIndex = state.votes.findIndex(v => v.userId === userId);
  if (existingVoteIndex !== -1) {
    return false;
  } else {
    state.votes.push({
      userId,
      username,
      profilePic: profilePic || '',
      score,
      timestamp: Date.now()
    });
  }

  calculateAverage(roomId);
  io.to(roomId).emit('vote:new', { username, profilePic: profilePic || '', score });
  broadcastState(roomId);
      socket.emit('vsUpdate', room.state.vs);
      socket.emit('allstarUpdate', room.state.allstar);
  return true;
}

function processRacon(roomId, userId, username, profilePic, addedCount) {
  const room = getRoom(roomId);
  cacheUser(room, userId, username, profilePic);
  const state = room.state;
  
  const existingIndex = state.racons.findIndex(r => r.userId === userId);
  let finalScore = 0;

  if (existingIndex !== -1) {
    state.racons[existingIndex].count += addedCount;
    state.racons[existingIndex].score = state.racons[existingIndex].count * 100;
    state.racons[existingIndex].timestamp = Date.now();
    finalScore = state.racons[existingIndex].score;
  } else {
    const newScore = addedCount * 100;
    state.racons.push({
      userId,
      username,
      profilePic: profilePic || '',
      count: addedCount,
      score: newScore,
      timestamp: Date.now()
    });
    finalScore = newScore;
  }

  io.to(roomId).emit('racon:new', { username, profilePic: profilePic || '', score: finalScore });
  broadcastState(roomId);
}

function startVoting(roomId, customDuration = 30) {
  const room = getRoom(roomId);
  const state = room.state;
  if (state.votingActive) return;

  const d = parseInt(customDuration, 10) || 30;

  state.votingActive = true;
  state.timeLeft = d;
  state.totalTime = d;
  state.votes = [];
  state.average = 0;
  state.totalVotes = 0;

  broadcastState(roomId);

  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerInterval = setInterval(() => {
    state.timeLeft -= 1;
    if (state.timeLeft <= 0) {
      stopVoting(roomId);
    } else {
      broadcastState(roomId);
    }
  }, 1000);
}

function stopVoting(roomId) {
  const room = getRoom(roomId);
  const state = room.state;
  if (!state.votingActive) return;

  state.votingActive = false;
  state.timeLeft = 0;
  if (room.timerInterval) clearInterval(room.timerInterval);
  room.timerInterval = null;

  calculateAverage(roomId);

  let personName = 'Bilinmeyen';
  let personPic = '';
  if (state.currentQueueIndex >= 0 && state.currentQueueIndex < state.queue.length) {
    personName = state.queue[state.currentQueueIndex].name;
    personPic = state.queue[state.currentQueueIndex].profilePic || '';
    state.queue[state.currentQueueIndex].result = state.average;
  }

  state.history.unshift({
    name: personName,
    profilePic: personPic,
    average: state.average,
    totalVotes: state.totalVotes,
    timestamp: Date.now()
  });

  if (state.history.length > 50) state.history.pop();

  io.to(roomId).emit('voting:ended', { average: state.average, totalVotes: state.totalVotes });
  broadcastState(roomId);
}

function connectToTikTok(roomId, username) {
  const room = getRoom(roomId);
  const state = room.state;

  if (room.tiktokConnection) {
    try { room.tiktokConnection.disconnect(); } catch (e) {}
    room.tiktokConnection = null;
  }

  room.tiktokConnection = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true
  });

  room.tiktokConnection.on('chat', data => {
    cacheUser(room, data.uniqueId, data.nickname, data.profilePictureUrl);
    autoCaptureAvatar(roomId, data.uniqueId, data.profilePictureUrl);
      // All-Star Chat Voting (1, 2, 3, 4)
      if (room.state.allstar && room.state.allstar.isActive) {
        const text = data.comment.trim();
        const vote = parseInt(text, 10);
        if (!isNaN(vote) && vote >= 1 && vote <= 4) {
          const player = room.state.allstar.players.find(p => p.id === vote);
          if (player) {
            player.score += 1;
            io.to(roomId).emit("allstarUpdate", room.state.allstar);
          }
        }
      }

      // Roulette Voting Logic
    if (room.state.roulette && room.state.roulette.phase === 'rating') {
      const text = data.comment.trim();
      const vote = parseInt(text, 10);
      if (!isNaN(vote) && vote >= 1 && vote <= 10) {
        if (!room.rouletteVoters) room.rouletteVoters = new Set();
        if (!room.rouletteVoters.has(data.uniqueId)) {
          room.rouletteVoters.add(data.uniqueId);
          room.state.roulette.totalVotes++;
          room.state.roulette.totalScore += vote;
          room.state.roulette.average = room.state.roulette.totalScore / room.state.roulette.totalVotes;
          io.to(roomId).emit('rouletteUpdate', room.state.roulette);
          io.to(roomId).emit('rouletteVote', { score: vote, username: data.uniqueId, profilePic: data.profilePictureUrl });
        }
      }
    }

    if (!state.votingActive) return;
    const comment = data.comment.trim();
    const isNumber = /^\d+$/.test(comment);
    if (isNumber) {
      const score = parseInt(comment, 10);
      if (score >= 1 && score <= 10) {
        processVote(roomId, data.uniqueId, data.nickname || data.uniqueId, data.profilePictureUrl, score);
      }
    }
  });

  room.tiktokConnection.on('gift', data => {
    room.userCache[data.uniqueId] = {
        profilePic: data.profilePictureUrl, timestamp: Date.now()
    };
    
    const existingGift = room.giftCache.find(g => g.name === data.giftName);
    if (!existingGift) {
        room.giftCache.push({
            name: data.giftName,
            coins: data.diamondCount,
            pictureUrl: data.giftPictureUrl
        });
        if (room.giftCache.length > 50) room.giftCache.shift();
        io.to(roomId).emit('gifts:update', room.giftCache);
    } else if (!existingGift.pictureUrl && data.giftPictureUrl) {
        existingGift.pictureUrl = data.giftPictureUrl;
        io.to(roomId).emit('gifts:update', room.giftCache);
    }

    cacheUser(room, data.uniqueId, data.nickname, data.profilePictureUrl);
    const giftName = (data.giftName || '').toLowerCase();
    const targetName = (state.raconGiftName || '').toLowerCase();
    
    const isComboEnd = data.repeatEnd === true;
    const isNotComboGift = data.giftType !== 1;
    
    if (isComboEnd || isNotComboGift) {
      // 1) En Fazla Jeton Atan (Top Gifter) Mantığı
      const coins = (data.diamondCount || 0) * (data.repeatCount || 1);
      if (coins > 0) {
        const userId = data.uniqueId;
        const existing = room.state.gifters.find(g => g.userId === userId);
        if (existing) {
          existing.coins += coins;
          // Eğer bu hediye eskisinden daha değerliyse resmini güncelle
          if (coins > existing.highestGiftValue) {
            existing.highestGiftValue = coins;
            existing.bestGiftPic = data.giftPictureUrl;
          }
        } else {
          room.state.gifters.push({
            userId,
            username: data.nickname || data.uniqueId,
            profilePic: data.profilePictureUrl, timestamp: Date.now() || '',
            coins: coins,
            bestGiftPic: data.giftPictureUrl,
            highestGiftValue: coins
          });
        }
      }
        // All-Star Gift Voting
        if (room.state.allstar && room.state.allstar.isActive) {
          room.state.allstar.players.forEach(p => {
            if (p.gift && p.gift.trim() !== "") {
              const targetGift = p.gift.toLowerCase().trim();
              if (giftName.includes(targetGift)) {
                p.score += coins;
                io.to(roomId).emit("allstarUpdate", room.state.allstar);
              }
            }
          });
        }

        // 2) Racon Mantığı
      let isRacon = false;
      if (targetName) {
        const targetWords = targetName.split('&').map(w => w.trim()).filter(Boolean);
        if (targetWords.length > 0) {
          isRacon = targetWords.some(word => giftName.includes(word));
        } else {
          isRacon = giftName.includes(targetName);
        }
      }

              if (isRacon) {
          const count = data.repeatCount || 1;
          processRacon(roomId, data.uniqueId, data.nickname || data.uniqueId, data.profilePictureUrl, count);
        }
        
        // 3) Büyük Hediye Alarmı (100 Jeton ve üzeri)
        io.to(roomId).emit('playDrop', { type: 'gift', profilePic: data.profilePictureUrl, text: data.giftName });
          if (room.state.alertsEnabled && coins >= 100) {
          room.state.latestAlert = {
            username: data.nickname || data.uniqueId,
            profilePic: data.profilePictureUrl, timestamp: Date.now() || '',
            giftName: data.giftName,
            count: data.repeatCount || 1,
            coins: coins
          };
        }
        
        broadcastState(roomId);
    }
  });

  room.tiktokConnection.on('like', data => {
    const room = getRoom(roomId);
    
    // YENI LIKES LISTESI MANTIĞI
    let existing = room.state.likes.find(l => l.username === data.uniqueId);
    if (existing) {
      existing.count += data.likeCount;
    } else {
      room.state.likes.push({
        username: data.uniqueId,
        profilePic: data.profilePictureUrl, timestamp: Date.now(),
        count: data.likeCount
      });
    }
    // Sort and keep top 50 to avoid memory leak
    room.state.likes.sort((a,b) => b.count - a.count);
    room.state.likes = room.state.likes.slice(0, 50);

    broadcastState(roomId);
  });

  room.tiktokConnection.on('follow', data => {
    const room = getRoom(roomId);
    room.state.latestFollower = {
      username: data.uniqueId,
      profilePic: data.profilePictureUrl, timestamp: Date.now()
    };
    broadcastState(roomId);
  });

  room.tiktokConnection.on('member', data => {
    cacheUser(room, data.uniqueId, data.nickname, data.profilePictureUrl);
  });

  room.tiktokConnection.on('connected', () => {
    console.log(`[TIKTOK] [${roomId}] Bağlantı kuruldu`);
  });

  room.tiktokConnection.on('disconnected', () => {
    console.log(`[TIKTOK] [${roomId}] Bağlantı kesildi`);
    state.connected = false;
    broadcastState(roomId);
  });

  room.tiktokConnection.on('error', (err) => {
    console.error(`[TIKTOK] [${roomId}] Hata:`, err.message);
  });

  return room.tiktokConnection.connect()
    .then((roomState) => {
      state.connected = true;
      state.tiktokUsername = username;
      console.log(`[TIKTOK] [${roomId}] Bağlandı! Room: ${roomState.roomId}, Izleyici: ${roomState.viewerCount || '?'}`);
      broadcastState(roomId);
      return { success: true, tiktokRoomId: roomState.roomId };
    })
    .catch((err) => {
      state.connected = false;
      room.tiktokConnection = null;
      console.error(`[TIKTOK] [${roomId}] Bağlantı hatası:`, err.message);
      throw err;
    });
}

function disconnectFromTikTok(roomId) {
  const room = getRoom(roomId);
  if (room.tiktokConnection) {
    try { room.tiktokConnection.disconnect(); } catch (e) {}
    room.tiktokConnection = null;
  }
  room.state.connected = false;
  room.state.tiktokUsername = '';
  broadcastState(roomId);
}

// =============================================
// API ROUTES
// =============================================

function autoCaptureAvatar(roomId, uniqueId, profilePictureUrl) {
  const room = getRoom(roomId);
  if (!uniqueId || !profilePictureUrl || !room) return;

  if (room.state.activeUsers) {
    const existing = room.state.activeUsers.find(u => u.username === uniqueId);
    if (!existing) {
      room.state.activeUsers.push({ username: uniqueId, profilePic: profilePictureUrl });
      if (room.state.activeUsers.length > 50) room.state.activeUsers.shift();
    }
  }

  if (!room.state.allstar) return;
    const talker = uniqueId.toLowerCase().replace('@', '');
    let updated = false;
    room.state.allstar.players.forEach(p => {
        if (p.name && p.name.toLowerCase().replace('@', '') === talker && (!p.photo || p.photo.includes('ui-avatars.com'))) {
            p.photo = profilePictureUrl;
            updated = true;
        }
    });
    if (updated) {
        io.to(room.id).emit('allstarUpdate', room.state.allstar);
    }
}


app.get('/api/get-avatar/:username', async (req, res) => {
    let username = req.params.username.trim();
    if (username.includes('tiktok.com/')) {
        const match = username.match(/@([a-zA-Z0-9_.-]+)/);
        if (match) username = match[1];
    }
    username = username.replace('@', '');
    
    try {
        const { WebcastPushConnection } = require('tiktok-connector');
        let t = new WebcastPushConnection(username);
        const roomInfo = await t.getRoomInfo();
        if (roomInfo && roomInfo.owner && roomInfo.owner.avatar_large) {
            
              const urls = roomInfo.owner.avatar_large.url_list || [];
              const jpegUrl = urls.find(u => u.includes(".jpeg") || u.includes(".jpg")) || urls[0];
              return res.json({ success: true, avatar: jpegUrl, username: username });

        }
        res.json({ success: false });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

app.post('/api/connect', async (req, res) => {
  console.log('[API] /connect isteği geldi:', req.body);
  const { roomId, username } = req.body;
  if (!roomId || !username) return res.status(400).json({ error: 'roomId ve username gerekli' });

  const cleanUsername = username.replace(/^@/, '').trim();
  try {
    const result = await connectToTikTok(roomId, cleanUsername);
    res.json({ success: true, message: `@${cleanUsername} yayınına bağlanıldı`, tiktokRoomId: result.tiktokRoomId });
  } catch (err) {
    console.error('[API] /connect hatası:', err.message);
    res.status(500).json({ error: 'Bağlantı kurulamadı', details: err.message });
  }
});

app.post('/api/disconnect', (req, res) => {
  const { roomId, time } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  disconnectFromTikTok(roomId);
  res.json({ success: true, message: 'Bağlantı kesildi' });
});

app.post('/api/voting/start', (req, res) => {
  const { roomId, duration } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  const room = getRoom(roomId);
  if (room.state.votingActive) return res.status(400).json({ error: 'Oylama zaten aktif' });
  
  startVoting(roomId, duration);
  res.json({ success: true, message: 'Oylama başlatıldı' });
});

app.post('/api/voting/stop', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  const room = getRoom(roomId);
  if (!room.state.votingActive) return res.status(400).json({ error: 'Oylama aktif değil' });
  
  stopVoting(roomId);
  res.json({ success: true, message: 'Oylama durduruldu' });
});

app.post('/api/vote', (req, res) => {
  const { roomId, username, score } = req.body;
  if (!roomId || !username) return res.status(400).json({ error: 'roomId ve username gerekli' });

  const parsedScore = parseInt(score, 10);
  if (isNaN(parsedScore) || parsedScore < 1 || parsedScore > 10) {
    return res.status(400).json({ error: 'Puan 1-10 arası olmalı' });
  }
  
  const cleanUsername = username.replace(/^@/, '').trim();
  const userId = cleanUsername.toLowerCase();
  processVote(roomId, userId, cleanUsername, '', parsedScore);
  res.json({ success: true, message: `${cleanUsername}: ${parsedScore} puan` });
});

app.post('/api/racon', (req, res) => {
  const { roomId, username, coins } = req.body;
  if (!roomId || !username) return res.status(400).json({ error: 'roomId ve username gerekli' });

  const parsedCoins = parseInt(coins, 10) || 1;
  const cleanUsername = username.replace(/^@/, '').trim();
  const userId = cleanUsername.toLowerCase();

  processRacon(roomId, userId, cleanUsername, '', parsedCoins);
  res.json({ success: true, message: `${cleanUsername}: Racon! (${parsedCoins} jeton)` });
});

app.post('/api/queue/add', (req, res) => {
  const { roomId, name } = req.body;
  if (!roomId || !name) return res.status(400).json({ error: 'roomId ve isim gerekli' });
  
  const room = getRoom(roomId);
  const cleanName = name.trim().replace(/^@/, '').toLowerCase();
  const profilePic = room.userCache[cleanName] || '';

  room.state.queue.push({ name: name.trim(), profilePic: profilePic, result: null });
  broadcastState(roomId);
  res.json({ success: true, message: 'Sıraya eklendi' });
});

app.delete('/api/queue/remove/:index', (req, res) => {
  const { roomId } = req.query; // query'den alalım URL'de olduğu için
  const index = parseInt(req.params.index, 10);
  if (!roomId || isNaN(index)) return res.status(400).json({ error: 'roomId ve geçerli index gerekli' });

  const room = getRoom(roomId);
  const state = room.state;

  if (index < 0 || index >= state.queue.length) {
    return res.status(400).json({ error: 'Geçersiz index' });
  }

  state.queue.splice(index, 1);
  if (state.currentQueueIndex > index) {
    state.currentQueueIndex -= 1;
  } else if (state.currentQueueIndex === index) {
    state.currentQueueIndex = -1;
  } else if (state.currentQueueIndex >= state.queue.length) {
    state.currentQueueIndex = state.queue.length > 0 ? state.queue.length - 1 : -1;
  }

  broadcastState(roomId);
  res.json({ success: true, message: 'Sıradan çıkarıldı' });
});

app.post('/api/queue/next', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  
  const room = getRoom(roomId);
  const state = room.state;

  if (state.queue.length === 0) {
    return res.status(400).json({ error: 'Sıra boş' });
  }
  if (state.votingActive) stopVoting(roomId);

  state.currentQueueIndex += 1;
  if (state.currentQueueIndex >= state.queue.length) {
    state.currentQueueIndex = 0;
  }

  // startVoting(roomId); iptal edildi, oylama manuel başlatılacak.
  broadcastState(roomId);
  res.json({ success: true, message: 'Sıradaki kişiye geçildi (Oylamayı manuel başlatın)' });
});

app.get('/api/status', (req, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  res.json(getRoom(roomId).state);
});

app.post('/api/settings/racon', (req, res) => {
  const { roomId, giftName, sortType } = req.body;
  if (!roomId || !giftName) return res.status(400).json({ error: 'roomId ve hediye adı gerekli' });
  
  const room = getRoom(roomId);
  room.state.raconGiftName = giftName;
  if (sortType) room.state.raconSortType = sortType;
  broadcastState(roomId);
  res.json({ success: true, message: 'Racon ayarları güncellendi' });
});

app.get('/api/gifts', (req, res) => res.json(tikfinityGifts));

app.post('/api/test/trigger', (req, res) => {
  const { roomId, type } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  
  const room = getRoom(roomId);
  const state = room.state;

  if (type === 'vote') {
      if (!state.votingActive) {
        startVoting(roomId, 30); // Eger oylama aktif degilse otomatik baslat ki donmasin
      }
      const randomScore = Math.floor(Math.random() * 10) + 1;
      processVote(roomId, 'test_user_' + Date.now(), 'TestKullanici', 'https://picsum.photos/100/100?random=' + Date.now(), randomScore);
    } else if (type === 'vs_plus') {
      const room = getRoom(roomId);
      room.state.vs.green += Math.floor(Math.random() * 5) + 1;
      room.state.vs.greenLast = { username: 'ArtıcıGüzeli', profilePic: 'https://picsum.photos/100/100?random=plus' + Date.now() };
      io.to(roomId).emit('vsUpdate', room.state.vs);
      io.to(roomId).emit('playDrop', { type: 'vote', profilePic: room.state.vs.greenLast.profilePic, text: '+' });
    } else if (type === 'vs_minus') {
      const room = getRoom(roomId);
      room.state.vs.red += Math.floor(Math.random() * 5) + 1;
      room.state.vs.redLast = { username: 'EksiciKral', profilePic: 'https://picsum.photos/100/100?random=minus' + Date.now() };
      io.to(roomId).emit('vsUpdate', room.state.vs);
      io.to(roomId).emit('playDrop', { type: 'gift', profilePic: room.state.vs.redLast.profilePic, text: '-' });
    } else if (type === 'racon') {
    processRacon(roomId, 'testuser', 'TestRacon', 'https://picsum.photos/100/100?random=racon' + Date.now(), Math.floor(Math.random() * 5) + 1);
  } else if (type === 'like') {
    const randomLikes = Math.floor(Math.random() * 50) + 10;
    const existing = state.likes.find(l => l.userId === 'testliker');
    if (existing) {
      existing.count += randomLikes;
    } else {
      state.likes.push({ userId: 'testliker', username: 'BeğeniciGüzeli', profilePic: 'https://picsum.photos/100/100?random=like', count: randomLikes });
    }
    broadcastState(roomId);
        } else if (type === 'roulette') {
            const room = getRoom(roomId);
            if (room.state.roulette && room.state.roulette.phase === 'rating') {
                const vote = Math.floor(Math.random() * 10) + 1;
                room.state.roulette.totalVotes++;
                room.state.roulette.totalScore += vote;
                room.state.roulette.average = room.state.roulette.totalScore / room.state.roulette.totalVotes;
                io.to(roomId).emit('rouletteUpdate', room.state.roulette);
                io.to(roomId).emit('rouletteVote', { score: vote, username: 'test_' + Date.now(), profilePic: 'https://ui-avatars.com/api/?name=T&background=random' });
            }
        } else if (type === 'alert') { room.state.latestAlert = { username: 'Büyük Kral', profilePic: 'https://picsum.photos/105', giftName: 'Aslan', count: 1, coins: 29999, timestamp: Date.now() }; broadcastState(roomId); } else if (type === 'follow') {
    room.state.latestFollower = {
      username: 'yeni_takipci_' + Math.floor(Math.random() * 1000),
      profilePic: 'https://picsum.photos/104', timestamp: Date.now()
    };
    broadcastState(roomId);
      } else if (type === 'leaderboard') {
      state.history = [
        { name: 'Ahmet_Kral', profilePic: 'https://picsum.photos/101', average: 9.8, totalVotes: 120 },
        { name: 'MehmetY', profilePic: 'https://picsum.photos/102', average: 8.5, totalVotes: 85 },
        { name: 'AyseG', profilePic: 'https://picsum.photos/103', average: 7.2, totalVotes: 42 }
      ];
      broadcastState(roomId);
    } else if (type === 'topgifter') {
    state.gifters.push({
      userId: 'test_kral',
      username: 'kullaniciadi_ornek',
      profilePic: 'https://picsum.photos/100/100?random=kral',
      coins: Math.floor(Math.random() * 50000) + 1000,
      bestGiftPic: 'https://picsum.photos/100/100?random=gift',
      highestGiftValue: 1000
    });
    broadcastState(roomId);
  } else if (type === 'leaderboard') {
    state.history = [
      { name: 'Mehmet (Örnek)', profilePic: 'https://picsum.photos/100/100?random=1', average: 9.5, totalVotes: 150, timestamp: Date.now() },
      { name: 'Ahmet (Örnek)', profilePic: 'https://picsum.photos/100/100?random=2', average: 8.4, totalVotes: 95, timestamp: Date.now() - 1000 },
      { name: 'Zeynep (Örnek)', profilePic: 'https://picsum.photos/100/100?random=3', average: 7.2, totalVotes: 80, timestamp: Date.now() - 2000 },
      { name: 'Ali (Örnek)', profilePic: 'https://picsum.photos/100/100?random=4', average: 5.5, totalVotes: 45, timestamp: Date.now() - 3000 },
      { name: 'Ayşe (Örnek)', profilePic: 'https://picsum.photos/100/100?random=5', average: 3.1, totalVotes: 20, timestamp: Date.now() - 4000 }
    ];
    broadcastState(roomId);
  }
  
  res.json({ success: true, message: 'Test verisi gönderildi. (Kaldırmak için Ayarları Sıfırla yapabilirsiniz)' });
});

app.post('/api/vs-settings', (req, res) => {
    const { roomId, greenGift, redGift } = req.body;
    const room = getRoom(roomId);
    room.state.vsSettings = { greenGift, redGift };
    broadcastState(roomId);
    res.json({ success: true });
});

app.post('/api/vs-manual', (req, res) => {
    const { roomId, team, username } = req.body;
    const room = getRoom(roomId);
    
    // Check if we have their real profile pic in cache
    let profilePic = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=random';
    for (const [uid, user] of Object.entries(room.userCache)) {
        if (user.uniqueId.toLowerCase() === username.toLowerCase() || (user.nickname && user.nickname.toLowerCase() === username.toLowerCase())) {
            profilePic = user.profilePictureUrl;
            break;
        }
    }

    if (team === 'green') {
        room.state.vs.green++;
        room.state.vs.greenLast = { username, profilePic };
        io.to(roomId).emit('playDrop', { type: 'vote', profilePic, text: '+' });
    } else {
        room.state.vs.red++;
        room.state.vs.redLast = { username, profilePic };
        io.to(roomId).emit('playDrop', { type: 'gift', profilePic, text: '-' });
    }
    
    io.to(roomId).emit('vsUpdate', room.state.vs);
    broadcastState(roomId);
    res.json({ success: true });
});


app.post('/api/allstar-settings', (req, res) => {
    const { roomId, players } = req.body;
    const room = getRoom(roomId);
    room.state.allstar.players = players;
    io.to(roomId).emit('allstarUpdate', room.state.allstar);
    res.json({ success: true });
});

app.post('/api/allstar-timer', (req, res) => {
    const { roomId, action, time } = req.body;
    const room = getRoom(roomId);
    
    if (action === 'start') {
        room.state.allstar.isActive = true;
        room.state.allstar.timer = time || 300;
        clearInterval(room.allstarInterval);
        room.allstarInterval = setInterval(() => {
            if (room.state.allstar.timer > 0) {
                room.state.allstar.timer--;
                io.to(roomId).emit('allstarUpdate', room.state.allstar);
            } else {
                room.state.allstar.isActive = false;
                clearInterval(room.allstarInterval);
                io.to(roomId).emit('allstarUpdate', room.state.allstar);
            }
        }, 1000);
    } else if (action === 'stop') {
        room.state.allstar.isActive = false;
        clearInterval(room.allstarInterval);
    } else if (action === 'reset') {
        room.state.allstar.isActive = false;
        room.state.allstar.timer = 0;
        clearInterval(room.allstarInterval);
        room.state.allstar.players.forEach(p => p.score = 0);
    }
    
    io.to(roomId).emit('allstarUpdate', room.state.allstar);
    res.json({ success: true });
});

app.post('/api/test-allstar', (req, res) => {
    const { roomId, slotId, points } = req.body;
    const room = getRoom(roomId);
    const player = room.state.allstar.players.find(p => p.id == slotId);
    if (player) {
        player.score += Number(points || 50);
        io.to(roomId).emit('allstarUpdate', room.state.allstar);
    }
    res.json({ success: true });
});

app.post('/api/roulette/start', (req, res) => {
    const { roomId, time } = req.body;
    const room = getRoom(roomId);
    
    let winner = { username: 'Rastgele Biri', profilePic: 'https://ui-avatars.com/api/?name=User&background=random' };
    
    if (room.state.activeUsers && room.state.activeUsers.length > 0) {
        winner = room.state.activeUsers[Math.floor(Math.random() * room.state.activeUsers.length)];
    }

    room.state.roulette.phase = 'spinning';
    room.state.roulette.winner = winner;
    room.state.roulette.totalVotes = 0;
    room.state.roulette.totalScore = 0;
    room.state.roulette.average = 0;
    room.state.roulette.timer = time || 45;
    if (room.rouletteVoters) room.rouletteVoters.clear();

    let fillerProfiles = [];
    if (room.state.activeUsers) {
       fillerProfiles = room.state.activeUsers.map(u => u.profilePic);
    }
    if(fillerProfiles.length === 0) {
      for(let i=0; i<20; i++) fillerProfiles.push('https://picsum.photos/150?random='+i);
    }

    io.to(roomId).emit('rouletteSpin', { winner, fillerProfiles });

    setTimeout(() => {
        room.state.roulette.phase = 'rating';
        io.to(roomId).emit('rouletteUpdate', room.state.roulette);

        clearInterval(room.rouletteInterval);
        room.rouletteInterval = setInterval(() => {
            if (room.state.roulette.timer > 0) {
                room.state.roulette.timer--;
                io.to(roomId).emit('rouletteUpdate', room.state.roulette);
            } else {
                room.state.roulette.phase = 'finished';
                clearInterval(room.rouletteInterval);
                io.to(roomId).emit('rouletteUpdate', room.state.roulette);
            }
        }, 1000);
    }, 5000);

    res.json({ success: true });
});

app.post('/api/reset', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  
  const room = getRoom(roomId);
  const state = room.state;

  if (state.votingActive) stopVoting(roomId);
  state.votes = [];
  state.racons = [];
    state.vs = { green: 0, red: 0, greenLast: null, redLast: null };
    io.to(roomId).emit('vsUpdate', state.vs);
  state.likes = [];
  state.gifters = [];
  state.wins = 0;
  state.average = 0;
  state.totalVotes = 0;
  state.queue = [];
  state.currentQueueIndex = -1;
  state.history = [];
  
  broadcastState(roomId);
  res.json({ success: true, message: 'Her şey sıfırlandı' });
});

// =============================================
// SOCKET.IO
// =============================================
io.on('connection', (socket) => {
  console.log(`[SOCKET] Bağlandı: ${socket.id}`);
  
  socket.on('joinRoom', (roomId) => {
    if (!roomId) return;
    socket.join(roomId);
    const room = getRoom(roomId);
    socket.emit('state:update', room.state);
    if (room.giftCache) {
        socket.emit('gifts:update', room.giftCache);
    }
  });

  socket.on('setAlertsEnabled', ({ roomId, enabled }) => { const room = getRoom(roomId); room.state.alertsEnabled = enabled; broadcastState(roomId); });
  socket.on('updateGoal', ({ roomId, title, target }) => { const room = getRoom(roomId); room.state.goal.title = title; room.state.goal.target = target; broadcastState(roomId); });
  socket.on('addGoalAmount', ({ roomId, amount }) => { const room = getRoom(roomId); room.state.goal.current += amount; broadcastState(roomId); });
  socket.on('timerAction', ({ roomId, action }) => { const room = getRoom(roomId); if(action === 'start') { room.state.timer.running = true; room.state.timer.startTime = Date.now(); } else if(action === 'pause') { if(room.state.timer.running) { room.state.timer.elapsed += Date.now() - room.state.timer.startTime; room.state.timer.running = false; room.state.timer.startTime = null; } } else if(action === 'reset') { room.state.timer = { running: false, startTime: null, elapsed: 0 }; } broadcastState(roomId); });

  socket.on('updateWins', ({ roomId, action }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    if (action === 'inc') room.state.wins++;
    if (action === 'dec') room.state.wins--;
    broadcastState(roomId);
  });

      socket.on('setTargetWins', ({ roomId, target }) => {
      const room = getRoom(roomId);
      room.state.targetWins = parseInt(target) || 0;
      broadcastState(roomId);
    });

        socket.on('setWinCustomText', ({ roomId, text }) => {
      const room = getRoom(roomId);
      room.state.winCustomText = text;
      broadcastState(roomId);
    });

    socket.on('setThemeColor', ({ roomId, color }) => {
      const room = getRoom(roomId);
      room.state.themeColor = color;
      broadcastState(roomId);
    });

  socket.on('setVipOverride', ({ roomId, type, username, text }) => {
    if (!roomId) return;
    const room = getRoom(roomId);
    if (!room.state.vipOverride) room.state.vipOverride = {};
    
    if (type === 'mekan') {
        room.state.vipOverride.mekanName = username ? username.trim() : null;
        room.state.vipOverride.mekanText = text ? text.trim() : null;
    } else if (type === 'racon') {
        room.state.vipOverride.raconName = username ? username.trim() : null;
        room.state.vipOverride.raconText = text ? text.trim() : null;
    }
    broadcastState(roomId);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] Ayrıldı: ${socket.id}`);
  });
});

// =============================================
// START
// =============================================

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║    Selibon Medya Overlay (MULTI-ROOM)            ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log(`  🚀 Server is running on port ${PORT}`);
});






























