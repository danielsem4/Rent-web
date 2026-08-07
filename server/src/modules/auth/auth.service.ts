import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '../../shared/errors/AppError';
import type { IAuthRepository, SafeUser } from './auth.repository';
import type { LoginDto } from './auth.schema';

const TOKEN_TTL = '8h';

export class AuthService {
  constructor(private readonly repo: IAuthRepository) {}

  private sign(userId: number, role: string): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new AppError('JWT_SECRET is not configured', 500);
    }
    return jwt.sign({ userId, role }, secret, { expiresIn: TOKEN_TTL });
  }

  async login(dto: LoginDto): Promise<{ token: string; user: SafeUser }> {
    const user = await this.repo.findByEmail(dto.email);
    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = this.sign(user.id, user.role);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async getMe(userId: number): Promise<SafeUser> {
    const user = await this.repo.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  /** Re-issue a fresh token for an already-authenticated user. */
  refresh(userId: number, role: string): { token: string } {
    return { token: this.sign(userId, role) };
  }
}
