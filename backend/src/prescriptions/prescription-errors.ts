import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export const prescriptionNotFound = () =>
  new NotFoundException({
    code: 'PRESCRIPTION_NOT_FOUND',
    message: 'Ordonnance introuvable.',
  });

export const prescriptionConflict = (code: string, message: string) =>
  new ConflictException({ code, message });

export const prescriptionForbidden = (code: string, message: string) =>
  new ForbiddenException({ code, message });

export const prescriptionBadRequest = (code: string, message: string) =>
  new BadRequestException({ code, message });
