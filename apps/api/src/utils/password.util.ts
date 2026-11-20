import bcrypt from 'bcrypt';

/** bcrypt compare that treats accounts without a password (Google/Apple sign-up) as "no match". */
export async function verifyPassword(plain: string, hash: string | null | undefined) {
  return hash ? bcrypt.compare(plain, hash) : false;
}
