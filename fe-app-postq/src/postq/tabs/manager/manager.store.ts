import { StoreType } from '../../services';

export const initialManagerStore: Pick<
  StoreType,
  'managerActions' | 'managerChecks'
> = {
  managerActions: {
    postqCheck: { loading: false },
    postqUpdate: { loading: false },
    singBoxStockCheck: { loading: false },
    singBoxStockAction: { loading: false },
    singBoxExtendedCheck: { loading: false },
    singBoxExtendedAction: { loading: false },
    singBoxExtendedLiteCheck: { loading: false },
    singBoxExtendedLiteAction: { loading: false },
    naiveCheck: { loading: false },
    naiveAction: { loading: false },
  },
  managerChecks: {
    postq: { status: null, latest_version: '' },
    sing_box_stock: { status: null, latest_version: '' },
    sing_box_extended: { status: null, latest_version: '' },
    sing_box_extended_lite: { status: null, latest_version: '' },
    naive: { status: null, latest_version: '' },
  },
};
