import { Controller, Get } from '@nestjs/common';
import { XmovActionsService } from './xmov-actions.service';

@Controller('xmov')
export class XmovActionsController {
  constructor(private readonly actions: XmovActionsService) {}

  @Get('actions')
  listActions() {
    return this.actions.listActions();
  }
}
