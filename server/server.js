import fs from 'fs';
import https from 'https';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws'; // WebSocket juga diimpor untuk type checking jika perlu
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import path from 'path';
import fetch from 'node-fetch';

// ======= Mengakses direktori saat ini =======
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ======= Konstanta =======
const PORT = 8443;
const MAX_CONNECTIONS = 20;
const HEARTBEAT_INTERVAL = 30000;
const SERVER_ANNOUNCEMENT_INTERVAL_MS = 30000;
const VALID_TOKENS = ['token123', 'token456'];
const PROTO_PATH = path.join(__dirname, 'proto', 'pingpong.proto');
const CERT_KEY_PATH = path.join(__dirname, '..', 'certs', 'key.pem');
const CERT_CERT_PATH = path.join(__dirname, '..', 'certs', 'cert.pem');

// ======= Data Pengguna Statis =======
const USERS = {
  user1: { password: 'pass1' },
  user2: { password: 'pass2' },
  benchmarkUserWS: { password: 'benchmarkPassword' } // Tambahkan user untuk benchmark jika perlu
};
let connections = {};
let activeConnections = 0;

// ======= Setup Express dan HTTPS =======
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
const server = https.createServer({
  key: fs.readFileSync(CERT_KEY_PATH),
  cert: fs.readFileSync(CERT_CERT_PATH),
}, app);

// ======= Setup WebSocket (WSS) =======
const wss = new WebSocketServer({ noServer: true });

// Menyimpan interval heartbeat per koneksi agar bisa di-clear
const clientIntervals = new Map(); // Map<WebSocket, {heartbeat: NodeJS.Timeout}>

// ======= Fungsi Helper WebSocket =======
function heartbeat() { // 'this' akan merujuk ke instance WebSocket (ws)
  this.isAlive = true;
  console.log(`Server: Heartbeat pong received from ${this.username || 'unknown user'}. Client is alive.`);
}

let globalAnnouncementIntervalId;
function broadcastGlobalServerAnnouncement() {
    const announcement = {
        type: 'server_announcement',
        message: `Server Info: Waktu server saat ini ${new Date().toLocaleTimeString()}`,
        timestamp: new Date().toLocaleTimeString()
    };
    const announcementString = JSON.stringify(announcement);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(announcementString);
        }
    });
}

function broadcastUserActivity(username, activityType, wsOrigin) {
    const message = activityType === 'joined'
        ? `${username} has joined the chat!`
        : `${username} has left the chat.`;
    const notification = {
        type: 'user_activity_notification',
        user: username,
        activity: activityType,
        message: message,
        timestamp: new Date().toLocaleTimeString()
    };
    const notificationString = JSON.stringify(notification);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            if (activityType === 'joined' && client === wsOrigin) return;
            client.send(notificationString);
        }
    });
    console.log(`Server: Broadcasted ${activityType} notification for ${username}`);
}

