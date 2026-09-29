import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { XmovActionsController } from './xmov-actions.controller';
import { XmovActionsService } from './xmov-actions.service';

describe('XmovActionsController', () => {
  it('returns only the stable normalized actions object from the service', async () => {
    const result = {
      actions: [{
        semantic: 'PointingSelf',
        name: 'PointingSelf',
        cnName: '指向自己',
        type: 'body_action',
        rawName: 'M_CN03_show03__PointingSelf',
      }],
    };
    const listActions = jest.fn().mockResolvedValue(result);
    const service = { listActions } as unknown as XmovActionsService;
    const controller = new XmovActionsController(service);

    await expect(controller.listActions()).resolves.toEqual(result);
    expect(listActions).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('error_code');
    expect(result).not.toHaveProperty('error_reason');
  });

  it('declares GET xmov/actions route metadata', () => {
    expect(Reflect.getMetadata(PATH_METADATA, XmovActionsController)).toBe('xmov');
    expect(Reflect.getMetadata(
      PATH_METADATA,
      XmovActionsController.prototype.listActions,
    )).toBe('actions');
    expect(Reflect.getMetadata(
      METHOD_METADATA,
      XmovActionsController.prototype.listActions,
    )).toBe(RequestMethod.GET);
  });
});
