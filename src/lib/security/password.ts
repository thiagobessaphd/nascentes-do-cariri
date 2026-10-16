import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'A senha deve conter no mínimo 8 caracteres')
  .max(128, 'A senha deve conter no máximo 128 caracteres');

export const BCRYPT_SALT_ROUNDS = 12;

/**
 * Gera hash criptográfico seguro usando bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  const parsedPassword = passwordSchema.parse(password);
  return bcrypt.hash(parsedPassword, BCRYPT_SALT_ROUNDS);
}

/**
 * Compara uma senha em texto puro com o hash persistido.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}
