// Backend connection setup
let backendUrl = location.protocol === 'file:' ? "https://tiktok-chat-reader.zerody.one/" : undefined;
let connection = new TikTokIOConnection(backendUrl);

// Counters and trackers
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;
let moderators = new Set();
let pendingLikeMessages = {}; // For like aggregation: { username: count }

// Settings from obs.html
if (!window.settings) window.settings = {};

// DOM Ready
$(document).ready(() => {
    $('#connectButton').click(connect);
    $('#uniqueIdInput').on('keyup', function(e) {
        if (e.key === 'Enter') connect();
    });
    if (window.settings.username) connect();
});

// Connection handler
function connect() {
    let uniqueId = window.settings.username || $('#uniqueIdInput').val();
    if (!uniqueId) return alert('No username entered');

    $('#stateText').text('Connecting...');
    
    connection.connect(uniqueId, {
        enableExtendedGiftInfo: true
    }).then(state => {
        $('#stateText').text(`Connected to roomId ${state.roomId}`);
        // Reset stats
        viewerCount = 0;
        likeCount = 0;
        diamondsCount = 0;
        updateRoomStats();
    }).catch(errorMessage => {
        $('#stateText').text(errorMessage);
        if (window.settings.username) {
            setTimeout(() => connect(window.settings.username), 30000);
        }
    });
}

// Utility functions
function sanitize(text) {
    return text.replace(/</g, '&lt;');
}

function updateRoomStats() {
    $('#roomStats').html(`Viewers: <b>${viewerCount.toLocaleString()}</b> Likes: <b>${likeCount.toLocaleString()}</b> Earned Diamonds: <b>${diamondsCount.toLocaleString()}</b>`);
}

function generateUsernameLink(data) {
    return `<a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">${data.uniqueId}</a>`;
}

function isPendingStreak(data) {
    return data.giftType === 1 && !data.repeatEnd;
}

// Message handlers
function addJoinItem(data) {
    const joinContainer = $('.joincontainer');
    
    if (joinContainer.children().length > 3000) {
        joinContainer.find('.join-message').first().remove();
    }

    const timestamp = new Date().toLocaleTimeString(); // Get current time
    const profileLink = generateUsernameLink(data);
    
    joinContainer.append(`
        <div class="join-message">
            <small class="timestamp">[${timestamp}]</small>
            <img class="tiny-pfp" src="${data.profilePictureUrl}" onerror="this.src='default-profile.png'">
            <span style="color:#21b2c2">${profileLink} joined</span>
        </div>
    `);
}


function addChatItem(color, data, text, summarize) {
    let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.chatcontainer');

    // Cleanup old messages
    if (container.find('div').length > 5000) {
        container.find('div').slice(0, 1000).remove();
    }
    container.find('.temporary').remove();

    const timestamp = new Date().toLocaleTimeString();

    // Show pending likes before new messages
    if (!summarize && Object.keys(pendingLikeMessages).length > 0) {
        for (const [username, count] of Object.entries(pendingLikeMessages)) {
            container.append(`
                <div class="static">
                    <small class="timestamp">[${timestamp}]</small>
                    <span style="color:#447dd4">${username} liked the LIVE x${count}</span>
                </div>
            `);
        }
        pendingLikeMessages = {};
    }

    // Add the actual message
    container.append(`
        <div class=${summarize ? 'temporary' : 'static'}>
            <small class="timestamp">[${timestamp}]</small>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b> 
                <span style="color:${color}">${sanitize(text)}</span>
            </span>
        </div>
    `);
}

function addGiftItem(data) {
    let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.giftcontainer');

    if (container.find('div').length > 200) {
        container.find('div').slice(0, 100).remove();
    }

    let streakId = data.userId.toString() + '_' + data.giftId;
    const timestamp = new Date().toLocaleTimeString(); // Get current time

    let html = `
        <div data-streakid=${isPendingStreak(data) ? streakId : ''}>
            <small class="timestamp">[${timestamp}]</small>
            <img class="miniprofilepicture" src="${data.profilePictureUrl}">
            <span>
                <b>${generateUsernameLink(data)}:</b> <span>${data.describe}</span><br>
                <div>
                    <table>
                        <tr>
                            <td><img class="gifticon" src="${data.giftPictureUrl}"></td>
                            <td>
                                <span>Name: <b>${data.giftName}</b> (ID:${data.giftId})<span><br>
                                <span>Repeat: <b style="${isPendingStreak(data) ? 'color:red' : ''}">x${data.repeatCount.toLocaleString()}</b><span><br>
                                <span>Cost: <b>${(data.diamondCount * data.repeatCount).toLocaleString()} Diamonds</b><span>
                            </td>
                        </tr>
                    </table>
                </div>
            </span>
        </div>
    `;

    let existingStreakItem = container.find(`[data-streakid='${streakId}']`);
    if (existingStreakItem.length) {
        existingStreakItem.replaceWith(html);
    } else {
        container.append(html);
    }

    container.stop().animate({ scrollTop: container[0].scrollHeight }, 800);
}


