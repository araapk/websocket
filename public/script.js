// DOM Elements
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message');
const recipientInput = document.getElementById('recipient');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const logContainer = document.getElementById('log');
const chatSection = document.getElementById('chat');

let socket;
let ownWsId = null;
let loggedInUsername = null;

// Fungsi untuk menampilkan pesan di area log benchmark
function logBenchmarkMsg(msg) {
  const p = document.createElement('p');
  p.textContent = msg; // Gunakan textContent untuk keamanan
  logContainer.appendChild(p);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// Fungsi Login
function login() {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    appendErrorMessage("Username and password are required for login.");
    return;
  }

  // Tutup koneksi lama jika ada sebelum membuat yang baru
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    socket.close();
  }

  // Token tetap hardcoded sesuai server untuk demo ini
  socket = new WebSocket(`wss://${location.hostname}:${location.port || 8443}/?username=${username}&password=${password}&token=token123`);

  socket.onopen = () => {
    chatSection.style.display = 'block';
    loggedInUsername = username; // Simpan username yang berhasil login
    // Pesan selamat datang akan dikirim oleh server dan ditangani oleh onmessage
    logBenchmarkMsg(`Attempting to connect as ${username}...`); // Log ke benchmark
  };

  socket.onmessage = (event) => {
    try {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case 'info':
                if (data.connectionId) ownWsId = data.connectionId;
                appendSystemMessage(data.message);
                logBenchmarkMsg(data.message); // Juga log ke benchmark
                break;
            case 'chat':
                appendChatMessage(data);
                break;
            case 'server_announcement':
                appendServerAnnouncement(data);
                break;
            case 'user_activity_notification':
                appendUserActivityNotification(data);
                break;
            case 'error':
                appendErrorMessage(data.message);
                logBenchmarkMsg(`Server Error: ${data.message}`); // Log error ke benchmark juga
                break;
            default:
                appendSystemMessage(`Server (untyped): ${event.data}`);
        }
    } catch (e) {
        console.warn("Received non-JSON message or malformed JSON:", event.data);
        appendSystemMessage(`Received raw data: ${event.data}`);
    }
  };

  socket.onclose = (event) => {
    const closeMessage = `Connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}. You might need to login again.`;
    appendSystemMessage(closeMessage);
    logBenchmarkMsg(closeMessage); // Log ke benchmark
    chatSection.style.display = 'none';
    loggedInUsername = null;
    ownWsId = null;
  };

  socket.onerror = (errorEvent) => { // errorEvent adalah objek Event, bukan string error
    const errorMessage = "WebSocket error. Check browser console for details.";
    appendErrorMessage(errorMessage);
    logBenchmarkMsg(errorMessage); // Log ke benchmark
    console.error('WebSocket Error:', errorEvent);
  };
}

// Fungsi Kirim Pesan Chat
function sendMessage() {
  const to = recipientInput.value.trim();
  const text = messageInput.value.trim();

  if (!loggedInUsername) {
    appendErrorMessage("You are not logged in.");
    return;
  }
  if (!to) {
    appendErrorMessage("Please specify a recipient user.");
    return;
  }
  if (!text) {
    appendErrorMessage("Message cannot be empty.");
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ to: to, text: text }));
    messageInput.value = '';
  } else {
    appendErrorMessage("Not connected to server. Please login.");
  }
}

// --- Fungsi-Fungsi Append Pesan ke UI Chat ---
function scrollToBottomMessages() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function appendChatMessage(data) {
    const messageItem = document.createElement('div');
    messageItem.classList.add('message-item');

    if (ownWsId && data.id === ownWsId) {
        messageItem.classList.add('own');
    } else {
        messageItem.classList.add('other');
        const usernameDisplay = document.createElement('span');
        usernameDisplay.classList.add('username-display');
        usernameDisplay.textContent = data.from;
        messageItem.appendChild(usernameDisplay);
    }

    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message-bubble');

    const messageText = document.createElement('p');
    messageText.style.margin = '0';
    messageText.textContent = data.text;
    messageBubble.appendChild(messageText);

    const timestampDisplay = document.createElement('span');
    timestampDisplay.classList.add('timestamp-display');
    timestampDisplay.textContent = data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageBubble.appendChild(timestampDisplay);

    messageItem.appendChild(messageBubble);
    messagesContainer.appendChild(messageItem);
    scrollToBottomMessages();
}

function appendSystemMessage(msgText) {
    const div = document.createElement('div');
    div.classList.add('system-message');
    div.textContent = msgText;
    messagesContainer.appendChild(div);
    scrollToBottomMessages();
}

