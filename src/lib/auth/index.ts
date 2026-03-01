import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "./password";
import { verifyAccessToken, verifyRefreshToken } from "./jwt";
import { setAuthCookies, getAccessToken, getRefreshToken } from "./session";
import type { TokenPayload } from "./jwt";

export { clearAuthCookies } from "./session";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

export async function registerUser(
  email: string,
  password: string,
  name?: string
): Promise<AuthUser> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error("A user with this email already exists");
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
    },
    select: { id: true, email: true, name: true, role: true },
  });

  await setAuthCookies({ userId: user.id, role: user.role });
  return user;
}

export async function loginUser(
  email: string,
  password: string
): Promise<AuthUser> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Invalid email or password");
  }

  if (!user.isActive) {
    throw new Error("Account is deactivated");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid email or password");
  }

  await setAuthCookies({ userId: user.id, role: user.role });
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  // Try access token first
  const accessToken = await getAccessToken();
  if (accessToken) {
    try {
      const payload = verifyAccessToken(accessToken);
      return await getUserFromPayload(payload);
    } catch {
      // Access token expired, try refresh
    }
  }

  // Try refresh token
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const user = await getUserFromPayload(payload);
      if (user) {
        // Rotate tokens
        await setAuthCookies({ userId: user.id, role: user.role });
        return user;
      }
    } catch {
      // Refresh token also invalid
    }
  }

  return null;
}

async function getUserFromPayload(
  payload: TokenPayload
): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: payload.userId, isActive: true },
    select: { id: true, email: true, name: true, role: true },
  });
  return user;
}
