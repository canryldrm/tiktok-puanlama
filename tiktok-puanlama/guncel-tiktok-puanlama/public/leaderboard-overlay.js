const socket = io();

// Oda Sistemine Katıl
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => {
        socket.emit('joinRoom', currentRoomId);
    });
}

const leaderboardSection = document.getElementById('leaderboard-section');
const leaderboardList = document.getElementById('leaderboard-list');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    const history = data.history || [];
    
    if (history.length === 0) {
        leaderboardSection.classList.add('hidden');
        leaderboardList.innerHTML = '';
        return;
    }
    
    leaderboardSection.classList.remove('hidden');
    
    // Sadece oylaması bitmiş ve puanı olan kişileri filtrele
    const validHistory = history.filter(item => item.average > 0);
    
    if (validHistory.length === 0) {
        leaderboardSection.classList.add('hidden');
        return;
    }

    // Ortalamaya göre en yüksekten en düşüğe sırala
    const sortedHistory = [...validHistory].sort((a, b) => b.average - a.average);
    
    // Sadece ilk 5 kişiyi al
    const top5 = sortedHistory.slice(0, 5);
    
    leaderboardList.innerHTML = '';
    
    top5.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'leaderboard-item';
        
        const rank = document.createElement('div');
        rank.className = 'rank-badge';
        rank.textContent = index + 1;
        
        // İlk 3 için özel renkler
        if (index === 0) { 
            div.style.borderLeftColor = '#FFD700'; // Altın
            rank.style.background = '#FFD700'; 
            rank.textContent = '👑'; // 1. kişiye taç
            div.style.boxShadow = '0 0 30px rgba(255,215,0,0.4)';
        } else if (index === 1) { 
            div.style.borderLeftColor = '#C0C0C0'; // Gümüş
            rank.style.background = '#C0C0C0'; 
        } else if (index === 2) { 
            div.style.borderLeftColor = '#CD7F32'; // Bronz
            rank.style.background = '#CD7F32'; 
        }
        
        const img = document.createElement('img');
        img.className = 'person-avatar';
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&background=random&color=fff&size=100`;
        img.src = item.profilePic || defaultAvatar;
        img.onerror = function() {
            this.onerror = null;
            this.src = defaultAvatar;
        };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'person-name';
        nameSpan.textContent = item.name;
        
        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'person-score';
        scoreSpan.textContent = item.average.toFixed(1);
        
        div.appendChild(rank);
        div.appendChild(img);
        div.appendChild(nameSpan);
        div.appendChild(scoreSpan);
        
        leaderboardList.appendChild(div);
    });
});

