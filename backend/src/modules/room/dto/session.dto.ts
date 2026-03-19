import { Transform } from "class-transformer";
import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";
import { Role } from "@prisma/client";

/**
 * 방 생성 및 참여 공통 DTO
 * - @Transform: trim() 후 검증하여 공백만 있는 닉네임을 MinLength에서 차단
 * - ValidationPipe가 nickname 길이와 role 열거형을 자동 검증한다
 */
export class SessionDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: "Nickname must be at least 2 characters" })
  @MaxLength(20, { message: "Nickname must be 20 characters or fewer" })
  nickname!: string;

  @IsEnum(Role, { message: "Role must be speaker, deaf, or guest" })
  role!: Role;
}
