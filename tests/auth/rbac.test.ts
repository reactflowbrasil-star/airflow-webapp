import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSession: mocks.getSession,
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { PendingVerificationError, requireVerifiedSession } from "@/server/auth/rbac";

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireVerifiedSession", () => {
  it("aceita sessão pendente quando o banco já marcou o telefone como verificado", async () => {
    mocks.getSession.mockResolvedValue({
      userId: "u1",
      email: "teste@exemplo.com",
      role: "CUSTOMER",
      status: "PENDING_VERIFICATION",
    });
    mocks.findUnique.mockResolvedValue({
      status: "ACTIVE",
      phoneVerifiedAt: new Date(),
    });

    await expect(requireVerifiedSession()).resolves.toMatchObject({
      userId: "u1",
      status: "ACTIVE",
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { status: true, phoneVerifiedAt: true },
    });
  });

  it("continua bloqueando quando o telefone ainda não foi verificado", async () => {
    mocks.getSession.mockResolvedValue({
      userId: "u1",
      email: "teste@exemplo.com",
      role: "CUSTOMER",
      status: "PENDING_VERIFICATION",
    });
    mocks.findUnique.mockResolvedValue({
      status: "PENDING_VERIFICATION",
      phoneVerifiedAt: null,
    });

    await expect(requireVerifiedSession()).rejects.toBeInstanceOf(
      PendingVerificationError,
    );
  });

  it("não consulta o banco quando a sessão já está ativa", async () => {
    mocks.getSession.mockResolvedValue({
      userId: "u1",
      email: "teste@exemplo.com",
      role: "CUSTOMER",
      status: "ACTIVE",
    });

    await expect(requireVerifiedSession()).resolves.toMatchObject({
      status: "ACTIVE",
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