// ======= Event Handler WebSocket =======
wss.on('connection', function connection(ws, req) {
  console.log("Server: New WebSocket connection attempt...");

  if (activeConnections >= MAX_CONNECTIONS) {
    console.log(`Server: Connection limit (${MAX_CONNECTIONS}) reached. Rejecting new connection.`);
    ws.send(JSON.stringify({ type: 'error', message: 'Server is full. Please try again later.' }));
    ws.terminate();
    return;
  }

  const params = new URLSearchParams(req.url.split('?')[1]);
  const username = params.get('username');
  const password = params.get('password');
  const token = params.get('token');

  console.log(`Server: Validating credentials for username: ${username}`);
  if (!USERS[username] || USERS[username].password !== password) {
    console.log(`Server: Invalid username or password for attempt: ${username}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid username or password' }));
    ws.close(1008, 'Unauthorized: Invalid username or password');
    return;
  }

  if (!VALID_TOKENS.includes(token)) {
    console.log(`Server: Invalid token for ${username}`);
    ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized: Invalid token' }));
    ws.close(1008, 'Unauthorized: Invalid token');
    return;
  }

  if (connections[username]) {
    console.log(`Server: ${username} is already connected. Rejecting new connection.`);
    ws.send(JSON.stringify({ type: 'error', message: `User ${username} is already connected.` }));
    ws.close(1013, 'User already connected');
    return;
  }

  activeConnections++;
  ws.id = `wsid-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  ws.username = username;
  connections[username] = ws;
  ws.isAlive = true;

  console.log(`Server: ${ws.username} connected successfully. Active connections: ${activeConnections}/${MAX_CONNECTIONS}`);
  ws.send(JSON.stringify({
    type: 'info',
    message: `Hello ${ws.username}, you are connected.`,
    connectionId: ws.id
  }));
  broadcastUserActivity(ws.username, 'joined', ws);

  // Setup interval heartbeat untuk klien ini
  const currentHeartbeatInterval = setInterval(() => {
    if (!ws.isAlive) {
      console.log(`Server: ${ws.username} did not respond to ping. Terminating connection.`);
      // clearInterval(currentHeartbeatInterval); // Akan di-clear di 'close'
      ws.terminate();
      // 'close' event akan menangani sisanya
      return;
    }
    ws.isAlive = false;
    // console.log(`Server: Pinging ${ws.username}...`); // Opsional: log saat ping dikirim
    ws.ping();
  }, HEARTBEAT_INTERVAL);

  clientIntervals.set(ws, { heartbeat: currentHeartbeatInterval }); // Simpan interval
  ws.on('pong', heartbeat); // Fungsi heartbeat sudah ada lognya

  ws.on('message', function incoming(message) {
    ws.isAlive = true;
    try {
      const parsedMessage = JSON.parse(message);
      const { to, text } = parsedMessage;
      console.log(`Server: Message from ${ws.username} to ${to}: ${text}`);
      if (to && text && connections[to]) {
        connections[to].send(JSON.stringify({
            type: 'chat', from: ws.username, id: ws.id, to: to, text: text, timestamp: new Date().toLocaleTimeString()
        }));
        ws.send(JSON.stringify({ // Echo ke pengirim
            type: 'chat', from: ws.username, id: ws.id, to: to, text: text, timestamp: new Date().toLocaleTimeString()
        }));
      } else if (to && text && !connections[to]) {
        ws.send(JSON.stringify({type: 'error', message: `User ${to} not connected.`}));
      } else {
        console.log(`Server: Received unhandled message structure from ${ws.username}: ${message}`);
        ws.send(JSON.stringify({type: 'error', message: 'Invalid message format.'}));
      }
    } catch (err) {
      console.error(`Server: Error parsing message from ${ws.username}: ${message.toString()}`, err);
      ws.send(JSON.stringify({type: 'error', message: 'Invalid JSON message format.'}));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Server: --- CLOSE EVENT for ${ws.username || 'unidentified user'} ---`);
    console.log(`Server: Code: ${code}, Reason: ${reason ? reason.toString() : 'No reason provided'}`);

    const intervals = clientIntervals.get(ws);
    if (intervals && intervals.heartbeat) {
        clearInterval(intervals.heartbeat);
        console.log(`Server: Cleared heartbeatInterval for ${ws.username}`);
    } else {
        console.log(`Server: heartbeatInterval was already cleared or not found for ${ws.username} on close`);
    }
    clientIntervals.delete(ws);

    if (ws.username && connections[ws.username]) { // Pastikan username ada sebelum delete
        delete connections[ws.username];
        activeConnections = Math.max(0, activeConnections - 1); // Pastikan tidak jadi negatif
        console.log(`Server: ${ws.username} disconnected. Active connections: ${activeConnections}/${MAX_CONNECTIONS}`);
        broadcastUserActivity(ws.username, 'left', null);
    } else {
        // Jika username tidak ada, atau koneksi ditolak sebelum username diset
        if (activeConnections > 0 && !connections[ws.username]) {
             // Ini bisa terjadi jika koneksi ditolak sebelum sepenuhnya terdaftar
             // Atau jika ws.username tidak ter-set dengan benar
             console.log("Server: A connection was closed before full registration or ws.username was not set.");
        }
         console.log(`Server: An unidentified connection closed. Active connections: ${activeConnections}/${MAX_CONNECTIONS}`);
    }
  });

  ws.on('error', (err) => {
    console.log(`Server: --- ERROR EVENT for ${ws.username || 'unidentified user'} ---`);
    console.error(`Server: WebSocket error for ${ws.username || 'unidentified user'}: ${err.message}`);
    // Event 'close' biasanya akan dipanggil setelah 'error'.
    // Tidak perlu terminate() di sini kecuali ada kasus khusus.
  });
});

// ======= Setup gRPC (Tetap sama) =======
// ... (kode gRPC tidak diubah, asumsikan sudah benar) ...
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const pingpong = proto.pingpong;
let grpcClientInstance;
try {
    grpcClientInstance = new pingpong.PingPongService('localhost:50051', grpc.credentials.createInsecure());
} catch (e) {
    console.error("Failed to create gRPC client instance.", e);
}
function pingGrpc() {
  return new Promise((resolve, reject) => {
    if (!grpcClientInstance) return reject(new Error("gRPC client not initialized"));
    grpcClientInstance.Ping({ message: 'ping' }, (err, response) => {
      if (err) return reject(err);
      resolve(response.message);
    });
  });
}
const grpcServer = new grpc.Server();
grpcServer.addService(pingpong.PingPongService.service, {
  Ping: (call, callback) => { callback(null, { message: 'pong' }); },
});

// ======= REST API (Tetap sama) =======
app.get('/ping', (req, res) => { res.send('pong'); });
app.get('/compare', async (req, res) => {
  const results = { websocket: 'use client for WS timing' };
  try {
    const startRest = Date.now();
    await fetch(`https://localhost:${PORT}/ping`, { agent: new https.Agent({ rejectUnauthorized: false }) });
    results.rest = `${Date.now() - startRest}ms`;
  } catch (err) { console.error("REST ping failed:", err.message); results.rest = `Error: ${err.message}`; }
  try {
    const startGrpc = Date.now();
    await pingGrpc();
    results.grpc = `${Date.now() - startGrpc}ms`;
  } catch (err) { console.error("gRPC ping failed:", err.message); results.grpc = `Error: ${err.message}`; }
  res.json(results);
});

// ======= Mulai Server & Upgrade Handler (Tetap sama) =======
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
grpcServer.bindAsync('localhost:50051', grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) { console.error("Failed to bind gRPC server:", err); return; }
    console.log(`gRPC Server running at http://localhost:${port}`);
    grpcServer.start();
    server.listen(PORT, () => {
      console.log(`HTTPS & WebSocket Server running at https://localhost:${PORT}`);
      if (SERVER_ANNOUNCEMENT_INTERVAL_MS > 0 && !globalAnnouncementIntervalId) {
          globalAnnouncementIntervalId = setInterval(broadcastGlobalServerAnnouncement, SERVER_ANNOUNCEMENT_INTERVAL_MS);
          console.log(`Server: Started broadcasting global announcements every ${SERVER_ANNOUNCEMENT_INTERVAL_MS / 1000} seconds.`);
      }
    });
});

// Implementasi gracefulShutdown (dari kode sebelumnya, tidak diubah)
function gracefulShutdown() {
    console.log('Shutting down servers...');
    if (globalAnnouncementIntervalId) clearInterval(globalAnnouncementIntervalId);
    clientIntervals.forEach(intervals => { // Clear semua interval klien
        if (intervals.heartbeat) clearInterval(intervals.heartbeat);
    });
    clientIntervals.clear();

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.close(1001, 'Server is shutting down');
        }
        client.terminate(); // Paksa tutup jika belum tertutup
    });

    wss.close(() => {
        console.log('WebSocket server closed.');
        grpcServer.tryShutdown(() => {
            console.log('gRPC server closed.');
            server.close(() => {
                console.log('HTTPS server closed.');
                process.exit(0);
            });
        });
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}