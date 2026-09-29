import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XmovActionsClient } from './xmov-actions.client';
import { XmovActionsController } from './xmov-actions.controller';
import { XmovActionsService } from './xmov-actions.service';

@Module({
  imports: [ConfigModule],
  controllers: [XmovActionsController],
  providers: [XmovActionsClient, XmovActionsService],
  exports: [XmovActionsClient, XmovActionsService],
})
export class XmovActionsModule {}
