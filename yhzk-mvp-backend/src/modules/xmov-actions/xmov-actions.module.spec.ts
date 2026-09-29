import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from '../../app.module';
import { XmovActionsModule } from './xmov-actions.module';

describe('XmovActionsModule wiring', () => {
  it('registers XmovActionsModule in AppModule imports', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    expect(imports).toContain(XmovActionsModule);
  });
});
