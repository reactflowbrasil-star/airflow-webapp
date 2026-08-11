import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function configured(name: string): boolean {
  return Boolean(process.env[name]);
}

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "airflow-webapp",
    timestamp: new Date().toISOString(),
    env: {
      database: configured("DATABASE_URL"),
      auth: configured("AUTH_SECRET"),
      paymentProvider: process.env.PAYMENT_PROVIDER ?? "sandbox",
      n8n: configured("N8N_WEBHOOK_URL") && configured("N8N_WEBHOOK_SECRET"),
      backendWebhook: configured("BACKEND_WEBHOOK_SECRET"),
    },
  });
}
