import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { type Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type AuthenticatedUserPayload } from '../auth/types/authenticated-request.type';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { VerifiedAccountGuard } from '../common/guards/verified-account.guard';
import { AiAnalysisRunsService } from './ai-analysis-runs.service';
import { AiServiceClient } from './ai-service.client';
import { CreateAiAnalysisRunDto } from './dto/create-ai-analysis-run.dto';
import { DecideAiAnalysisRunDto } from './dto/decide-ai-analysis-run.dto';
import { AiAnalysisReportsService } from './report/ai-analysis-reports.service';
import { CardioEvaluationService } from './report/cardio-evaluation';

// Same guards as the patient record the runs belong to.
@Controller('patients/:id/ai-analysis-runs')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class AiAnalysisRunsController {
  constructor(
    private readonly runsService: AiAnalysisRunsService,
    private readonly reportsService: AiAnalysisReportsService,
  ) {}

  // Synchronous: answers once the service is done (60 s at most).
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Body() dto: CreateAiAnalysisRunDto,
  ) {
    return this.runsService.create(user, id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUserPayload, @Param('id') id: string) {
    return this.runsService.list(user, id);
  }

  @Get(':runId')
  findOne(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
  ) {
    return this.runsService.findOne(user, id, runId);
  }

  // The physician's final decision (409 if already decided or not SUCCEEDED).
  @Post(':runId/decision')
  decide(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Body() dto: DecideAiAnalysisRunDto,
  ) {
    return this.runsService.decide(user, id, runId, dto);
  }

  // The PDF report of a validated or corrected run: generated on the first
  // request, then served as stored (409 AI_REPORT_NOT_AVAILABLE otherwise).
  // Named after its number only: no patient identity in the file name.
  @Get(':runId/report')
  async report(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const report = await this.reportsService.getReport(user, id, runId);

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(report.pdf.length));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.fileName}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(report.pdf);
  }

  // Same headers as GET /patients/:id/documents/:documentId/view.
  @Get(':runId/mask')
  async mask(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const mask = await this.runsService.getMask(user, id, runId);

    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(mask.png.length));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(mask.fileName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(mask.png);
  }

  // The colour overlay of a nuclei segmentation; same headers as /mask.
  @Get(':runId/overlay')
  async overlay(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const overlay = await this.runsService.getOverlay(user, id, runId);

    response.setHeader('Content-Type', 'image/png');
    response.setHeader('Content-Length', String(overlay.png.length));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(overlay.fileName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(overlay.png);
  }

  // The trace of an ECG analysis (JSON: rate, unit, samples per lead); same
  // headers and scope check as /mask.
  @Get(':runId/ecg-trace')
  async ecgTrace(
    @CurrentUser() user: AuthenticatedUserPayload,
    @Param('id') id: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const trace = await this.runsService.getEcgTrace(user, id, runId);

    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Content-Length', String(trace.json.length));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(trace.fileName)}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(trace.json);
  }
}

@Controller('ai-models')
@UseGuards(JwtAuthGuard, RolesGuard, VerifiedAccountGuard)
export class AiModelsController {
  constructor(
    private readonly aiServiceClient: AiServiceClient,
    private readonly cardioEvaluationService: CardioEvaluationService,
  ) {}

  // Relays GET /models of the inference service; the token never leaves.
  @Get('status')
  status() {
    return this.aiServiceClient.getStatus();
  }

  // The measured performance of the ECG model for these weights: the
  // service's own evaluation, else the training notebook's (model card);
  // null when neither describes them.
  @Get('cardio-ecg/evaluation/:weightsSha256')
  async cardioEvaluation(@Param('weightsSha256') weightsSha256: string) {
    return {
      evaluation: await this.cardioEvaluationService.find(weightsSha256),
    };
  }
}
