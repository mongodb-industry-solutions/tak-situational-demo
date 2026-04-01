import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/chat`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch chat" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to send message" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Chat send error:", error);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