function appendErrorMessage(msgText) {
    const div = document.createElement('div');
    div.classList.add('error-message');
    div.textContent = `⚠️ Error: ${msgText}`;
    messagesContainer.appendChild(div);
    scrollToBottomMessages();
}

function appendServerAnnouncement(data) {
    const div = document.createElement('div');
    div.classList.add('server-announcement');
    div.innerHTML = `📢 ${data.message} <span>[${data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]</span>`;
    messagesContainer.appendChild(div);
    scrollToBottomMessages();
}

function appendUserActivityNotification(data) {
    const div = document.createElement('div');
    div.classList.add('user-activity-notification', data.activity);
    div.textContent = `🔔 ${data.message} [${data.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}]`;
    messagesContainer.appendChild(div);
    scrollToBottomMessages();
}

// --- Fungsi Benchmark ---
function testWebSocket() {
  logBenchmarkMsg("Testing WebSocket ping-pong...");
  const token = 'token123';
  const testUsername = 'benchmarkUserWS'; // User sementara untuk tes
  const testPassword = 'benchmarkPassword'; // Password sementara

  // Untuk tes WebSocket murni, server perlu membalas ping dengan pong
  // Saat ini server temanmu mem-forward chat, jadi kita akan mengirim pesan chat ke diri sendiri
  // Atau server perlu diubah untuk merespons pesan khusus 'ping_benchmark'
  const testSocket = new WebSocket(`wss://${location.hostname}:${location.port || 8443}/?username=${testUsername}&password=${testPassword}&token=${token}`);
  const start = performance.now();

  testSocket.onopen = () => {
    logBenchmarkMsg(`[WebSocket Benchmark] Connection open. Sending ping to self...`);
    // Mengirim pesan ke diri sendiri sebagai simulasi ping-pong jika server mem-forwardnya
    // Atau, jika server punya logika khusus untuk `type: 'ping_benchmark'`
    testSocket.send(JSON.stringify({ to: testUsername, text: "ping_benchmark_message" }));
  };

  testSocket.onmessage = (event) => {
    const end = performance.now();
    logBenchmarkMsg(`[WebSocket Benchmark] Received response in ${Math.round(end - start)}ms. Data: ${event.data}`);
    testSocket.close();
  };

  testSocket.onerror = (errEvent) => {
      logBenchmarkMsg("WebSocket Benchmark Error. Check console.");
      console.error('WS Benchmark Error:', errEvent);
      if(testSocket.readyState === WebSocket.OPEN || testSocket.readyState === WebSocket.CONNECTING) testSocket.close();
  };
  testSocket.onclose = () => logBenchmarkMsg("WebSocket benchmark connection closed.");
}

function testRest() {
  logBenchmarkMsg("Testing REST ping-pong...");
  const start = performance.now();
  fetch(`https://${location.hostname}:${location.port || 8443}/ping`)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.text();
    })
    .then(data => {
      const end = performance.now();
      logBenchmarkMsg(`[REST] Received "${data}" in ${Math.round(end - start)}ms`);
    })
    .catch(err => {
        logBenchmarkMsg("REST Error: " + err.message);
        console.error('REST Error:', err);
    });
}

function testGrpc() {
    logBenchmarkMsg("Testing gRPC (via server /compare endpoint)...");
    fetch(`https://${location.hostname}:${location.port || 8443}/compare`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            if(data.grpc && data.grpc.startsWith("Error")){
                 logBenchmarkMsg(`[gRPC Simulated via Server] Test Failed: ${data.grpc}`);
            } else {
                 logBenchmarkMsg(`[gRPC Simulated via Server] Ping in ${data.grpc || 'N/A (check server logs)'}`);
            }
            if(data.rest && data.rest.startsWith("Error")){
                 logBenchmarkMsg(`[REST via Server /compare] Test Failed: ${data.rest}`);
            } else {
                 // logBenchmarkMsg(`[REST via Server /compare] Ping in ${data.rest || 'N/A'}`);
            }
        })
        .catch(err => {
            logBenchmarkMsg("gRPC Test Error (via /compare): " + err.message);
            console.error('gRPC /compare Error:', err);
        });
}

// Event listener untuk Enter di input pesan
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
        event.preventDefault();
    }
});

// Tombol login dan send sudah memiliki onclick di HTML.
// `initializeWebSocket()` tidak ada, karena koneksi dibuat saat `login()`.s