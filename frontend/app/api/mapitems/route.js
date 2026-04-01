import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/mapitems`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch map items" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Mapitems fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch map items" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const res = await fetch(`${BACKEND_URL}/api/mapitems`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to place marker" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Mapitems place error:", error);
    return NextResponse.json({ error: "Failed to place marker" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    const res = await fetch(`${BACKEND_URL}/api/mapitems/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Failed to delete marker" }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Mapitems delete error:", error);
    return NextResponse.json({ error: "Failed to delete marker" }, { status: 500 });
  }
}
