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

  socket = new WebSocket(`wss://${location.hostname}:8443/?username=${username}&password=${password}`);

  socket.onopen = () => {
    document.getElementById('chat').style.display = 'block';
    logMsg("Connected as " + username);
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
    socket.send(JSON.stringify({ to, text }));
  }
}

// Test WebSocket
function testWebSocket() {
  const token = 'token123';
  ws = new WebSocket(`wss://${location.hostname}:8443/?token=${token}`);

  ws.onopen = () => {
    const start = performance.now();
    ws.send('ping');
  };

  ws.onmessage = (event) => {
    const end = performance.now();
    logMsg(`[WebSocket] "${event.data}" in ${Math.round(end - start)}ms`);
    ws.close();
  };

  ws.onerror = err => logMsg("WebSocket Error: " + err.message);
  ws.onclose = () => logMsg("WebSocket connection closed.");
}

// Test gRPC
function testGrpc() {
  const start = performance.now();
  fetch('http://localhost:50051/ping', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      const end = performance.now();
      logMsg(`[gRPC] "${data.message}" in ${Math.round(end - start)}ms`);
    })
    .catch(err => logMsg("gRPC Error: " + err.message));
}

// Test REST API
function testRest() {
  const start = performance.now();
  fetch('http://localhost:8080/ping')
    .then(res => res.text())
    .then(data => {
      const end = performance.now();
      logMsg(`[REST] "${data}" in ${Math.round(end - start)}ms`);
    })
    .catch(err => logMsg("REST Error: " + err.message));
}