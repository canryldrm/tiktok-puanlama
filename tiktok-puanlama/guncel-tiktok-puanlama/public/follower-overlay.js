const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const container = document.getElementById('follower-container');
const avatarEl = document.getElementById('follower-avatar');
const usernameEl = document.getElementById('follower-username');

let lastFollowerTime = 0;
let hideTimeout = null;

socket.on('state:update', (data) => {
    if (data.latestFollower && data.latestFollower.timestamp > lastFollowerTime) {
        lastFollowerTime = data.latestFollower.timestamp;
        
        usernameEl.textContent = data.latestFollower.username;
        
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.latestFollower.username)}&background=random&color=fff&size=150`;
        avatarEl.src = data.latestFollower.profilePic || defaultAvatar;
        avatarEl.onerror = function() { this.src = defaultAvatar; this.onerror = null; };
        
        container.classList.remove('hidden');
        container.classList.remove('fade-out');
        
        if (hideTimeout) clearTimeout(hideTimeout);
        
        hideTimeout = setTimeout(() => {
            container.classList.add('fade-out');
            setTimeout(() => {
                container.classList.add('hidden');
                container.classList.remove('fade-out');
            }, 500);
        }, 3000);
    }
});
