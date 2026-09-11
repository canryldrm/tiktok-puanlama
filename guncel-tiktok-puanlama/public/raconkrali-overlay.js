const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const container = document.getElementById('racon-container');
const avatarEl = document.getElementById('racon-avatar');
const usernameEl = document.getElementById('racon-username');
const textEl = document.getElementById('racon-text');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    let rUser = data.vipOverride?.raconName;
    let rText = data.vipOverride?.raconText;
    let rPic = '';

    if (!rUser && data.racons && data.racons.length > 0) {
        const sortedRacons = [...data.racons].sort((a, b) => (b.score || 0) - (a.score || 0));
        if (sortedRacons[0]) {
            rUser = sortedRacons[0].username;
            rPic = sortedRacons[0].profilePic;
            if (!rText) rText = `${sortedRacons[0].count}x Racon`;
        }
    }

    if (rUser) {
        usernameEl.textContent = rUser;
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(rUser)}&background=random&color=fff&size=150`;
        avatarEl.src = rPic || defaultAvatar;
        avatarEl.onerror = function() { this.src = defaultAvatar; this.onerror = null; };
        
        if (rText) {
            textEl.textContent = rText;
            textEl.classList.remove('hidden');
        } else {
            textEl.classList.add('hidden');
        }
        
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
});
