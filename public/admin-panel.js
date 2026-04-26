
const sidebar = document.getElementById('sidebar');
document.getElementById('mobile-toggle').onclick = () => sidebar.classList.toggle('-translate-x-full');

let allUsers = [];
const socket = io();
let currentChatUserId = null;
let chatData = {};

// Request notification permission on load
if (Notification.permission !== "granted" && Notification.permission !== "denied") {
    Notification.requestPermission();
}

// Load summary of active chats on refresh
async function loadActiveConversations() {
    try {
        const response = await fetch('/api/admin/active-chats');
        const activeUsers = await response.json();
        activeUsers.forEach(user => {
            if (!chatData[user._id]) {
                chatData[user._id] = [{
                    userId: user._id,
                    userName: user.userName,
                    userImage: user.userImage,
                    message: user.lastMessage,
                    timestamp: user.timestamp,
                    sender: 'user'
                }];
            }
        });
        updateAdminUserList();
    } catch (err) {
        console.error("Error loading active chats:", err);
    }
}
loadActiveConversations();

// Socket listeners
socket.on('new-user-message', (data) => {
    if (!chatData[data.userId]) chatData[data.userId] = [];
    chatData[data.userId].push({ ...data, sender: 'user' });
    updateAdminUserList();
    if (currentChatUserId === data.userId) renderAdminMessages();
    // Browser Notification Logic
    if (Notification.permission === "granted") {
        const notification = new Notification(`New Message from ${data.userName}`, {
            body: data.message || "Sent an attachment",
            icon: data.userImage || "/favicon.ico" // Path to your SoftSol logo
        });

        // Optional: Open the chat when clicking the notification
        notification.onclick = () => {
            window.focus();
            if (typeof selectUser === "function") {
                selectUser(data.userId, data.userName);
            }
        };
    }
});

socket.on('chat-history', (history) => {
    if (history.length > 0) {
        const uid = history[0].userId;
        chatData[uid] = history;
        updateAdminUserList();
        if (currentChatUserId === uid) renderAdminMessages();
    }
});

// --- UPDATED: Select User Function with Profile Header ---
function selectUser(uid, name) {
    currentChatUserId = uid;
    const userMessages = chatData[uid];
    const lastMsg = userMessages[userMessages.length - 1];

    // 1. Show Chat UI Elements
    document.getElementById('no-chat-selected')?.classList.add('hidden');
    document.getElementById('chat-profile-header')?.classList.remove('hidden');
    document.getElementById('admin-chat-messages')?.classList.remove('hidden');
    document.getElementById('admin-input-area')?.classList.remove('hidden');

    // 2. Update Profile Header Details
    document.getElementById('header-user-name').innerText = name;
    document.getElementById('header-user-id').innerText = `ID: ${uid}`;
    document.getElementById('header-user-img').src = lastMsg.userImage || `https://ui-avatars.com/api/?name=${name}&background=6366f1&color=fff`;

    // 3. Set External Chat Link
    document.getElementById('external-chat-link').href = `/admin-chat-detail?userId=${uid}`;

    // 4. Fetch Full History & Render
    socket.emit('join-chat', uid);
    renderAdminMessages();
    updateAdminUserList();
}

function updateAdminUserList() {
    const list = document.getElementById('admin-user-list');
    if (!list) return;
    list.innerHTML = '';

    Object.keys(chatData).forEach(uid => {
        const userMessages = chatData[uid];

        // FIX: Find a message from the USER specifically to get their profile info
        // This ensures that even if Admin spoke last, we use the User's photo/name
        const userInfo = userMessages.find(m => m.sender === 'user' && m.userImage && m.userImage !== "null") || userMessages[0];
        const lastMsg = userMessages[userMessages.length - 1];

        const userName = userInfo.userName || "User";
        const userImg = userInfo.userImage;

        const hasValidImage = userImg && userImg !== "null" && userImg !== "";

        const imgHtml = hasValidImage
            ? `<img src="${userImg}" class="w-10 h-10 rounded-full border border-slate-200 shadow-sm object-cover">`
            : `<div class="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs">${userName[0].toUpperCase()}</div>`;

        list.innerHTML += `
            <div onclick="selectUser('${uid}', '${userName}')" 
                 class="p-4 border-b hover:bg-slate-50 cursor-pointer transition-all ${currentChatUserId === uid ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : ''}">
                <div class="flex items-center gap-3">
                    <div class="shrink-0">${imgHtml}</div>
                    <div class="min-w-0 flex-1">
                        <div class="flex justify-between items-start">
                            <h3 class="font-bold text-sm text-slate-900 truncate">${userName}</h3>
                        </div>
                        <div class="text-[11px] text-slate-500 truncate mt-1">
                            ${lastMsg.message || '📎 Attachment'}
                        </div>
                    </div>
                </div>
            </div>`;
    });
}

