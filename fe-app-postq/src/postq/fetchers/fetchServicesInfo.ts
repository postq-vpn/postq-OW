import { PostQShellMethods } from '../methods';
import { store } from '../services';

export async function fetchServicesInfo() {
  const [postq, singbox] = await Promise.all([
    PostQShellMethods.getStatus(),
    PostQShellMethods.getSingBoxStatus(),
  ]);

  if (!postq.success || !singbox.success) {
    store.set({
      servicesInfoWidget: {
        loading: false,
        failed: true,
        data: { singbox: 0, postq: 0 },
      },
    });
  }

  if (postq.success && singbox.success) {
    store.set({
      servicesInfoWidget: {
        loading: false,
        failed: false,
        data: {
          singbox: singbox.data.running,
          postq: postq.data.enabled,
        },
      },
    });
  }
}
