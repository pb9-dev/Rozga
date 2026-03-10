import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAll(params: { tenantId: string }) {
    const { tenantId } = params;

    const [colleges, jobs, flows] = await Promise.all([
      this.prisma.college.findMany({
        where: { tenantId, campusBatches: { some: {} } },
        orderBy: [{ name: 'asc' }],
        select: { id: true, code: true, name: true },
      }),
      this.prisma.jobRequisition.findMany({
        where: { tenantId },
        orderBy: [{ createdAt: 'desc' }],
        select: { id: true, title: true },
      }),
      this.prisma.campusHiringFlow.findMany({
        where: { tenantId },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          name: true,
          version: true,
          isActive: true,
          collegeId: true,
          college: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    const filteredColleges = colleges.filter((c) => c.code !== 'ABC');

    return { colleges: filteredColleges, jobs, flows };
  }
}
