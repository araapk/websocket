let ws;
let socket;
const log = document.getElementById('log');

function logMsg(msg) {
  const p = document.createElement('p');
  p.innerText = msg;
  log.appendChild(p);
}

// Login
function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  // Kirim username, password, dan token sebagai query string
  socket = new WebSocket(`wss://${location.hostname}:8443/?username=${username}&password=${password}&token=token123`);

  socket.onopen = () => {
    document.getElementById('chat').style.display = 'block';
    logMsg(`Connected to server as ${username}`);
  };

  socket.onmessage = (event) => {
    const messages = document.getElementById('messages');
    const div = document.createElement('div');
    div.innerText = event.data;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  };

  socket.onclose = () => logMsg("Connection closed");
  socket.onerror = err => logMsg("WebSocket error: " + err.message);
}

// Kirim Pesan
function sendMessage() {
  const to = document.getElementById('recipient').value;
  const text = document.getElementById('message').value;
  if (socket && socket.readyState === WebSocket.OPEN) {
    const from = document.getElementById('username').value; // ambil username yang login
    socket.send(JSON.stringify({ from, to, text }));
    document.getElementById('message').value = '';
  }
}

socket.onmessage = (event) => {
  const messages = document.getElementById('messages');
  const div = document.createElement('div');

  try {
    const data = JSON.parse(event.data);
    if (data.from && data.text) {
      div.innerText = `💬 ${data.from}: ${data.text}`;
    } else {
      div.innerText = event.data; // fallback untuk pesan biasa
    }
  } catch (e) {
    div.innerText = event.data; // fallback jika bukan JSON
  }

  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
};

// Test WebSocket
function testWebSocket() {
  const token = 'token123';
  const testSocket = new WebSocket(`wss://${location.hostname}:8443/?username=user1&password=pass1&token=${token}`);
  const start = performance.now();

  testSocket.onopen = () => {
    testSocket.send(JSON.stringify({ to: "user2", text: "ping from test" }));
  };

  testSocket.onmessage = (event) => {
    const end = performance.now();
    logMsg(`[WebSocket] "${event.data}" in ${Math.round(end - start)}ms`);
    testSocket.close();
  };

  testSocket.onerror = err => logMsg("WebSocket Error: " + err.message);
  testSocket.onclose = () => logMsg("WebSocket connection closed.");
}

// Test REST API
function testRest() {
  const start = performance.now();

  fetch('https://localhost:8443/ping', {
    method: 'GET',
    headers: { 'Accept': 'text/plain' }
  })
    .then(res => res.text())
    .then(data => {
      const end = performance.now();
      logMsg(`[REST] "${data}" in ${Math.round(end - start)}ms`);
    })
    .catch(err => logMsg("REST Error: " + err.message));
}