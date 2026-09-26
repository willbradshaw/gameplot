/**
 * Terminal interaction for scrapers that need a human in the loop.
 */

import { input, confirm as inquirerConfirm, password } from '@inquirer/prompts';

/** Ask for a line of text. */
export const ask = (message) => input({ message });

/** Ask for a secret; keystrokes are masked. */
export const askSecret = (message) => password({ message, mask: true });

/** Yes/no question, defaulting to yes. */
export const confirm = (message) => inquirerConfirm({ message, default: true });

/** Wait until the user confirms they have done something. */
export async function pause(message) {
  while (!(await confirm(message))) {
    // Keep asking until they say yes.
  }
}

/**
 * Open a URL in the default browser. Falls back to printing the URL if the
 * browser can't be launched (headless machine, no display, ...).
 * @param {string} url
 * @param {import('consola').ConsolaInstance} log
 */
export async function openInBrowser(url, log) {
  try {
    const { default: open } = await import('open');
    await open(url);
    log.info(`Opened ${url} in your browser`);
  } catch {
    log.info(`Please open this URL in your browser:\n  ${url}`);
  }
}
