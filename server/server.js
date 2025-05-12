const fs = require('fs');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

// ======= Konstanta =======
const PORT = 8443;
const MAX_CONNECTIONS = 5;
const HEARTBEAT_INTERVAL = 10000;
const VALID_TOKENS = ['token123', 'token456'];
const PROTO_PATH = path.join(__dirname, 'proto', 'pingpong.proto');

// ======= Setup Express dan HTTPS =======
const app = express();
app.use(express.static(path.join(__dirname, '../public')));

const server = https.createServer({
  key: fs.readFileSync(path.join(__dirname, '../certs/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '../certs/cert.pem')),
}, app);

// ======= Setup WebSocket (WSS) =======
const wss = new WebSocket.Server({ server });

const USERS = {
  user1: { password: 'pass1' },
  user2: { password: 'pass2' },
};

const connections = {}; // key: username, value: ws instance

wss.on('connection', function connection(ws, req) {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const username = params.get('username');
  const password = params.get('password');

  if (!USERS[username] || USERS[username].password !== password) {
    ws.close(1008, 'Unauthorized');
    return;
  }
    // Cek apakah sudah login
  if (connections[username]) {
    ws.close(1013, 'User already connected');
    return;
  }

  if (connections.length >= MAX_CONNECTIONS) {
    ws.close(1013, 'Too many connections');
    return;
  }

  ws.username = username;
  connections[username] = ws;
  ws.isAlive = true;

  console.log(`${username} connected`);
  ws.send(`Hello ${username}, you are connected.`);

  ws.isAlive = true;
  connections.push(ws);
  ws.send('Welcome to secure WebSocket server!');

  // Server inisiasi broadcast setiap 30 detik
  const broadcastInterval = setInterval(() => {
    ws.send('Server initiated message: Hello client!');
  }, 30000);

  // Heartbeat
  const interval = setInterval(() => {
    if (!ws.isAlive) {
      clearInterval(interval);
      ws.terminate();
      delete connections[username];
      return;
    }
    ws.isAlive = false;
    ws.ping();
  }, HEARTBEAT_INTERVAL);

  ws.on('pong', () => ws.isAlive = true);

  ws.on('message', function incoming(message) {
    try {
      const parsed = JSON.parse(message);
      const { to, text } = parsed;
      if (connections[to]) {
        connections[to].send(`[${username}]: ${text}`);
      } else {
        ws.send(`User ${to} not connected.`);
      }
    } catch (err) {
      ws.send('Invalid message format. Use JSON: {"to":"user2", "text":"hello"}');
    }
  });

  ws.on('close', () => {
    delete connections[username];
    console.log(`${username} disconnected`);
  });
});

// ======= Setup gRPC =======
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition);
const pingpong = proto.pingpong;

// gRPC client
const grpcClient = new pingpong.PingPongService('localhost:50051', grpc.credentials.createInsecure());

function pingGrpc() {
  return new Promise((resolve, reject) => {
    grpcClient.Ping({ message: 'ping' }, (err, response) => {
      if (err) return reject(err);
      resolve(response.message);
    });
  });
}

// gRPC server
const grpcServer = new grpc.Server();
grpcServer.addService(pingpong.PingPongService.service, {
  Ping: (call, callback) => {
    callback(null, { message: 'pong' });
  },
});
grpcServer.bindAsync('localhost:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC Server running at http://localhost:50051');
  grpcServer.start();
});

// ======= REST API =======
app.get('/ping', (req, res) => {
  res.send('pong');
});

// ======= Perbandingan Ping-Pong =======
app.get('/compare', async (req, res) => {
  try {
    const startRest = Date.now();
    await fetch(`https://localhost:${PORT}/ping`, { method: 'GET', agent: new (require('https').Agent)({ rejectUnauthorized: false }) });
    const timeRest = Date.now() - startRest;

    const startGrpc = Date.now();
    await pingGrpc();
    const timeGrpc = Date.now() - startGrpc;

    res.json({
      rest: `${timeRest}ms`,
      grpc: `${timeGrpc}ms`,
      websocket: 'use client for WS timing'
    });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ======= Mulai Server =======
server.listen(PORT, () => {
  console.log(`HTTPS & WebSocket Server running at https://localhost:${PORT}`);
});