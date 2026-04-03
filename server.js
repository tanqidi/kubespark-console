/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("http")
const next = require("next")
const { WebSocketServer, WebSocket } = require("ws")

const hasArg = (name) => process.argv.includes(name)
const isDev = hasArg("--dev") || (!hasArg("--prod") && process.env.NODE_ENV !== "production")
const hostname = "0.0.0.0"
const port = Number(process.env.PORT || 3000)

const upstreamBase = process.env.KUBESPARK_API_BASE || "http://172.31.0.88:8080"
const wsUpstreamBase = upstreamBase.replace(/^http:/, "ws:").replace(/^https:/, "wss:")

const app = next({ dev: isDev, hostname, port })
const handle = app.getRequestHandler()

function buildWsTarget(reqUrl) {
  const prefix = "/api/kubespark-ws"
  const path = reqUrl.startsWith(prefix) ? reqUrl.slice(prefix.length) : reqUrl
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  return `${wsUpstreamBase}${normalizedPath}`
}

app.prepare().then(() => {
  const handleUpgrade = app.getUpgradeHandler()
  const server = http.createServer((req, res) => handle(req, res))
  const wss = new WebSocketServer({ noServer: true })

  server.on("upgrade", (req, socket, head) => {
    if (!req.url) {
      socket.destroy()
      return
    }
    if (!req.url.startsWith("/api/kubespark-ws/")) {
      handleUpgrade(req, socket, head)
      return
    }

    wss.handleUpgrade(req, socket, head, (clientSocket) => {
      const target = buildWsTarget(req.url)
      const upstreamSocket = new WebSocket(target)

      upstreamSocket.on("open", () => {
        clientSocket.on("message", (data, isBinary) => {
          if (upstreamSocket.readyState === WebSocket.OPEN) {
            upstreamSocket.send(data, { binary: isBinary })
          }
        })

        upstreamSocket.on("message", (data, isBinary) => {
          if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(data, { binary: isBinary })
          }
        })
      })

      clientSocket.on("close", () => {
        if (upstreamSocket.readyState === WebSocket.OPEN) upstreamSocket.close()
      })
      upstreamSocket.on("close", () => {
        if (clientSocket.readyState === WebSocket.OPEN) clientSocket.close()
      })

      upstreamSocket.on("error", (err) => {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(JSON.stringify({ op: "error", message: `upstream websocket error: ${err.message}` }))
          clientSocket.close()
        }
      })
      clientSocket.on("error", () => {
        if (upstreamSocket.readyState === WebSocket.OPEN) upstreamSocket.close()
      })
    })
  })

  server.listen(port, hostname, () => {
    console.log(`> Server ready on http://${hostname}:${port} (dev=${isDev})`)
    console.log(`> WS proxy: /api/kubespark-ws/* -> ${wsUpstreamBase}/*`)
  })
})