function renderAdminMessages() {
    const box = document.getElementById('admin-chat-messages');
    if (!box || !currentChatUserId) return;
    box.innerHTML = '';

    chatData[currentChatUserId].forEach(msg => {
        const isAdmin = msg.sender === 'admin';
        let content = msg.message;
        if (msg.type === 'file') {
            content = `<a href="${msg.fileData}" download="${msg.fileName}" class="underline font-bold break-all">📎 ${msg.fileName}</a>`;
        }
        
        // Format the timestamp
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        box.innerHTML += `
        <div class="flex ${isAdmin ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-1">
            <div class="p-3 rounded-2xl max-w-[85%] text-sm ${isAdmin ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border text-slate-800 rounded-tl-none'} shadow-sm break-words">
                ${content}
                <span class="text-[10px] block text-right mt-1 ${isAdmin ? 'text-indigo-200' : 'text-slate-400'}">${timeStr}</span>
            </div>
        </div>`;
    });
    box.scrollTop = box.scrollHeight;
}

// Send Reply
document.getElementById('admin-send-btn').onclick = sendReply;
document.getElementById('admin-chat-input').onkeydown = (e) => { if (e.key === 'Enter') sendReply(); };

function sendReply() {
    const input = document.getElementById('admin-chat-input');
    const messageText = input.value.trim();
    if (!currentChatUserId || !messageText) return;

    // FIX: Get the user's name and image from the existing history before sending
    const userHistory = chatData[currentChatUserId];
    const userInfo = userHistory.find(m => m.sender === 'user') || userHistory[0];

    const reply = {
        userId: currentChatUserId,
        userName: userInfo.userName,   // Carry over user's name
        userImage: userInfo.userImage, // Carry over user's image
        message: messageText,
        sender: 'admin',
        timestamp: new Date()
    };

    socket.emit('admin-reply', reply);

    // Update local UI
    if (!chatData[currentChatUserId]) chatData[currentChatUserId] = [];
    chatData[currentChatUserId].push(reply);

    renderAdminMessages();
    updateAdminUserList(); // The sidebar will now have the data it needs
    input.value = '';
}

// --- User Management Logic ---
async function loadUsers() {
    const tableBody = document.getElementById('user-table-body');
    const reloadIcon = document.getElementById('reload-icon');
    if (!tableBody) return;

    if (reloadIcon) reloadIcon.classList.add('fa-spin');
    tableBody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-slate-500">Syncing with Clerk...</td></tr>';

    try {
        const response = await fetch('/api/admin/users');
        allUsers = await response.json();
        renderUserTable(allUsers);
    } catch (err) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-red-500">Failed to load users.</td></tr>';
    } finally {
        setTimeout(() => { if (reloadIcon) reloadIcon.classList.remove('fa-spin'); }, 500);
    }
}

function renderUserTable(usersToDisplay) {
    const tableBody = document.getElementById('user-table-body');
    tableBody.innerHTML = '';
    if (usersToDisplay.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="p-10 text-center text-slate-500">No matching users found.</td></tr>';
        return;
    }
    usersToDisplay.forEach(user => {
        tableBody.insertAdjacentHTML('beforeend', `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 transition">
                        <td class="px-6 py-4 flex items-center gap-3">
                            <img src="${user.image}" class="w-10 h-10 rounded-full border border-slate-100 shrink-0">
                            <div class="min-w-0">
                                <div class="font-bold text-slate-900 truncate">${user.name}</div>
                                <div class="text-xs text-slate-400 truncate">${user.email}</div>
                            </div>
                        </td>
                        <td class="px-6 py-4">
                            <div class="text-sm font-medium text-slate-700 whitespace-nowrap">${user.phone || 'N/A'}</div>
                            <div class="text-[10px] font-bold uppercase tracking-tight text-indigo-600 truncate">${user.company || 'N/A'}</div>
                        </td>
                        <td class="px-6 py-4 font-mono text-[10px] text-slate-400 whitespace-nowrap">${user.id}</td>
                        <td class="px-6 py-4 text-right">
                            <button class="text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg transition font-bold text-sm">Ban</button>
                        </td>
                    </tr>`);
    });
}

document.getElementById('user-search-input').addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredUsers = allUsers.filter(u =>
        u.name.toLowerCase().includes(searchTerm) ||
        u.email.toLowerCase().includes(searchTerm) ||
        u.id.toLowerCase().includes(searchTerm)
    );
    renderUserTable(filteredUsers);
});

function showTab(tabName) {
    document.querySelectorAll('.tab-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${tabName}-content`).classList.remove('hidden');
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('bg-indigo-600', 'text-white'));
    document.getElementById(`tab-${tabName}-link`).classList.add('bg-indigo-600', 'text-white');
    document.getElementById('current-tab-title').innerText = tabName.charAt(0).toUpperCase() + tabName.slice(1) + ' Management';
    if (tabName === 'users') loadUsers();
    if (window.innerWidth < 1024) sidebar.classList.add('-translate-x-full');
}

function handleLogout() {
    sessionStorage.removeItem('isAdmin');
    window.location.replace('/admin');
}
