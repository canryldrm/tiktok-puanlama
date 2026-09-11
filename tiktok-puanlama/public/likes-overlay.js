const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const currentRoomId = urlParams.get('room');
if (currentRoomId) {
    socket.on('connect', () => socket.emit('joinRoom', currentRoomId));
}

const likesSection = document.getElementById('likes-section');
const likesList = document.getElementById('likes-list');

socket.on('state:update', (data) => {
    if (data.themeColor) document.documentElement.style.setProperty('--theme-color', data.themeColor);

    const likes = data.likes || [];
    if(likes.length === 0) {
        likesList.innerHTML = '';
        likesSection.classList.add('hidden');
        return;
    }
    
    likesSection.classList.remove('hidden');
    let sortedLikes = [...likes].sort((a, b) => b.count - a.count);
    const topLikes = sortedLikes.slice(0, 5);
    
    likesList.innerHTML = '';
    
    topLikes.forEach((like, index) => {
        const div = document.createElement('div');
        div.className = 'like-item';
        
        const img = document.createElement('img');
        img.className = 'like-avatar';
        const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(like.username)}&background=random&color=fff&size=100`;
        img.src = like.profilePic || defaultAvatar;
        img.onerror = function() { 
            this.onerror = null;
            this.src = defaultAvatar;
        };

        const nameSpan = document.createElement('span');
        nameSpan.className = 'like-username';
        nameSpan.textContent = like.username;

        const countSpan = document.createElement('span');
        countSpan.className = 'like-count';
        countSpan.textContent = `${like.count} ❤️`;

        div.appendChild(img);
        div.appendChild(nameSpan);
        div.appendChild(countSpan);
        
        likesList.appendChild(div);
    });
});

