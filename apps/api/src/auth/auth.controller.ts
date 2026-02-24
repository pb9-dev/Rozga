import { Body, Controller, Get, Post, UseGuards, Version } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, type AuthUser } from './current-user.decorator';

@Controller({ path: 'auth' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Version('1')
  async login(@Body() dto: LoginDto) {
    const tokens = await this.auth.login(dto);
    return tokens;
  }

  @Post('refresh')
  @Version('1')
  async refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: AuthUser, @Body() dto: LogoutDto) {
    await this.auth.logout({ userId: user.sub, tenantId: user.tenantId, refreshToken: dto.refreshToken });
    return { ok: true };
  }

  @Get('me')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
