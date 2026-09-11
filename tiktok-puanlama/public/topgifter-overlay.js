const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const section = document.getElementById('topgifter-section');
const avatarEl = document.getElementById('gifter-avatar');
const usernameEl = document.getElementById('gifter-username');
const coinsEl = document.getElementById('gifter-coins');
const bestGiftEl = document.getElementById('gifter-best-gift');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    const gifters = data.gifters || [];
    
    if (gifters.length === 0) {
        section.classList.add('hidden');
        return;
    }
    
    // En yüksek jetona göre sırala
    const topGifter = [...gifters].sort((a, b) => b.coins - a.coins)[0];
    
    if (topGifter.coins > 0) {
        section.classList.remove('hidden');
        
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(topGifter.username)}&background=random&color=fff&size=150`;
        avatarEl.src = topGifter.profilePic || defaultAvatar;
        avatarEl.onerror = function() {
            this.onerror = null;
            this.src = defaultAvatar;
        };
        
        usernameEl.textContent = topGifter.username;
        coinsEl.textContent = topGifter.coins;
        
        if (topGifter.bestGiftPic) {
            bestGiftEl.src = topGifter.bestGiftPic;
            bestGiftEl.style.display = 'block';
        } else {
            bestGiftEl.style.display = 'none';
        }
    } else {
        section.classList.add('hidden');
    }
});

