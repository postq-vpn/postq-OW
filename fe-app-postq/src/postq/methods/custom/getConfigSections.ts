import { PostQ } from '../../types';

export async function getConfigSections(): Promise<PostQ.ConfigSection[]> {
  return uci.load('postq').then(() => uci.sections('postq'));
}
