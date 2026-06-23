import { Server } from 'socket.io'

const PORT = 3003

const io = new Server(PORT, {
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

console.log(`[SnapJe Real-time] Socket.io server running on port ${PORT}`)