// Moderator functions
function updateModList() {
    const container = $('.modcontainer');
    container.empty().append('<h3 class="containerheader">Moderators</h3>');
    moderators.forEach(mod => {
        container.append(`
            <div class="mod-message">
                <img src="https://cdn-icons-png.flaticon.com/512/4519/4519678.png" onerror="this.src='default-profile.png'">
                <a class="usernamelink" href="https://www.tiktok.com/@${mod}" target="_blank">${mod}</a>
            </div>
        `);
    });
}

// Event listeners
connection.on('member', (msg) => {
    if (window.settings.showJoins === "0") return;
    addJoinItem(msg);
});

connection.on('like', (msg) => {
    if (typeof msg.totalLikeCount === 'number') {
        likeCount = msg.totalLikeCount;
        updateRoomStats();
    }
    if (window.settings.showLikes === "0") return;
    pendingLikeMessages[msg.uniqueId] = (pendingLikeMessages[msg.uniqueId] || 0) + (msg.likeCount || 1);
});

connection.on('roomUser', (msg) => {
    if (typeof msg.viewerCount === 'number') {
        viewerCount = msg.viewerCount;
        updateRoomStats();
    }
});

connection.on('chat', (msg) => {
    if (window.settings.showChats === "0") return;
    addChatItem('', msg, msg.comment);
});

connection.on('gift', (data) => {
    if (!isPendingStreak(data) && data.diamondCount > 0) {
        diamondsCount += (data.diamondCount * data.repeatCount);
        updateRoomStats();
    }
    if (window.settings.showGifts === "0") return;
    addGiftItem(data);
});

connection.on('social', (data) => {
    if (window.settings.showFollows === "0") return;
    let color = data.displayType.includes('follow') ? '#ff005e' : '#2fb816';
    addChatItem(color, data, data.label.replace('{0:user}', ''));
});

connection.on('roomAdmins', (admins) => {
    moderators = new Set(admins.map(m => m.uniqueId));
    updateModList();
});

connection.on('roomAdmin', (data) => {
    if (data.action === 'add') moderators.add(data.uniqueId);
    else moderators.delete(data.uniqueId);
    updateModList();
});

connection.on('userBlocked', (data) => {
    if (moderators.has(data.operator?.uniqueId)) {
        addChatItem('#ff5555', data.operator, `[MOD] Banned ${data.uniqueId}`);
    }
});

function exportAsHTML() {
    // Create HTML structure
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>TikTok Chat Export - ${new Date().toLocaleString()}</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .message { margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
            .timestamp { color: #777; font-size: 0.9em; margin-right: 10px; }
            .user { font-weight: bold; color: #0066cc; }
            .chat { color: #333; }
            .join { color: #21b2c2; }
            .gift { color: #ff6600; }
            .like { color: #447dd4; }
            .mod-action { color: #ff5555; }
        </style>
    </head>
    <body>
        <h1>TikTok Chat Export</h1>
        <p>Exported at: ${new Date().toLocaleString()}</p>
        <div class="chat-log">
         <div class="chat-log">
            <div style="font-weight:bold; margin-bottom: 10px;">
                Date: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
    `;

    // Process all containers
    const processMessages = (container, className) => {
        $(container).children().each(function() {
            const timestamp = $(this).find('.timestamp').text() || '[No timestamp]';
            const user = $(this).find('.usernamelink').text() || 'Unknown';
            let content = '';
            let type = 'chat';

            if ($(this).hasClass('join-message')) {
                content = 'joined';
                type = 'join';
            } else if ($(this).find('.gifticon').length) {
                content = $(this).find('td:last').text().replace(/\s+/g, ' ').trim();
                type = 'gift';
            } else {
                content = $(this).find('span:last').text();
                if (content.includes('liked the LIVE')) type = 'like';
                if (content.includes('[MOD]')) type = 'mod-action';
            }

            htmlContent += `
            <div class="message ${type}">
                <span class="timestamp">${timestamp}</span>
                <span class="user">${user}</span>
                <span class="${type}">${content}</span>
            </div>
            `;
        });
    };

    // Process all message types
    processMessages('.joincontainer', 'join');
    processMessages('.chatcontainer', 'chat');
    processMessages('.giftcontainer', 'gift');

    // Close HTML
    htmlContent += `
        </div>
        </body>
        </html>
    `;

    // Create download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tiktok-chat-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Add to your $(document).ready()
$('#exportButton').click(exportAsHTML);

const dateString = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    $('.chatcontainer').before(`<div id="currentDate" style="font-weight:bold; margin-bottom: 10px;">${dateString}</div>`);


connection.on('streamEnd', () => {
    $('#stateText').text('Stream ended.');
    if (window.settings.username) {
        setTimeout(() => connect(window.settings.username), 3000);
    }

});