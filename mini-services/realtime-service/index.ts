import { Server } from 'socket.io'
import { createServer } from 'http'

const PORT = 3003

const httpServer = createServer()

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
})

// Track connected users and their rooms
const userRooms: Map<string, Set<string>> = new Map()

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`)

  // User subscribes to their personal notification channel
  socket.on('user:subscribe', (userId: string) => {
    const room = `user:${userId}`
    socket.join(room)
    if (!userRooms.has(userId)) {
      userRooms.set(userId, new Set())
    }
    userRooms.get(userId)!.add(socket.id)
    console.log(`[Socket] User ${userId} subscribed to ${room}`)
  })

  // User subscribes to deal updates
  socket.on('deal:subscribe', (dealId: string) => {
    const room = `deal:${dealId}`
    socket.join(room)
    console.log(`[Socket] ${socket.id} subscribed to deal ${dealId}`)
  })

  // User unsubscribes from deal updates
  socket.on('deal:unsubscribe', (dealId: string) => {
    const room = `deal:${dealId}`
    socket.leave(room)
    console.log(`[Socket] ${socket.id} unsubscribed from deal ${dealId}`)
  })

  // Vendor subscribes to their vendor channel
  socket.on('vendor:subscribe', (vendorId: string) => {
    const room = `vendor:${vendorId}`
    socket.join(room)
    console.log(`[Socket] ${socket.id} subscribed to vendor ${vendorId}`)
  })

  // Admin subscribes to admin channel
  socket.on('admin:subscribe', () => {
    socket.join('admin')
    console.log(`[Socket] ${socket.id} subscribed to admin channel`)
  })

  // Handle deal stock updates (called by backend)
  socket.on('deal:stock_update', (data: { dealId: string; available: number; reserved: number }) => {
    io.to(`deal:${data.dealId}`).emit('deal:stock_update', data)
  })

  // Handle deal status changes
  socket.on('deal:status_change', (data: { dealId: string; status: string }) => {
    io.to(`deal:${data.dealId}`).emit('deal:status_change', data)
  })

  // Handle new notifications
  socket.on('notification:send', (data: { userId: string; notification: unknown }) => {
    io.to(`user:${data.userId}`).emit('notification:new', data.notification)
  })

  // Handle order status updates
  socket.on('order:status_update', (data: { userId: string; orderId: string; status: string }) => {
    io.to(`user:${data.userId}`).emit('order:status_update', data)
  })

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`)
    // Clean up user rooms tracking
    for (const [userId, sockets] of userRooms.entries()) {
      if (sockets.has(socket.id)) {
        sockets.delete(socket.id)
        if (sockets.size === 0) {
          userRooms.delete(userId)
        }
      }
    }
  })
})

// HTTP endpoint for server-to-server broadcast (called by the Next.js API route)
httpServer.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/broadcast') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        const { userIds, notification } = JSON.parse(body)
        if (userIds && Array.isArray(userIds) && notification) {
          let emitted = 0
          for (const userId of userIds) {
            io.to(`user:${userId}`).emit('notification:new', {
              ...notification,
              id: `broadcast_${Date.now()}_${userId}`,
              userId,
              read: false,
              createdAt: new Date().toISOString(),
            })
            emitted++
          }
          console.log(`[Socket] Broadcast emitted to ${emitted} users`)
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: true }))
      } catch (e) {
        console.error('[Socket] Broadcast parse error:', e)
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }))
      }
    })
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found' }))
  }
})

httpServer.listen(PORT)
console.log(`[SnapJe Real-time] Socket.io server running on port ${PORT}`)
