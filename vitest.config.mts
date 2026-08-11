import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Os testes de domínio (tests/domain, tests/financial) são puros e rodam sem
 * banco. Os de integração (tests/e2e) exigem PostgreSQL com as migrations
 * aplicadas no banco de TESTE — nunca no de desenvolvimento, porque limpam
 * tabelas entre execuções.
 */
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://airflow:airflow@127.0.0.1:5432/airflow_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Um banco compartilhado não tolera arquivos concorrentes truncando tabelas.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      AUTH_SECRET: "test-secret-com-mais-de-32-caracteres-para-passar",
      PAYMENT_PROVIDER: "sandbox",
      SANDBOX_WEBHOOK_SECRET: "whsec_test_0123456789",
      N8N_WEBHOOK_URL: "http://127.0.0.1:9/webhook/airflow-events",
      N8N_WEBHOOK_SECRET: "test-n8n-outbound-secret-0123456789",
      BACKEND_WEBHOOK_SECRET: "test-backend-inbound-secret-0123456789",
      NODE_ENV: "test",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
