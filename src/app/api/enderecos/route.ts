import { NextResponse } from "next/server";

import { parseJsonBody, withApiHandler } from "@/lib/api";
import { createAddressSchema } from "@/lib/validation/address";
import { requireCustomer } from "@/server/auth/rbac";
import { prisma } from "@/server/db/prisma";

export const POST = withApiHandler<[Request]>(async (_ctx, request) => {
  const session = await requireCustomer();
  const input = await parseJsonBody(request, createAddressSchema);

  // Se a cidade informada existe no catálogo, vincula — habilita busca por
  // cidade e as landings de SEO. Caso contrário guarda apenas o texto.
  const cidade =
    input.cityId ??
    (
      await prisma.city.findFirst({
        where: {
          name: { equals: input.cityName, mode: "insensitive" },
          state: input.state,
        },
        select: { id: true },
      })
    )?.id;

  const address = await prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.address.updateMany({
        where: { userId: session.userId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const jaTemEndereco = await tx.address.count({
      where: { userId: session.userId, deletedAt: null },
    });

    return tx.address.create({
      data: {
        userId: session.userId,
        label: input.label,
        street: input.street,
        number: input.number,
        complement: input.complement,
        neighborhood: input.neighborhood,
        cityId: cidade,
        cityName: input.cityName,
        state: input.state,
        postalCode: input.postalCode,
        latitude: input.latitude,
        longitude: input.longitude,
        // O primeiro endereço é sempre o padrão
        isDefault: input.isDefault || jaTemEndereco === 0,
      },
    });
  });

  return NextResponse.json({ address }, { status: 201 });
});
