const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const packageDefinition = protoLoader.loadSync('proto/pingpong.proto');
const proto = grpc.loadPackageDefinition(packageDefinition);

const server = new grpc.Server();
server.addService(proto.PingPong.service, {
  Ping: (call, callback) => {
    callback(null, { message: 'pong' });
  },
});

server.bindAsync('0.0.0.0:50051', grpc.ServerCredentials.createInsecure(), () => {
  console.log('gRPC server running at http://localhost:50051');
  server.start();
});