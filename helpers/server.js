const express = require('express')
const path = require('path')
const http = require('http')
const cors = require('cors')

// SERVER CONFIG
const PORT = process.env.PORT || 5011
const app = express();
const server = http.createServer(app).listen(PORT, () => console.log(`Listening on ${PORT}\n`))
app.use(express.static(path.join(__dirname, 'public')))
app.use(cors({ credentials: true, origin: '*' }))