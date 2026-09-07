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

// Oylama başladığında eski raconları temizle
socket.on('state:update', (data) => {
    // Sadece yeni bir bağlantı kurulduğunda veya listeyi sunucu boşalttığında temizler
    if(data.racons && data.racons.length === 0) {
        raconsList.innerHTML = '';
        raconsSection.classList.add('hidden');
    }
});

socket.on('racon:new', (racon) => {
    addRacon(racon);
});

function createRaconElement(racon) {
    const div = document.createElement('div');
    div.className = 'racon-item';
    
    const img = document.createElement('img');
    img.className = 'racon-avatar';
    img.src = racon.profilePic || '';
    img.onerror = () => { img.style.display = 'none'; };

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
    
    return div;
}

function addRacon(racon) {
    raconsSection.classList.remove('hidden');
    const el = createRaconElement(racon);
    
    // Yeni geleni üste ekle
    raconsList.insertBefore(el, raconsList.firstChild);
    
    // Ekranda aynı anda en fazla 5 tane görünsün
    while (raconsList.children.length > 5) {
        raconsList.removeChild(raconsList.lastChild);
    }
}
