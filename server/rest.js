const express = require('express');
const app = express();
const PORT = 8080;

app.get('/ping', (req, res) => {
  res.send('pong');
});

app.listen(PORT, () => {
  console.log(`REST server running at http://localhost:${PORT}`);
});