import 'dotenv/config.js';
import mongoose from 'mongoose';
import Song from '../src/models/Song.js';

const { MONGO_URI } = process.env;

await mongoose.connect(MONGO_URI);
await Song.syncIndexes();
console.log('✅ Índices sincronizados');
await mongoose.disconnect();