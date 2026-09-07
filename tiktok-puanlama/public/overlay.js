const socket = io();

// Oda Sistemine Katıl
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => {
        socket.emit('joinRoom', currentRoomId);
    });
}

// UI Elements
const scoreDisplay = document.getElementById('score-display');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');
const countdownContainer = document.getElementById('countdown-container');
const countdownBar = document.getElementById('countdown');
const currentPerson = document.getElementById('current-person');
const votesList = document.getElementById('votes-list');

let currentScore = '0.0';

// Marquee Queue
let voteQueue = [];
let isSpawningVote = false;
let resetTimeout = null;

socket.on('state:update', (data) => {
    // Oylama aktifse sıfırlama zamanlayıcısını iptal et
    if (data.votingActive && resetTimeout) {
        clearTimeout(resetTimeout);
        resetTimeout = null;
    }

    if (data.votingActive) {
        updateScore(data.average);
    } else if (!resetTimeout) {
        updateScore(0);
    }

    updateStatus(data.votingActive, data.timeLeft, data.totalVotes);
    updateCountdown(data.timeLeft, data.totalTime);
    updateCurrentPerson(data.queue, data.currentQueueIndex);
    toggleSections(data.votingActive);
});

socket.on('vote:new', (vote) => {
    addVoteToQueue(vote);
});

socket.on('voting:ended', () => {
    scoreDisplay.classList.add('pulse');
    
    // Süre bittiğinde 2.5 saniye final puanını göster, sonra ekranı temizle
    resetTimeout = setTimeout(() => {
        votesList.innerHTML = '';
        voteQueue = [];
        isSpawningVote = false;
        
        updateScore(0);
        resetTimeout = null;
    }, 2500);
});

function getScoreColor(score) {
    if (score <= 3) return '#ff4444';
    if (score <= 6) return '#ffaa00';
    return '#00ff88';
}

function updateScore(average) {
    const newScore = (average || 0).toFixed(1);
    if (newScore !== currentScore) {
        currentScore = newScore;
        scoreDisplay.textContent = newScore === '0.0' ? '--' : newScore;
        scoreDisplay.classList.add('pulse');
        setTimeout(() => {
            scoreDisplay.classList.remove('pulse');
        }, 600);
    }
    
    const numScore = parseFloat(newScore);
    const color = numScore > 0 ? getScoreColor(numScore) : 'white';
    scoreDisplay.style.color = color;
    scoreDisplay.style.textShadow = `0 0 50px ${color}`;
}

function updateStatus(active, timeLeft, totalVotes) {
    if (active) {
        statusDot.classList.add('active');
        statusText.textContent = `Oylama açık — ${Math.ceil(timeLeft || 0)} sn · ${totalVotes || 0} oy`;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'Oylama kapalı';
    }
}

function updateCountdown(timeLeft, totalTime) {
    if (timeLeft === undefined || totalTime === undefined || totalTime === 0) return;
    const percentage = Math.max(0, Math.min(100, (timeLeft / totalTime) * 100));
    countdownBar.style.width = `${percentage}%`;
}

function updateCurrentPerson(queue, index) {
    if (queue && queue.length > 0 && index >= 0 && index < queue.length) {
        currentPerson.textContent = queue[index].name || queue[index];
    } else {
        currentPerson.textContent = '';
    }
}

function toggleSections(active) {
    if (active) {
        countdownContainer.classList.remove('hidden');
        if (currentPerson.textContent) {
            currentPerson.classList.remove('hidden');
        }
    } else {
        countdownContainer.classList.add('hidden');
        currentPerson.classList.add('hidden');
        
        // Temizle
        votesList.innerHTML = '';
        voteQueue = [];
        isSpawningVote = false;
    }
}

// ==========================================
// ALT KAYAN YAZI (MARQUEE) MANTIĞI
// ==========================================
function addVoteToQueue(vote) {
    voteQueue.push(vote);
    processVoteQueue();
}

function processVoteQueue() {
    if (isSpawningVote || voteQueue.length === 0) return;
    
    isSpawningVote = true;
    const vote = voteQueue.shift();
    
    const div = document.createElement('div');
    div.className = 'vote-item';
    
    const color = getScoreColor(vote.score);
    div.style.border = `2px solid ${color}`;
    div.style.boxShadow = `0 0 20px ${color}`;
    
    const img = document.createElement('img');
    img.className = 'vote-avatar';
    img.src = vote.profilePic || '';
    img.onerror = () => { img.style.display = 'none'; };

    const nameSpan = document.createElement('span');
    nameSpan.className = 'vote-username';
    nameSpan.textContent = vote.username;

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'vote-score';
    scoreSpan.textContent = vote.score;
    scoreSpan.style.backgroundColor = color;

    div.appendChild(img);
    div.appendChild(nameSpan);
    div.appendChild(scoreSpan);
    
    votesList.appendChild(div);
    
    setTimeout(() => {
        if (div.parentNode === votesList) {
            votesList.removeChild(div);
        }
    }, 12000); 

    setTimeout(() => {
        isSpawningVote = false;
        processVoteQueue();
    }, 1500); 
}
