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
const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      state: {
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
  io.to(roomId).emit('state:update', room.state);
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
  const { roomId } = req.body;
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

app.post('/api/reset', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  
  const room = getRoom(roomId);
  const state = room.state;

  if (state.votingActive) stopVoting(roomId);
  state.votes = [];
  state.racons = [];
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




























