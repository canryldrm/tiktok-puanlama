const socket = io();

// Oda Sistemine Katıl
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => {
        socket.emit('joinRoom', currentRoomId);
    });
}
const raconsSection = document.getElementById('racons-section');
const raconsList = document.getElementById('racons-list');

let currentState = { racons: [], raconSortType: 'newest' };

socket.on('state:update', (data) => {
    currentState = data;
    renderRacons();
});

socket.on('racon:new', (racon) => {
    // State will be updated via broadcastState anyway, but we can optimistically render if we want.
    // However, server broadcasts state on new racon, so state:update will catch it.
});

function renderRacons() {
    const racons = currentState.racons || [];
    
    if(racons.length === 0) {
        raconsList.innerHTML = '';
        raconsSection.classList.add('hidden');
        return;
    }
    
    raconsSection.classList.remove('hidden');
    
    // Kopya dizi oluşturalım ki orijinal state bozulmasın
    let sortedRacons = [...racons];
    
    if (currentState.raconSortType === 'coins') {
        // En çok jeton gönderenler (azalan)
        sortedRacons.sort((a, b) => b.coins - a.coins);
    } else {
        // En yeniler (azalan timestamp)
        sortedRacons.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    // İlk 5'i al
    const topRacons = sortedRacons.slice(0, 5);
    
    raconsList.innerHTML = '';
    
    topRacons.forEach(racon => {
        const div = document.createElement('div');
        div.className = 'racon-item';
        
        const img = document.createElement('img');
        img.className = 'racon-avatar';
        // Eğer profil fotoğrafı yoksa veya yüklenemezse ismin baş harflerinden oluşan bir avatar göster
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(racon.username)}&background=random&color=fff&size=100`;
        img.src = racon.profilePic || defaultAvatar;
        img.onerror = function() { 
            this.onerror = null; // Sonsuz döngüyü engelle
            this.src = defaultAvatar;
            this.style.display = 'block';
        };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'racon-username';
        nameSpan.textContent = racon.username;

        const coinSpan = document.createElement('span');
        coinSpan.className = 'racon-coins';
        coinSpan.textContent = `${racon.coins || 0} 💎`;

        const scoreSpan = document.createElement('span');
        scoreSpan.className = 'racon-score';
        scoreSpan.textContent = '10';

        div.appendChild(img);
        div.appendChild(nameSpan);
        div.appendChild(coinSpan);
        div.appendChild(scoreSpan);
        
        raconsList.appendChild(div);
    });
}
