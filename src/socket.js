// server/src/socket.js
export default function registerSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id)
    socket.compress(true) // paquetes comprimidos

    // Helper: join idempotente (evita repetir joins/logs)
    const joinIfNotIn = (room) => {
      if (!socket.rooms?.has?.(room)) socket.join(room)
    }

    // Rol por defecto
    socket.data.role = 'public'
    joinIfNotIn('public')

    // Identificación opcional del cliente: { role: 'admin' | 'public' }
    socket.on('identify', (payload = {}) => {
      try {
        const raw = String(payload?.role || '').toLowerCase()
        const room = raw === 'admin' ? 'admins' : 'public'

        // Idempotente: si ya está en esa sala, solo ACK (sin re-join ni log)
        if (socket.data.role === room) {
          socket.emit('identify:ack', { room })
          return
        }

        // Cambió de rol → salir de la sala anterior y entrar a la nueva
        if (socket.data.role) socket.leave(socket.data.role)
        joinIfNotIn(room)
        socket.data.role = room
        console.log(`👤 ${socket.id} unido a sala: ${room}`)
        socket.emit('identify:ack', { room })
      } catch {
        // noop
      }
    })

    // Suscripción a un canal de pedidos (idempotente)
    socket.on('subscribe:requests', () => {
      if (!socket.rooms?.has?.('requests')) {
        socket.join('requests')
      }
      socket.emit('subscribe:ack', { room: 'requests' })
    })

    // Ping/pong para medir latencia
    socket.on('ping:client', () => {
      socket.emit('pong:server', { at: new Date().toISOString() })
    })

    socket.on('disconnect', (reason) => {
      console.log('🔌 Cliente desconectado:', socket.id, 'reason:', reason)
    })
  })

  // ----- Helpers para usar desde rutas/controladores -----
  // Ej: req.app.get('io').adminNotify('request:new', payload)
  io.adminNotify    = (event, payload) => io.to('admins').emit(event, payload)
  io.publicNotify   = (event, payload) => io.to('public').emit(event, payload)
  io.requestsNotify = (event, payload) => io.to('requests').emit(event, payload)
  // 👉 Emite una sola vez a ambas salas (admins + requests) sin duplicar receptores
  io.requestWatchersNotify = (event, payload) => io.to(['admins', 'requests']).emit(event, payload)
  io.allNotify      = (event, payload) => io.emit(event, payload)
}
