import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createParamDecorator } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request } from 'express';

/** Guards every route that touches a user's funds or history. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

/** Injects the authenticated user, loaded by JwtStrategy.validate. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const request = ctx.switchToHttp().getRequest<Request & { user: User }>();
  return request.user;
});
