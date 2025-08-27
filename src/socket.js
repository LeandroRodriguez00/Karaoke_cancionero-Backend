export default function registerSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);

    socket.on('disconnect', (reason) => {
      console.log('🔌 Cliente desconectado:', socket.id, 'reason:', reason);
    });
  });
}
