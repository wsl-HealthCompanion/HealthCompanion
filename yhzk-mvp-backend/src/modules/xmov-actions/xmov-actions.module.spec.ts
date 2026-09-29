import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../app.module';
import { XmovActionsClient } from './xmov-actions.client';
import { XmovActionsController } from './xmov-actions.controller';
import { XmovActionsModule } from './xmov-actions.module';
import { XmovActionsService } from './xmov-actions.service';

describe('XmovActionsModule wiring', () => {
  it('registers XmovActionsModule in AppModule imports', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports).toContain(XmovActionsModule);
  });

  it('provides and exports the client and normalized actions service', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      XmovActionsModule,
    ) as unknown[];
    const exports = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      XmovActionsModule,
    ) as unknown[];

    expect(providers).toEqual(
      expect.arrayContaining([XmovActionsClient, XmovActionsService]),
    );
    expect(exports).toEqual(
      expect.arrayContaining([XmovActionsClient, XmovActionsService]),
    );
  });

  it('registers the stable actions controller', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      XmovActionsModule,
    ) as unknown[];

    expect(controllers).toContain(XmovActionsController);
  });
});
