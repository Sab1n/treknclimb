import { connectDB } from '@/lib/db';
import Destination from '@/models/Destination';

export async function GET() {
  await connectDB();
  const count = await Destination.countDocuments();
  return Response.json({ connected: true, destinations: count });
}