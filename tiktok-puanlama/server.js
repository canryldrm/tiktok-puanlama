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
        timeLeft: 30,
        totalTime: 30,
        average: 0,
        totalVotes: 0,
        votes: [],
        racons: [],
        queue: [],
        currentQueueIndex: -1,
        history: [],
        raconGiftName: 'Şapka & Bıyık'
      },
      tiktokConnection: null,
      timerInterval: null
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

function processVote(roomId, userId, username, profilePic, score) {
  const room = getRoom(roomId);
  const state = room.state;
  if (!state.votingActive) return false;
  if (score < 1 || score > 10) return false;

  const existingVoteIndex = state.votes.findIndex(v => v.userId === userId);
  if (existingVoteIndex !== -1) {
    state.votes[existingVoteIndex].score = score;
    state.votes[existingVoteIndex].timestamp = Date.now();
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

function processRacon(roomId, userId, username, profilePic, coins) {
  const room = getRoom(roomId);
  const state = room.state;
  state.racons.push({
    userId,
    username,
    profilePic: profilePic || '',
    coins,
    timestamp: Date.now()
  });

  io.to(roomId).emit('racon:new', { username, profilePic: profilePic || '', coins });
  broadcastState(roomId);
}

function startVoting(roomId) {
  const room = getRoom(roomId);
  const state = room.state;
  if (state.votingActive) return;

  state.votingActive = true;
  state.timeLeft = 30;
  state.totalTime = 30;
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
  if (state.currentQueueIndex >= 0 && state.currentQueueIndex < state.queue.length) {
    personName = state.queue[state.currentQueueIndex].name;
    state.queue[state.currentQueueIndex].result = state.average;
  }

  state.history.unshift({
    name: personName,
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
    const giftName = (data.giftName || '').toLowerCase();
    const targetName = (state.raconGiftName || '').toLowerCase();
    
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
      const isComboEnd = data.repeatEnd === true;
      const isNotComboGift = data.giftType !== 1;
      if (isComboEnd || isNotComboGift) {
        const coins = (data.diamondCount || 0) * (data.repeatCount || 1);
        processRacon(roomId, data.uniqueId, data.nickname || data.uniqueId, data.profilePictureUrl, coins);
      }
    }
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
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  const room = getRoom(roomId);
  if (room.state.votingActive) return res.status(400).json({ error: 'Oylama zaten aktif' });
  
  startVoting(roomId);
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
  room.state.queue.push({ name: name.trim(), result: null });
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

  startVoting(roomId);
  res.json({ success: true, message: 'Sıradaki kişiye geçildi' });
});

app.get('/api/status', (req, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  res.json(getRoom(roomId).state);
});

app.post('/api/settings/racon-gift', (req, res) => {
  const { roomId, giftName } = req.body;
  if (!roomId || !giftName) return res.status(400).json({ error: 'roomId ve hediye adı gerekli' });
  
  const room = getRoom(roomId);
  room.state.raconGiftName = giftName;
  broadcastState(roomId);
  res.json({ success: true, message: 'Racon hediye ayarı güncellendi' });
});

app.post('/api/reset', (req, res) => {
  const { roomId } = req.body;
  if (!roomId) return res.status(400).json({ error: 'roomId gerekli' });
  
  const room = getRoom(roomId);
  const state = room.state;

  if (state.votingActive) stopVoting(roomId);
  state.votes = [];
  state.racons = [];
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
    console.log(`[SOCKET] ${socket.id} joined room: ${roomId}`);
    socket.emit('state:update', getRoom(roomId).state);
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
  console.log('  ║  🎬 TikTok Puanlama Overlay Sistemi (MULTI-ROOM) ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log(`  🚀 Server is running on port ${PORT}`);
});
