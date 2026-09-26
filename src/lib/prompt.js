/**
 * Terminal interaction helpers for scrapers that need a human in the loop.
 */

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

/**
 * Ask a question on the terminal and return the trimmed answer.
 * @param {string} question
 * @returns {Promise<string>}
 */
export async function ask(question) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

/**
 * Open a URL in the default browser. Falls back to printing the URL if the
 * browser can't be launched (headless machine, missing `open` package, ...).
 * @param {string} url
 * @param {{ info: Function }} log
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
