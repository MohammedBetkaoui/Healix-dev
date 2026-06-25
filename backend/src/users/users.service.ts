import { ConflictException, Injectable } from '@nestjs/common';

import { type Prisma, type User } from '@prisma/client';
import { type AccountStatus } from '../common/enums/account-status.enum';
import { type UserRole } from '../common/enums/user-role.enum';
import { type PublicUser, toPublicUser } from '../common/utils/public-user';
import { PrismaService } from '../prisma/prisma.service';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateUserInput = {
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  accountStatus: AccountStatus;
};

const authUserSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  passwordHash: true,
  role: true,
  accountStatus: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type AuthUser = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureEmailAndPhoneAvailable(
    email: string,
    phone: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<void> {
    const existingEmail = await client.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingEmail) {
      throw new ConflictException('Cet email est déjà utilisé.');
    }

    const existingPhone = await client.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (existingPhone) {
      throw new ConflictException('Ce numéro de téléphone est déjà utilisé.');
    }
  }

  async createUser(
    input: CreateUserInput,
    client: PrismaExecutor = this.prisma,
  ): Promise<User> {
    return client.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: input.role,
        accountStatus: input.accountStatus,
        isEmailVerified: false,
        isPhoneVerified: false,
      },
    });
  }

  async findAuthUserByEmail(
    email: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<AuthUser | null> {
    return client.user.findUnique({
      where: { email },
      select: authUserSelect,
    });
  }

  async findAuthUserById(
    id: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<AuthUser | null> {
    return client.user.findUnique({
      where: { id },
      select: authUserSelect,
    });
  }

  async findPublicUserById(
    id: string,
    client: PrismaExecutor = this.prisma,
  ): Promise<PublicUser | null> {
    const user = await client.user.findUnique({
      where: { id },
    });

    return user ? toPublicUser(user) : null;
  }
}
