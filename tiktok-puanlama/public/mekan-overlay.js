const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const container = document.getElementById('mekan-container');
const avatarEl = document.getElementById('mekan-avatar');
const usernameEl = document.getElementById('mekan-username');
const textEl = document.getElementById('mekan-text');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    let mUser = data.vipOverride?.mekanName;
    let mText = data.vipOverride?.mekanText;
    let mPic = '';
    
    if (!mUser && data.gifters && data.gifters.length > 0) {
        const topGifter = [...data.gifters].sort((a, b) => b.coins - a.coins)[0];
        if (topGifter && topGifter.coins > 0) {
            mUser = topGifter.username;
            mPic = topGifter.profilePic;
            if (!mText) mText = `${topGifter.coins} Jeton`;
        }
    }

    if (mUser) {
        usernameEl.textContent = mUser;
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(mUser)}&background=random&color=fff&size=150`;
        avatarEl.src = mPic || defaultAvatar;
        avatarEl.onerror = function() { this.src = defaultAvatar; this.onerror = null; };
        
        if (mText) {
            textEl.textContent = mText;
            textEl.classList.remove('hidden');
        } else {
            textEl.classList.add('hidden');
        }
        
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }
});
