import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  buildDeviceCanonicalString,
  DEVICE_ID_HEADER,
  DEVICE_NONCE_HEADER,
  DEVICE_NONCE_TTL_SECONDS,
  DEVICE_SIGNATURE_ALGORITHM,
  DEVICE_SIGNATURE_HEADER,
  DEVICE_TIMESTAMP_HEADER,
  DEVICE_TIMESTAMP_WINDOW_SECONDS,
  sha256Hex,
  verifyDeviceSignature,
} from './device-proof';
import {
  type OfflineAuthenticatedRequest,
  type OfflineActor,
} from './offline-device.types';

type ProofRequest = OfflineAuthenticatedRequest & {
  rawBody?: unknown;
};

const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

@Injectable()
export class DeviceProofGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ProofRequest>();
    const actor: OfflineActor | undefined = request.offlineActor;
    if (!actor) {
      throw new UnauthorizedException('Grant offline requis.');
    }

    const deviceId = this.header(request, DEVICE_ID_HEADER);
    const timestamp = this.header(request, DEVICE_TIMESTAMP_HEADER);
    const nonce = this.header(request, DEVICE_NONCE_HEADER);
    const signature = this.header(request, DEVICE_SIGNATURE_HEADER);
    if (!deviceId || !timestamp || !nonce || !signature) {
      throw new UnauthorizedException(
        'En-têtes de signature device manquants.',
      );
    }

    if (deviceId !== actor.deviceId) {
      throw new UnauthorizedException(
        'La signature ne correspond pas au device du grant.',
      );
    }
    if (!NONCE_PATTERN.test(nonce)) {
      throw new UnauthorizedException('Nonce device invalide.');
    }

    const requestTimestamp = Number(timestamp);
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      !Number.isInteger(requestTimestamp) ||
      Math.abs(nowSeconds - requestTimestamp) >
        DEVICE_TIMESTAMP_WINDOW_SECONDS
    ) {
      throw new UnauthorizedException(
        'Horodatage device hors fenêtre acceptée.',
      );
    }

    const device = await this.prisma.offlineDevice.findUnique({
      where: { id: actor.deviceId },
      select: { publicKey: true, revokedAt: true },
    });
    if (!device || device.revokedAt) {
      throw new UnauthorizedException('Appareil introuvable ou révoqué.');
    }

    // PATH without query (globals.noquery) — same canonical on both sides.
    const path = request.originalUrl?.split('?')[0] ?? request.url.split('?')[0];
    const body = Buffer.isBuffer(request.rawBody)
      ? (request.rawBody as Buffer)
      : Buffer.alloc(0);
    const canonical = buildDeviceCanonicalString({
      method: request.method,
      path,
      timestamp: requestTimestamp,
      nonce,
      bodySha256: sha256Hex(body),
      deviceId,
    });
    if (
      !(await verifyDeviceSignature({
        publicKeyPem: device.publicKey,
        canonical,
        signatureBase64: signature,
      }))
    ) {
      throw new UnauthorizedException(
        `Signature device invalide (${DEVICE_SIGNATURE_ALGORITHM}).`,
      );
    }

    return this.consumeNonce(actor.deviceId, nonce, now);
  }

  // Replay protection: the nonce is inserted after the signature is verified,
  // so a replayed request fails on the unique key instead of being processed
  // twice. The table is durable (verifies across backend instances).
  private async consumeNonce(
    deviceId: string,
    nonce: string,
    now: Date,
  ): Promise<boolean> {
    const expiresAt = new Date(now.getTime() + DEVICE_NONCE_TTL_SECONDS * 1000);
    try {
      await this.prisma.$transaction([
        this.prisma.deviceRequestNonce.deleteMany({
          where: { deviceId, expiresAt: { lt: now } },
        }),
        this.prisma.deviceRequestNonce.create({
          data: { nonce, deviceId, expiresAt },
        }),
      ]);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new UnauthorizedException('Requête rejouée (nonce déjà utilisé).');
      }
      throw error;
    }
    return true;
  }

  private header(request: ProofRequest, name: string) {
    const value = request.headers?.[name];
    return Array.isArray(value) ? value[0] : value;
  }
}
