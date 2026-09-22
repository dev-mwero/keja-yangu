import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached = globalThis.mongooseCache ?? {
  conn: null,
  promise: null,
};

globalThis.mongooseCache = cached;

export async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("Missing MONGODB_URI environment variable.");
  }

  if (cached.conn) {
    return cached.conn;
  }

  cached.promise ??= mongoose.connect(mongoUri, {
    bufferCommands: false,
    maxPoolSize: 10,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
  });

  cached.conn = await cached.promise;
  return cached.conn;
}
