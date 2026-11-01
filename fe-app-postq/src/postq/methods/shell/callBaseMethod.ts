import { executeShellCommand } from '../../../helpers';
import { PostQ } from '../../types';

export async function callBaseMethod<T>(
  method: PostQ.AvailableMethods,
  args: string[] = [],
  command: string = '/usr/bin/postq',
  options: { nobatch?: boolean; timeout?: number } = {},
): Promise<PostQ.MethodResponse<T>> {
  const response = await executeShellCommand({
    command,
    args: [method as string, ...args],
    timeout: options.timeout ?? 15000,
    nobatch: options.nobatch,
  });

  if (response.stdout) {
    try {
      return {
        success: true,
        data: JSON.parse(response.stdout) as T,
      };
    } catch (_e) {
      return {
        success: true,
        data: response.stdout as T,
      };
    }
  }

  return {
    success: false,
    error: '',
  };
}
