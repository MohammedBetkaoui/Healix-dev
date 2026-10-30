import { type PrismaService } from '../../../src/prisma/prisma.service';

// Reads the MySQL test database directly. The scenarios assert on what the
// Cloud really stores (rows, versions, durable operations), not only on the
// HTTP answers.

export class ServerProbe {
  constructor(private readonly db: PrismaService) {}

  consultations(patientId: string) {
    return this.db.patientConsultation.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
    });
  }

  consultation(id: string) {
    return this.db.patientConsultation.findUniqueOrThrow({ where: { id } });
  }

  prescriptions(patientId: string) {
    return this.db.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  prescription(id: string) {
    return this.db.prescription.findUniqueOrThrow({
      where: { id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  operations(deviceId: string) {
    return this.db.syncOperation.findMany({
      where: { deviceId },
      orderBy: { receivedAt: 'asc' },
    });
  }

  operation(operationId: string) {
    return this.db.syncOperation.findUnique({ where: { operationId } });
  }

  entityMaps(deviceId: string) {
    return this.db.syncEntityMap.findMany({ where: { deviceId } });
  }

  changes(workspaceId: string) {
    return this.db.syncChange.findMany({
      where: { workspaceId },
      orderBy: { sequence: 'asc' },
    });
  }

  device(id: string) {
    return this.db.offlineDevice.findUniqueOrThrow({ where: { id } });
  }
}
