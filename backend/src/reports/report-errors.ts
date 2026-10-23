import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export const reportNotFound = () =>
  new NotFoundException({
    code: 'REPORT_NOT_FOUND',
    message: 'Rapport introuvable.',
  });

export const reportConflict = (code: string, message: string) =>
  new ConflictException({ code, message });

export const reportForbidden = (code: string, message: string) =>
  new ForbiddenException({ code, message });

export const reportBadRequest = (code: string, message: string) =>
  new BadRequestException({ code, message });
