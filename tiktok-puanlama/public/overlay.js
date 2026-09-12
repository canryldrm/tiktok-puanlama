const socket = io();

const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => {
        socket.emit('joinRoom', currentRoomId);
    });
}

// UI Elements
const overlay = document.getElementById('overlay');
const timeLeftEl = document.getElementById('time-left');
const totalVotesEl = document.getElementById('total-votes-text');
const scoreDisplay = document.getElementById('score-display');
const dynamicMessage = document.getElementById('dynamic-message');
const votesList = document.getElementById('votes-list');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const instruction = document.getElementById('instruction');

let isVotingActive = false;
let isStarting = false;
let currentScore = '0.0';

socket.on('state:update', (data) => {
    // Başlama anını yakala
    if (data.votingActive && !isVotingActive && !isStarting) {
        startVotingSequence();
    } 
    // Bitme anını yakala
    else if (!data.votingActive && isVotingActive) {
        endVoting();
    }

    // Oylama aktifse ve başlama animasyonu bittiyse değerleri güncelle
    if (data.votingActive && !isStarting) {
        updateTime(data.timeLeft);
        updateTotalVotes(data.totalVotes);
        updateScore(data.average);
    }
});

socket.on('vote:new', (vote) => {
    if (isVotingActive && !isStarting) {
        addVoteUI(vote);
    }
});

function startVotingSequence() {
    if (window.endVotingTimeout) clearTimeout(window.endVotingTimeout);
    isStarting = true;
    overlay.classList.remove('hidden');
    countdownOverlay.classList.remove('hidden');
    
    // Geri sayım
    let count = 3;
    countdownNumber.textContent = count;
    
    const countInterval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.textContent = count;
        } else {
            clearInterval(countInterval);
            countdownOverlay.classList.add('hidden');
            isStarting = false;
            isVotingActive = true;
            
            // Konfeti Patlat
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 },
                    zIndex: 9999
                });
            }
            
            // İlk başlangıç resetleri
            instruction.textContent = "1 ile 10 arasında yorumla puanlayın!";
            votesList.innerHTML = '';
            updateScore(0);
            updateTotalVotes(0);
        }
    }, 1000);
}

function endVoting() {
    isVotingActive = false;
    dynamicMessage.textContent = "OYLAMA BİTTİ! 🛑";
    dynamicMessage.style.borderColor = "#ff4444";
    dynamicMessage.style.color = "#ff4444";
    
    if (window.endVotingTimeout) clearTimeout(window.endVotingTimeout);
    window.endVotingTimeout = setTimeout(() => {
        overlay.classList.add('hidden');
        votesList.innerHTML = '';
        currentScore = '0.0';
    }, 4000); // 4 saniye sonra ekranı temizle
}

function updateTime(timeLeft) {
    timeLeftEl.textContent = Math.ceil(timeLeft || 0);
}

function updateTotalVotes(total) {
    totalVotesEl.textContent = total || 0;
}

function getMessageForScore(score) {
    if (score === 0) return { text: "OYLAMA BAŞLADI! 🚀", color: "#ffd700" };
    if (score <= 3.0) return { text: "KÖTÜ BAŞLADIK! 😬", color: "#ff4444" };
    if (score <= 5.0) return { text: "EH İŞTE 😕", color: "#ffaa00" };
    if (score <= 7.0) return { text: "ORTALIK KARIŞTI! 💥", color: "#00d4ff" };
    if (score <= 8.9) return { text: "VAYY İDDİALI! 🔥", color: "#00ff88" };
    return { text: "VOOV SÜPERSİN! 👑", color: "#ffd700" };
}

function updateScore(average) {
    const newScore = (average || 0).toFixed(1);
    
    if (newScore !== currentScore) {
        scoreDisplay.textContent = newScore;
        scoreDisplay.classList.add('pulse-score');
        setTimeout(() => scoreDisplay.classList.remove('pulse-score'), 300);
        currentScore = newScore;
        
        // Dinamik yazıyı güncelle
        const numScore = parseFloat(newScore);
        const msg = getMessageForScore(numScore);
        dynamicMessage.textContent = msg.text;
        dynamicMessage.style.color = msg.color;
        dynamicMessage.style.borderColor = msg.color;
        
        if (numScore > 7.0 && Math.random() > 0.7) {
            // Yüksek puan gelirse rastgele hafif konfeti
            if (typeof confetti === 'function') {
                confetti({ particleCount: 30, spread: 50, origin: { y: 0.2 }, zIndex: 9999 });
            }
        }
    }
}

function addVoteUI(vote) {
    const div = document.createElement('div');
    div.className = 'vote-item';
    
    const img = document.createElement('img');
    img.className = 'vote-avatar';
    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(vote.username)}&background=random&color=fff&size=100`;
    img.src = vote.profilePic || defaultAvatar;
    img.onerror = function() { this.src = defaultAvatar; };
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'vote-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'vote-username';
    nameSpan.textContent = vote.username;
    
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'vote-score';
    scoreSpan.textContent = vote.score;
    // Puan rengi
    if (vote.score <= 3) scoreSpan.style.color = '#ff4444';
    else if (vote.score <= 6) scoreSpan.style.color = '#ffaa00';
    else scoreSpan.style.color = '#00ff88';
    
    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(scoreSpan);
    
    div.appendChild(img);
    div.appendChild(infoDiv);
    
    votesList.prepend(div);
    
    // En fazla 5 tane tut
    while (votesList.children.length > 5) {
        votesList.removeChild(votesList.lastChild);
    }
}




