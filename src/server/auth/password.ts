import bcrypt from "bcryptjs";

/**
 * Custo 12: ~250ms por hash em hardware atual. Suficiente para tornar
 * ataque de força bruta offline caro sem inviabilizar o login.
 */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
