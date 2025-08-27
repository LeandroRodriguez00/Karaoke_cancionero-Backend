import mongoose from 'mongoose';

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ Falta MONGO_URI en el .env');
    process.exit(1);
  }
  try {
    await mongoose.connect(uri, {
      retryWrites: true,
      w: 'majority'
    });
    console.log('✅ Conectado a MongoDB');
  } catch (err) {
    console.error('❌ Error conectando a MongoDB:', err.message);
    process.exit(1);
  }
}
