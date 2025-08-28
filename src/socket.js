// server/src/socket.js
export default function registerSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id)

    // Identificación opcional del cliente: { role: 'admin' | 'public' }
    // Sirve para, en el futuro, emitir solo a admins: io.to('admins').emit(...)
    socket.on('identify', (payload = {}) => {
      const role = (payload.role === 'admin') ? 'admins' : 'public'
      socket.join(role)
      socket.data.role = role
      console.log(`👤 ${socket.id} unido a sala: ${role}`)
      socket.emit('identify:ack', { room: role })
    })

    // Suscripción opcional a un canal de pedidos (para segmentar más fino si querés)
    socket.on('subscribe:requests', () => {
      socket.join('requests')
      socket.emit('subscribe:ack', { room: 'requests' })
    })

    // Ping/pong simple para ver latencia/actividad desde el front
    socket.on('ping:client', () => {
      socket.emit('pong:server', { at: new Date().toISOString() })
    })

    socket.on('disconnect', (reason) => {
      console.log('🔌 Cliente desconectado:', socket.id, 'reason:', reason)
    })
  })

  // Helpers opcionales para usar desde rutas/controladores si querés segmentar:
  // req.app.get('io').adminNotify('request:update', payload)
  io.adminNotify = (event, payload) => io.to('admins').emit(event, payload)
  io.requestsNotify = (event, payload) => io.to('requests').emit(event, payload)
}
