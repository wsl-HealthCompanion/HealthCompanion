import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XmovActionsClient } from './xmov-actions.client';

@Module({
  imports: [ConfigModule],
  providers: [XmovActionsClient],
  exports: [XmovActionsClient],
})
export class XmovActionsModule {}
