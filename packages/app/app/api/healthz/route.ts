import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    service: 'artio-app',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}
