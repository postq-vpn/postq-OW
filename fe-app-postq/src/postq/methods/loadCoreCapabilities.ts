import {
  parseCoreCapabilities,
  setCoreCapabilities,
} from '../../helpers/coreCapabilities';
import { PostQShellMethods } from './shell';

// Asks the backend what the installed core can do and remembers the answer for the
// validators and hints of the pages. Never fails: without an answer everything
// counts as available.
export async function loadCoreCapabilities() {
  try {
    const reply = await PostQShellMethods.getCoreCapabilities();

    if (reply.success) {
      setCoreCapabilities(parseCoreCapabilities(reply.data));
    }
  } catch {
    // the defaults stay
  }
}
