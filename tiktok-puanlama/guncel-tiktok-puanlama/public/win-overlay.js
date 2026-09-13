const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const container = document.getElementById('win-container');
const countEl = document.getElementById('win-count');
const customTextEl = document.getElementById('win-custom-text');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    if (data.targetWins > 0) {
        container.classList.remove('hidden');
        countEl.textContent = `${data.wins} / ${data.targetWins}`;
        
        // Eksiye düştüyse kırmızı yap, değilse tema rengini kullan
        if (data.wins < 0) {
            countEl.style.color = '#ff4444'; // Canlı kırmızı
        } else {
            countEl.style.color = 'var(--theme-color, #FFD700)';
        }
    } else {
        container.classList.add('hidden');
    }
    
    if (data.winCustomText) {
        customTextEl.textContent = data.winCustomText;
        customTextEl.style.display = 'block';
    } else {
        customTextEl.textContent = '';
        customTextEl.style.display = 'none';
    }
});
