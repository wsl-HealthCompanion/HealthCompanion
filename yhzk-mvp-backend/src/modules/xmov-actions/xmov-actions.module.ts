import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XmovActionsClient } from './xmov-actions.client';
import { XmovActionsService } from './xmov-actions.service';

@Module({
  imports: [ConfigModule],
  providers: [XmovActionsClient, XmovActionsService],
  exports: [XmovActionsClient, XmovActionsService],
})
export class XmovActionsModule {}
